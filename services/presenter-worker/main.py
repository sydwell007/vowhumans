from __future__ import annotations
import os, shutil, uuid
from fastapi import FastAPI
from pydantic import BaseModel
app=FastAPI(title="VowHumans Presenter Worker",version="1.0.0")
class Job(BaseModel): project_id: uuid.UUID; identity_id: uuid.UUID; script_object_key: str; aspect_ratio: str="16:9"
@app.get("/health")
def health(): return {"status":"ok","ffmpeg":bool(shutil.which("ffmpeg")),"gpu_enabled":os.getenv("ENABLE_MUSETALK","false").lower()=="true","mode":"queue-contract"}
@app.post("/internal/v1/renders",status_code=202)
def render(job:Job): return {"id":str(uuid.uuid4()),"project_id":str(job.project_id),"state":"queued","pipeline":["scene_generation","voice","avatar","slides","captions","assembly","approval"]}

