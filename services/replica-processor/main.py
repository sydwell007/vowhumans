"""Private capture validator and manifest builder for Photoreal Replicas.

This service never receives public object keys or browser credentials. The
control plane gives it short-lived signed GET URLs; it returns only safe quality
metrics and a manifest that points back to the private object keys.
"""
from __future__ import annotations

import hashlib
import hmac
import os
import tempfile
import time
from pathlib import Path
from typing import Literal

import cv2
import httpx
from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel, Field, HttpUrl

app = FastAPI(title="VowHumans Replica Processor", version="1.0.0")
MAX_CAPTURE_BYTES = int(os.getenv("REPLICA_MAX_CAPTURE_BYTES", str(300 * 1024 * 1024)))
FACE_SAMPLE_COUNT = int(os.getenv("REPLICA_FACE_SAMPLE_COUNT", "12"))


class ClipInput(BaseModel):
    segment_id: str
    segment_type: Literal["identity_reference", "idle", "listening", "speaking", "expression", "gesture", "calibration"]
    gesture_key: Literal["acknowledge", "explain", "emphasise", "reassure"] | None = None
    object_key: str = Field(min_length=5, max_length=900)
    object_url: HttpUrl
    sha256: str = Field(pattern=r"^[0-9a-f]{64}$")
    starts_neutral: bool = False
    ends_neutral: bool = False
    trim_start_ms: int | None = Field(default=None, ge=0)
    trim_end_ms: int | None = Field(default=None, gt=0)


class ProcessRequest(BaseModel):
    job_id: str
    profile_id: str
    clips: list[ClipInput] = Field(min_length=5, max_length=24)


def _require_key(value: str | None) -> None:
    expected = os.getenv("VOWHUMANS_INTERNAL_KEY", "")
    if not expected or not value or not hmac.compare_digest(expected, value):
        raise HTTPException(401, "Internal service key required")


def _download(url: str, expected_sha256: str) -> str:
    suffix = ".mp4" if ".mp4" in url.lower() else ".webm"
    fd, path = tempfile.mkstemp(suffix=suffix)
    digest = hashlib.sha256()
    received = 0
    try:
        with os.fdopen(fd, "wb") as output, httpx.stream("GET", url, timeout=120, follow_redirects=False) as response:
            response.raise_for_status()
            for chunk in response.iter_bytes(1024 * 1024):
                received += len(chunk)
                if received > MAX_CAPTURE_BYTES:
                    raise ValueError("CAPTURE_TOO_LARGE")
                digest.update(chunk)
                output.write(chunk)
        if digest.hexdigest() != expected_sha256:
            raise ValueError("CAPTURE_HASH_MISMATCH")
        return path
    except Exception:
        Path(path).unlink(missing_ok=True)
        raise


