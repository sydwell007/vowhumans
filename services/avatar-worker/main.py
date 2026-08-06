from __future__ import annotations
import hmac, os, time, uuid
from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel

app = FastAPI(title="VowHumans Avatar Worker", version="1.0.0")
MODE = os.getenv("AVATAR_MODE","mock")

class RenderRequest(BaseModel):
    session_id: uuid.UUID
    identity_id: uuid.UUID
    audio_object_key: str
    mode: str = "static-portrait"

def internal_key(value: str | None):
    expected=os.getenv("VOWHUMANS_INTERNAL_KEY","")
    if not expected or not value or not hmac.compare_digest(expected, value): raise HTTPException(401,"Internal service key required")

@app.get("/health")
def health():
    gpu_enabled=os.getenv("ENABLE_MUSETALK","false").lower()=="true"
    return {"status":"ok","mode":MODE,"gpu_available":False,"musetalk_enabled":gpu_enabled,"fallback":"audio-only","model_warm":False}

@app.post("/internal/v1/jobs", status_code=202)
def create_job(body: RenderRequest, x_internal_key: str | None = Header(default=None)):
    internal_key(x_internal_key)
    if body.mode.startswith("musetalk") and os.getenv("ENABLE_MUSETALK","false").lower()!="true":
        return {"id":str(uuid.uuid4()),"state":"fallback","effective_mode":"audio-only","reason":"GPU provider disabled"}
    return {"id":str(uuid.uuid4()),"state":"accepted","effective_mode":MODE,"received_at":time.time()}

@app.delete("/internal/v1/jobs/{job_id}")
def cancel_job(job_id: uuid.UUID, x_internal_key: str | None = Header(default=None)):
    internal_key(x_internal_key); return {"id":str(job_id),"state":"cancelled"}

