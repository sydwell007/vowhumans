"""Private capture validator and manifest builder for Photoreal Replicas.

This service never receives public object keys or browser credentials. The
control plane gives it short-lived signed GET URLs; it returns only safe quality
metrics and a manifest that points back to the private object keys.
"""
from __future__ import annotations

import hashlib
import hmac
import json
import os
import subprocess
import tempfile
import time
from pathlib import Path
from typing import Literal

import cv2
import httpx
from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel, Field, HttpUrl
from media_probe import probe_video
from timeline import infer_declared_source_duration, normalise_chapter_range

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
    source_duration_ms: int | None = Field(default=None, gt=0)
    duration_ms: int | None = Field(default=None, gt=0)
    fps: float | None = Field(default=None, gt=0)


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


def _analyse(
    path: str,
    trim_start_ms: int | None = None,
    trim_end_ms: int | None = None,
    declared_source_duration_ms: int | None = None,
    duration_hint_ms: int | None = None,
    fps_hint: float | None = None,
) -> dict[str, object]:
    capture = cv2.VideoCapture(path)
    if not capture.isOpened():
        raise ValueError("CAPTURE_UNREADABLE")
    fps = float(capture.get(cv2.CAP_PROP_FPS) or 0)
    source_frame_count = int(capture.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
    width = int(capture.get(cv2.CAP_PROP_FRAME_WIDTH) or 0)
    height = int(capture.get(cv2.CAP_PROP_FRAME_HEIGHT) or 0)
    source_duration_ms = int((source_frame_count / fps) * 1000) if fps > 0 else 0
    if fps <= 0 or source_frame_count <= 0 or source_duration_ms <= 0:
        try:
            probed = probe_video(path)
            fps = float(probed["fps"])
            source_frame_count = int(probed["frame_count"])
            width = width or int(probed["width"])
            height = height or int(probed["height"])
            source_duration_ms = int(probed["duration_ms"])
            if source_frame_count <= 0 and fps > 0 and source_duration_ms > 0:
                source_frame_count = round((source_duration_ms / 1000) * fps)
        except (OSError, ValueError, subprocess.SubprocessError, json.JSONDecodeError):
            pass
        if fps <= 0 or source_frame_count <= 0 or source_duration_ms <= 0:
            # MediaRecorder WebM files can be fully decodable while exposing
            # neither a seekable frame count nor container duration. Count the
            # real decoded frames and use the browser-measured duration to
            # derive effective fps rather than trusting the fps hint itself.
            capture.set(cv2.CAP_PROP_POS_FRAMES, 0)
            decoded_frames = 0
            while True:
                ok, frame = capture.read()
                if not ok:
                    break
                decoded_frames += 1
                if width <= 0 or height <= 0:
                    height, width = frame.shape[:2]
            if decoded_frames > 0 and duration_hint_ms and duration_hint_ms > 0:
                source_frame_count = decoded_frames
                source_duration_ms = duration_hint_ms
                fps = decoded_frames / (duration_hint_ms / 1000)
            elif decoded_frames > 0 and fps_hint and fps_hint > 0:
                source_frame_count = decoded_frames
                fps = fps_hint
                source_duration_ms = round((decoded_frames / fps_hint) * 1000)
    if fps <= 0 or source_frame_count <= 0 or source_duration_ms <= 0:
        capture.release()
        raise ValueError("CAPTURE_METADATA_UNREADABLE")
    try:
        # Browsers derive MP4 duration from the container timeline while OpenCV
        # derives it from decodable frames. Map the authorised browser chapter
        # onto the decoded timeline before validating its frames.
        start_ms, end_ms = normalise_chapter_range(
            source_duration_ms, trim_start_ms, trim_end_ms, declared_source_duration_ms,
        )
    except ValueError:
        capture.release()
        raise
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
    chapter_ends_by_source: dict[tuple[str, str], list[int]] = {}
    for clip in payload.clips:
        if clip.trim_end_ms is not None:
            chapter_ends_by_source.setdefault((clip.object_key, clip.sha256), []).append(clip.trim_end_ms)
    try:
        for clip in payload.clips:
            source_key = (clip.object_key, clip.sha256)
            path = downloaded.get(source_key)
            if path is None:
                path = _download(str(clip.object_url), clip.sha256)
                downloaded[source_key] = path
            declared_source_duration_ms = infer_declared_source_duration(
                clip.source_duration_ms,
                chapter_ends_by_source.get(source_key, []),
            )
            metrics = _analyse(
                path,
                clip.trim_start_ms,
                clip.trim_end_ms,
                declared_source_duration_ms,
                clip.duration_ms,
                clip.fps,
            )
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
    except httpx.HTTPStatusError as exc:
        raise HTTPException(422, f"CAPTURE_DOWNLOAD_HTTP_{exc.response.status_code}") from exc
    except httpx.HTTPError as exc:
        raise HTTPException(422, "CAPTURE_DOWNLOAD_FAILED") from exc
    except ValueError as exc:
        detail = str(exc)
        safe_detail = detail if detail.startswith("CAPTURE_") and detail.replace("_", "").isalnum() else "CAPTURE_VALIDATION_FAILED"
        raise HTTPException(422, safe_detail) from exc
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
