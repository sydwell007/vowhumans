"""Privacy-aware daily analytics aggregation contract."""
import hmac, os
from datetime import date
from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel, Field
app=FastAPI(title="VowHumans Analytics Worker",version="1.0.0")
class AggregateJob(BaseModel): organisation_id:str=Field(min_length=36,max_length=36); metric_date:date
def _require_internal_key(value: str | None) -> None:
    expected = os.getenv("VOWHUMANS_INTERNAL_KEY", "")
    if not expected or not value or not hmac.compare_digest(expected, value):
        raise HTTPException(401, "Internal service key required")
@app.get("/health")
def health(): return {"status":"ok","service":"analytics-worker","persistence":bool(os.getenv("DATABASE_URL"))}
@app.post("/aggregate",status_code=202)
def aggregate(_:AggregateJob, x_internal_key: str | None = Header(default=None)):
    _require_internal_key(x_internal_key)
    if not os.getenv("DATABASE_URL"): raise HTTPException(503,"Database unavailable")
    return {"accepted":True,"state":"queued","private_content_included":False}