def _analyse(path: str, trim_start_ms: int | None = None, trim_end_ms: int | None = None) -> dict[str, object]:
    capture = cv2.VideoCapture(path)
    if not capture.isOpened():
        raise ValueError("CAPTURE_UNREADABLE")
    fps = float(capture.get(cv2.CAP_PROP_FPS) or 0)
    source_frame_count = int(capture.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
    width = int(capture.get(cv2.CAP_PROP_FRAME_WIDTH) or 0)
    height = int(capture.get(cv2.CAP_PROP_FRAME_HEIGHT) or 0)
    source_duration_ms = int((source_frame_count / fps) * 1000) if fps > 0 else 0
    start_ms = trim_start_ms or 0
    end_ms = trim_end_ms or source_duration_ms
    if fps <= 0 or start_ms < 0 or end_ms <= start_ms or end_ms > source_duration_ms + 1000:
        capture.release()
        raise ValueError("CAPTURE_CHAPTER_RANGE_INVALID")
    end_ms = min(end_ms, source_duration_ms)
    start_frame = max(0, round((start_ms / 1000) * fps))
    end_frame = min(source_frame_count, round((end_ms / 1000) * fps))
    frame_count = end_frame - start_frame
    if frame_count < 1:
        capture.release()
        raise ValueError("CAPTURE_CHAPTER_EMPTY")
    duration_ms = int((frame_count / fps) * 1000)
    face_cascade = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_frontalface_default.xml")
    sample_indexes = {start_frame + int(i * max(frame_count - 1, 0) / max(FACE_SAMPLE_COUNT - 1, 1)) for i in range(FACE_SAMPLE_COUNT)}
    detected = 0
    sampled = 0
    luminance: list[float] = []
    try:
        for index in sorted(sample_indexes):
            capture.set(cv2.CAP_PROP_POS_FRAMES, index)
            ok, frame = capture.read()
            if not ok:
                continue
            sampled += 1
            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            luminance.append(float(gray.mean()))
            faces = face_cascade.detectMultiScale(gray, scaleFactor=1.12, minNeighbors=5, minSize=(80, 80))
            if len(faces) == 1:
                detected += 1
    finally:
        capture.release()
    return {
        "fps": round(fps, 3), "frame_count": frame_count, "width": width, "height": height,
        "duration_ms": duration_ms, "face_detection_ratio": round(detected / sampled, 4) if sampled else 0,
        "mean_luminance": round(sum(luminance) / len(luminance), 2) if luminance else 0,
        "trim_start_ms": start_ms, "trim_end_ms": end_ms,
    }


def quality_checks(clips: list[dict[str, object]]) -> list[dict[str, object]]:
    min_height = min(int(clip["height"]) for clip in clips)
    min_fps = min(float(clip["fps"]) for clip in clips)
    min_face_ratio = min(float(clip["face_detection_ratio"]) for clip in clips)
    min_duration = min(int(clip["duration_ms"]) for clip in clips)
    return [
        {"code": "capture_resolution", "status": "passed" if min_height >= 720 else "failed", "measured_value": min_height, "threshold_value": 720, "unit": "px", "detail": {"recommended": "1080p"}},
        {"code": "capture_frame_rate", "status": "passed" if min_fps >= 24 else "failed", "measured_value": min_fps, "threshold_value": 24, "unit": "fps"},
        {"code": "single_face_continuity", "status": "passed" if min_face_ratio >= .75 else "failed", "measured_value": min_face_ratio, "threshold_value": .75, "unit": "ratio"},
        {"code": "clip_duration", "status": "passed" if min_duration >= 1000 else "failed", "measured_value": min_duration, "threshold_value": 1000, "unit": "ms"},
        {"code": "lip_sync_visual_review", "status": "not_tested", "detail": {"required": "GPU render plus accountable human review"}},
        {"code": "livekit_latency", "status": "not_tested", "detail": {"required": "Measured end-to-end room test on deployed GPU"}},
    ]


def state_for_clip(segment_type: str) -> str:
    return {"idle": "idle", "listening": "listening", "speaking": "speaking", "gesture": "speaking"}.get(segment_type, "idle")


@app.get("/health")
def health():
    return {"status": "ok", "processor": "capture-validation", "opencv": cv2.__version__, "stores_raw_media": False}


@app.post("/internal/v1/process")
def process_capture(payload: ProcessRequest, x_internal_key: str | None = Header(default=None)):
    _require_key(x_internal_key)
    started = time.perf_counter()
    analysed: list[dict[str, object]] = []
    downloaded: dict[tuple[str, str], str] = {}
    try:
        for clip in payload.clips:
            source_key = (clip.object_key, clip.sha256)
            path = downloaded.get(source_key)
            if path is None:
                path = _download(str(clip.object_url), clip.sha256)
                downloaded[source_key] = path
            metrics = _analyse(path, clip.trim_start_ms, clip.trim_end_ms)
            analysed.append({
                "segment_id": clip.segment_id,
                "key": f"{clip.segment_type}-{clip.gesture_key or clip.segment_id[:8]}",
                "state": state_for_clip(clip.segment_type),
                "gesture_key": clip.gesture_key,
                "object_key": clip.object_key,
                "sha256": clip.sha256,
                "starts_neutral": clip.starts_neutral,
                "ends_neutral": clip.ends_neutral,
                **metrics,
            })
    except (httpx.HTTPError, ValueError) as exc:
        raise HTTPException(422, str(exc)) from exc
    finally:
        for path in downloaded.values():
            Path(path).unlink(missing_ok=True)
    checks = quality_checks(analysed)
    manifest = {
        "schema_version": "vowhumans.replica.v1",
        "profile_id": payload.profile_id,
        "provider": "musetalk-video-replica",
        "preservation_contract": {
            "source_motion": "captured-performer-video",
            "dynamic_region": "mouth-and-immediate-lower-face-only",
            "synthetic_blink": False,
            "synthetic_body_motion": False,
        },
        "clips": analysed,
    }
    return {"manifest": manifest, "checks": checks, "processing_ms": round((time.perf_counter() - started) * 1000)}
