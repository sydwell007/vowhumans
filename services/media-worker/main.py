import shutil
from fastapi import FastAPI
app=FastAPI(title="VowHumans Media Worker",version="1.0.0")
@app.get("/health")
def health(): return {"status":"ok","ffmpeg_available":bool(shutil.which("ffmpeg")),"outputs":["mp4-16:9","mp4-9:16","mp4-1:1","audio","srt","vtt","thumbnail"]}

