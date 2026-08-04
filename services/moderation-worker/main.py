from fastapi import FastAPI
from pydantic import BaseModel, Field
app=FastAPI(title="VowHumans Moderation Worker",version="1.0.0")
class Check(BaseModel): text:str=Field(max_length=20000); context:str="conversation"
@app.get("/health")
def health(): return {"status":"ok","mode":"rules-only","external_provider":False}
@app.post("/internal/v1/check")
def check(body:Check):
    lowered=body.text.lower(); blocked=any(term in lowered for term in ["remove ai disclosure","clone without consent","employer practice answers"])
    return {"allowed":not blocked,"action":"block" if blocked else "allow","categories":["product-policy"] if blocked else []}

