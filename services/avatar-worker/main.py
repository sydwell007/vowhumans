from __future__ import annotations
import asyncio
import hmac
import json
import logging
import os
import shutil
import tempfile
import time
import urllib.request
import uuid
from pathlib import Path

from fastapi import FastAPI, Header, HTTPException, Request
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import FileResponse
from starlette.background import BackgroundTask

log = logging.getLogger("avatar-worker")
app = FastAPI(title="VowHumans Avatar Worker", version="1.1.0")

ENABLE_MUSETALK = os.getenv("ENABLE_MUSETALK", "false").lower() == "true"
ENABLE_VIDEO_REPLICA = os.getenv("ENABLE_VIDEO_REPLICA", "false").lower() == "true"
_engine = None
_engine_error: str | None = None
_avatars: dict[str, object] = {}  # avatar_id -> PreparedAvatar, in-memory only
_replicas: dict[str, object] = {}  # replica_id -> PreparedVideoReplica, in-memory only
_render_lock = asyncio.Lock()

if ENABLE_MUSETALK:
    try:
        from musetalk_engine import GestureConfig, MuseTalkEngine
        _engine = MuseTalkEngine()
        log.info("MuseTalk engine loaded.")
    except Exception as exc:  # noqa: BLE001 - deliberately broad: report via /health, never crash the process
        _engine_error = f"{type(exc).__name__}: {exc}"
        log.exception("MuseTalk failed to load; falling back to audio-only for every request.")


def _require_internal_key(value: str | None) -> None:
    expected = os.getenv("VOWHUMANS_INTERNAL_KEY", "")
    if not expected or not value or not hmac.compare_digest(expected, value):
        raise HTTPException(401, "Internal service key required")


def _download(url: str, suffix: str) -> str:
    fd, path = tempfile.mkstemp(suffix=suffix)
    os.close(fd)
    urllib.request.urlretrieve(url, path)  # noqa: S310 - internal service, URLs are our own signed asset URLs
    return path


async def _save_upload(upload, suffix: str) -> str:
    fd, path = tempfile.mkstemp(suffix=suffix)
    with os.fdopen(fd, "wb") as f:
        f.write(await upload.read())
    return path


@app.get("/health")
def health():
    return {
        "status": "ok",
        "musetalk_enabled": ENABLE_MUSETALK,
        "model_loaded": _engine is not None,
        "model_error": _engine_error,
        "cached_avatars": len(_avatars),
        "video_replica_enabled": ENABLE_VIDEO_REPLICA,
        "cached_replicas": len(_replicas),
        "replica_motion_source": "captured-video" if ENABLE_VIDEO_REPLICA else "disabled",
        "render_batch_size": int(os.getenv("MUSETALK_BATCH_SIZE", "16")),
        "fallback": "audio-only",
    }


@app.post("/internal/v1/avatars", status_code=201)
async def prepare_avatar(request: Request, x_internal_key: str | None = Header(default=None)):
    _require_internal_key(x_internal_key)
    if _engine is None:
        raise HTTPException(503, f"MuseTalk is not available ({_engine_error or 'ENABLE_MUSETALK is off'}).")

    # Accepts either a multipart upload (a caller with raw bytes in hand — e.g. a face
    # image behind session-cookie auth this pod can't present) or the original
    # {image_url} JSON body (simple callers that do have a fetchable URL).
    content_type = request.headers.get("content-type", "")
    if content_type.startswith("multipart/form-data"):
        form = await request.form()
        upload = form.get("image_file")
        if upload is None:
            raise HTTPException(422, "Missing multipart field 'image_file'.")
        image_path = await _save_upload(upload, ".png")
    else:
        body = await request.json()
        image_url = body.get("image_url")
        if not image_url:
            raise HTTPException(422, "Missing 'image_url' (or upload 'image_file' as multipart/form-data).")
        image_path = _download(image_url, ".png")

    try:
        avatar = _engine.prepare_avatar(image_path)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(422, f"Could not prepare this face for lip-sync: {exc}") from exc
    finally:
        Path(image_path).unlink(missing_ok=True)
    avatar_id = str(uuid.uuid4())
    _avatars[avatar_id] = avatar
    return {"avatar_id": avatar_id, "prepared_at": time.time()}


