import hmac, os
from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel, Field
app=FastAPI(title="VowHumans Moderation Worker",version="1.0.0")
class Check(BaseModel): text:str=Field(max_length=20000); context:str="conversation"
def _require_internal_key(value: str | None) -> None:
    expected = os.getenv("VOWHUMANS_INTERNAL_KEY", "")
    if not expected or not value or not hmac.compare_digest(expected, value):
        raise HTTPException(401, "Internal service key required")
@app.get("/health")
def health(): return {"status":"ok","mode":"rules-only","external_provider":False}
@app.post("/internal/v1/check")
def check(body:Check, x_internal_key: str | None = Header(default=None)):
    _require_internal_key(x_internal_key)
    lowered=body.text.lower(); blocked=any(term in lowered for term in ["remove ai disclosure","clone without consent","employer practice answers"])
    return {"allowed":not blocked,"action":"block" if blocked else "allow","categories":["product-policy"] if blocked else []}

