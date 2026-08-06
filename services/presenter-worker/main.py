from __future__ import annotations
import hmac, os, shutil, uuid
from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel
app=FastAPI(title="VowHumans Presenter Worker",version="1.0.0")
class Job(BaseModel): project_id: uuid.UUID; identity_id: uuid.UUID; script_object_key: str; aspect_ratio: str="16:9"
def _require_internal_key(value: str | None) -> None:
    expected = os.getenv("VOWHUMANS_INTERNAL_KEY", "")
    if not expected or not value or not hmac.compare_digest(expected, value):
        raise HTTPException(401, "Internal service key required")
@app.get("/health")
def health(): return {"status":"ok","ffmpeg":bool(shutil.which("ffmpeg")),"gpu_enabled":os.getenv("ENABLE_MUSETALK","false").lower()=="true","mode":"queue-contract"}
@app.post("/internal/v1/renders",status_code=202)
def render(job:Job, x_internal_key: str | None = Header(default=None)):
    _require_internal_key(x_internal_key)
    return {"id":str(uuid.uuid4()),"project_id":str(job.project_id),"state":"queued","pipeline":["scene_generation","voice","avatar","slides","captions","assembly","approval"]}