@app.delete("/internal/v1/avatars/{avatar_id}")
def release_avatar(avatar_id: str, x_internal_key: str | None = Header(default=None)):
    _require_internal_key(x_internal_key)
    _avatars.pop(avatar_id, None)
    return {"avatar_id": avatar_id, "released": True}


@app.post("/internal/v1/replicas", status_code=201)
async def prepare_replica(request: Request, x_internal_key: str | None = Header(default=None)):
    _require_internal_key(x_internal_key)
    if not ENABLE_VIDEO_REPLICA:
        raise HTTPException(503, "Video Replica is disabled; enable it only after an authorised capture passes the POC quality gate.")
    if _engine is None:
        raise HTTPException(503, f"MuseTalk is not available ({_engine_error or 'ENABLE_MUSETALK is off'}).")
    if not request.headers.get("content-type", "").startswith("multipart/form-data"):
        raise HTTPException(415, "Replica preparation requires multipart capture clips.")
    form = await request.form()
    manifest_json = form.get("manifest_json")
    if not isinstance(manifest_json, str):
        raise HTTPException(422, "Missing multipart field 'manifest_json'.")
    try:
        manifest = json.loads(manifest_json)
    except ValueError as exc:
        raise HTTPException(422, "Replica manifest is not valid JSON.") from exc
    clip_paths: dict[str, str] = {}
    try:
        for raw in manifest.get("clips", []):
            if not isinstance(raw, dict) or not isinstance(raw.get("key"), str):
                raise HTTPException(422, "Every manifest clip needs a key.")
            key = raw["key"]
            upload = form.get(f"clip__{key}")
            if upload is None or not hasattr(upload, "read"):
                raise HTTPException(422, f"Missing multipart clip 'clip__{key}'.")
            clip_paths[key] = await _save_upload(upload, ".mp4")
        from video_replica_engine import prepare_video_replica
        replica = await run_in_threadpool(prepare_video_replica, _engine, clip_paths, manifest)
    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(422, f"Could not prepare captured replica: {exc}") from exc
    finally:
        for path in clip_paths.values():
            Path(path).unlink(missing_ok=True)
    replica_id = str(uuid.uuid4())
    _replicas[replica_id] = replica
    return {"replica_id": replica_id, "prepared_at": time.time(), "motion_source": "captured-video", "dynamic_region": "mouth-only"}


@app.delete("/internal/v1/replicas/{replica_id}")
def release_replica(replica_id: str, x_internal_key: str | None = Header(default=None)):
    _require_internal_key(x_internal_key)
    _replicas.pop(replica_id, None)
    return {"replica_id": replica_id, "released": True}


@app.post("/internal/v1/replica-render")
async def render_replica(request: Request, x_internal_key: str | None = Header(default=None)):
    _require_internal_key(x_internal_key)
    if not ENABLE_VIDEO_REPLICA or _engine is None:
        raise HTTPException(503, "Video Replica is not available; caller should use the portrait or audio-only fallback.")
    content_type = request.headers.get("content-type", "")
    if content_type.startswith("multipart/form-data"):
        form = await request.form()
        replica_id = form.get("replica_id")
        upload = form.get("audio_file")
        conversation_state = str(form.get("conversation_state") or "speaking")
        gesture_key = form.get("gesture_key")
        if not replica_id or upload is None:
            raise HTTPException(422, "Multipart requests need both 'replica_id' and 'audio_file'.")
        audio_path = await _save_upload(upload, ".wav")
    else:
        body = await request.json()
        replica_id = body.get("replica_id")
        audio_url = body.get("audio_url")
        conversation_state = str(body.get("conversation_state") or "speaking")
        gesture_key = body.get("gesture_key")
        if not replica_id or not audio_url:
            raise HTTPException(422, "Missing 'replica_id'/'audio_url'.")
        audio_path = _download(audio_url, ".wav")
    replica = _replicas.get(str(replica_id))
    if replica is None:
        Path(audio_path).unlink(missing_ok=True)
        raise HTTPException(404, "Unknown replica_id — prepare the published replica first.")
    started_at = time.perf_counter()
    try:
        from video_replica_engine import render_video_replica
        async with _render_lock:
            video_path = await run_in_threadpool(render_video_replica, _engine, replica, audio_path, conversation_state, str(gesture_key) if gesture_key else None)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(500, f"Replica rendering failed: {exc}") from exc
    finally:
        Path(audio_path).unlink(missing_ok=True)
    render_ms = round((time.perf_counter() - started_at) * 1000)
    return FileResponse(
        video_path, media_type="video/mp4", filename="replica-reply.mp4",
        headers={"X-VowHumans-Render-Ms": str(render_ms), "X-VowHumans-Motion-Source": "captured-video"},
        background=BackgroundTask(shutil.rmtree, Path(video_path).parent, ignore_errors=True),
    )


