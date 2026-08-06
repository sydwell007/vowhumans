"""Notification worker contract. It cannot claim delivery without a provider."""
import hmac, os
from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel, EmailStr, Field
app=FastAPI(title="VowHumans Notification Worker",version="1.0.0")
class Job(BaseModel): recipient:EmailStr; template_code:str=Field(min_length=2,max_length=100); idempotency_key:str=Field(min_length=16,max_length=255)
def _require_internal_key(value: str | None) -> None:
    expected = os.getenv("VOWHUMANS_INTERNAL_KEY", "")
    if not expected or not value or not hmac.compare_digest(expected, value):
        raise HTTPException(401, "Internal service key required")
@app.get("/health")
def health(): return {"status":"ok","service":"notification-worker","provider":os.getenv("EMAIL_PROVIDER","disabled")}
@app.post("/jobs",status_code=202)
def job(_:Job, x_internal_key: str | None = Header(default=None)):
    _require_internal_key(x_internal_key)
    if os.getenv("EMAIL_PROVIDER","disabled")=="disabled": raise HTTPException(503,"Email provider disabled")
    return {"accepted":True,"state":"queued"}
