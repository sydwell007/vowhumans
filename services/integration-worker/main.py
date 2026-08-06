"""Short integration sync-job orchestration contract."""
import hmac, os
from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel, Field
app=FastAPI(title="VowHumans Integration Worker",version="1.0.0")
class SyncJob(BaseModel): organisation_id:str=Field(min_length=36,max_length=36); installation_id:str=Field(min_length=36,max_length=36); cursor:str|None=None
def _require_internal_key(value: str | None) -> None:
    expected = os.getenv("VOWHUMANS_INTERNAL_KEY", "")
    if not expected or not value or not hmac.compare_digest(expected, value):
        raise HTTPException(401, "Internal service key required")
@app.get("/health")
def health(): return {"status":"ok","service":"integration-worker","queue":os.getenv("QUEUE_PROVIDER","disabled")}
@app.post("/sync",status_code=202)
def sync(_:SyncJob, x_internal_key: str | None = Header(default=None)):
    _require_internal_key(x_internal_key)
    if os.getenv("ENABLE_INTEGRATION_WORKER","false").lower()!="true": raise HTTPException(503,"Integration worker disabled")
    return {"accepted":True,"state":"queued"}
