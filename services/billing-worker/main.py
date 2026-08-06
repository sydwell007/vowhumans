"""Billing event worker contract. Provider calls remain disabled by default."""
import hmac, os
from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel, Field
app=FastAPI(title="VowHumans Billing Worker",version="1.0.0")
class Job(BaseModel):
    organisation_id:str=Field(min_length=36,max_length=36); event_type:str=Field(min_length=2,max_length=100); idempotency_key:str=Field(min_length=16,max_length=255)
def _require_internal_key(value: str | None) -> None:
    expected = os.getenv("VOWHUMANS_INTERNAL_KEY", "")
    if not expected or not value or not hmac.compare_digest(expected, value):
        raise HTTPException(401, "Internal service key required")
@app.get("/health")
def health(): return {"status":"ok","service":"billing-worker","provider":"configured" if os.getenv("BILLING_PROVIDER","disabled")!="disabled" else "disabled"}
@app.post("/jobs",status_code=202)
def job(_:Job, x_internal_key: str | None = Header(default=None)):
    _require_internal_key(x_internal_key)
    if os.getenv("ENABLE_BILLING_WORKER","false").lower()!="true": raise HTTPException(503,"Billing worker disabled")
    return {"accepted":True,"persistent":False,"state":"contract-only"}
