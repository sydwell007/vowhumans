from __future__ import annotations
import hmac
import logging
import os
import tempfile
import time
import urllib.request
import uuid
from pathlib import Path

from fastapi import FastAPI, Header, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel

log = logging.getLogger("avatar-worker")
app = FastAPI(title="VowHumans Avatar Worker", version="1.0.0")

ENABLE_MUSETALK = os.getenv("ENABLE_MUSETALK", "false").lower() == "true"
_engine = None
_engine_error: str | None = None
_avatars: dict[str, object] = {}  # avatar_id -> PreparedAvatar, in-memory only

if ENABLE_MUSETALK:
    try:
        from musetalk_engine import MuseTalkEngine
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


@app.get("/health")
def health():
    return {
        "status": "ok",
        "musetalk_enabled": ENABLE_MUSETALK,
        "model_loaded": _engine is not None,
        "model_error": _engine_error,
        "cached_avatars": len(_avatars),
        "fallback": "audio-only",
    }


class PrepareAvatarRequest(BaseModel):
    image_url: str


@app.post("/internal/v1/avatars", status_code=201)
def prepare_avatar(body: PrepareAvatarRequest, x_internal_key: str | None = Header(default=None)):
    _require_internal_key(x_internal_key)
    if _engine is None:
        raise HTTPException(503, f"MuseTalk is not available ({_engine_error or 'ENABLE_MUSETALK is off'}).")
    image_path = _download(body.image_url, ".png")
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


class RenderRequest(BaseModel):
    avatar_id: str
    audio_url: str


@app.post("/internal/v1/render")
def render(body: RenderRequest, x_internal_key: str | None = Header(default=None)):
    _require_internal_key(x_internal_key)
    if _engine is None:
        raise HTTPException(503, f"MuseTalk is not available ({_engine_error or 'ENABLE_MUSETALK is off'}); caller should fall back to audio-only.")
    avatar = _avatars.get(body.avatar_id)
    if avatar is None:
        raise HTTPException(404, "Unknown avatar_id — call /internal/v1/avatars first (or it may have been released).")
    audio_path = _download(body.audio_url, ".wav")
    try:
        video_path = _engine.render(avatar, audio_path)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(500, f"Rendering failed: {exc}") from exc
    finally:
        Path(audio_path).unlink(missing_ok=True)
    return FileResponse(video_path, media_type="video/mp4", filename="reply.mp4")