@app.post("/internal/v1/render")
async def render(request: Request, x_internal_key: str | None = Header(default=None)):
    _require_internal_key(x_internal_key)
    if _engine is None:
        raise HTTPException(503, f"MuseTalk is not available ({_engine_error or 'ENABLE_MUSETALK is off'}); caller should fall back to audio-only.")

    # Same either-multipart-or-URL pattern as prepare_avatar — a caller with raw audio
    # bytes in hand (e.g. PCM captured from a LiveKit track, muxed to WAV in memory) has
    # no URL to give us at all.
    content_type = request.headers.get("content-type", "")
    gesture_json: str | None = None
    if content_type.startswith("multipart/form-data"):
        form = await request.form()
        avatar_id = form.get("avatar_id")
        upload = form.get("audio_file")
        gesture_json = form.get("gesture_json")
        if not avatar_id or upload is None:
            raise HTTPException(422, "Multipart requests need both 'avatar_id' and 'audio_file'.")
        audio_path = await _save_upload(upload, ".wav")
    else:
        body = await request.json()
        avatar_id = body.get("avatar_id")
        audio_url = body.get("audio_url")
        gesture = body.get("gesture")
        gesture_json = json.dumps(gesture) if gesture is not None else None
        if not avatar_id or not audio_url:
            raise HTTPException(422, "Missing 'avatar_id'/'audio_url' (or upload 'audio_file' as multipart/form-data).")
        audio_path = _download(audio_url, ".wav")

    # Optional and best-effort: a caller that omits it (or sends something
    # unparseable) still gets exactly today's rendering, no motion overlay —
    # never a failed render over a gesture-profile problem.
    gesture_config = None
    if gesture_json:
        try:
            gesture_config = GestureConfig.from_dict(json.loads(gesture_json))
        except (ValueError, TypeError) as exc:
            log.warning("Ignoring unparseable gesture_json (%s): %r", exc, gesture_json)

    avatar = _avatars.get(avatar_id)
    if avatar is None:
        Path(audio_path).unlink(missing_ok=True)
        raise HTTPException(404, "Unknown avatar_id — call /internal/v1/avatars first (or it may have been released).")
    started_at = time.perf_counter()
    try:
        # MuseTalk uses one shared model on one GPU. Serialize inference explicitly
        # and run it off the FastAPI event loop so /health remains responsive.
        async with _render_lock:
            video_path = await run_in_threadpool(_engine.render, avatar, audio_path, gesture_config)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(500, f"Rendering failed: {exc}") from exc
    finally:
        Path(audio_path).unlink(missing_ok=True)

    render_ms = round((time.perf_counter() - started_at) * 1000)
    log.info("Rendered avatar reply in %d ms", render_ms)
    render_dir = Path(video_path).parent
    return FileResponse(
        video_path,
        media_type="video/mp4",
        filename="reply.mp4",
        headers={"X-VowHumans-Render-Ms": str(render_ms)},
        background=BackgroundTask(shutil.rmtree, render_dir, ignore_errors=True),
    )
