"""Thin health API, deliberately separate from the LiveKit worker (livekit_agent.py)
so this can report status without needing LiveKit/avatar-worker credentials —
mirrors services/realtime-agent/main.py's split for the same reason."""
from __future__ import annotations
import os
from fastapi import FastAPI

app = FastAPI(title="VowHumans Avatar Participant", version="1.0.0")


@app.get("/health")
async def health():
    return {
        "status": "ok",
        "avatar_worker_configured": bool(os.getenv("AVATAR_WORKER_URL")),
        "studio_web_configured": bool(os.getenv("STUDIO_WEB_URL")),
        "enabled": os.getenv("ENABLE_AVATAR_PARTICIPANT", "false").lower() == "true",
    }
