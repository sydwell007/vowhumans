"""Privacy-aware daily analytics aggregation contract."""
import os
from datetime import date
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
app=FastAPI(title="VowHumans Analytics Worker",version="1.0.0")
class AggregateJob(BaseModel): organisation_id:str=Field(min_length=36,max_length=36); metric_date:date
@app.get("/health")
def health(): return {"status":"ok","service":"analytics-worker","persistence":bool(os.getenv("DATABASE_URL"))}
@app.post("/aggregate",status_code=202)
def aggregate(_:AggregateJob):
    if not os.getenv("DATABASE_URL"): raise HTTPException(503,"Database unavailable")
    return {"accepted":True,"state":"queued","private_content_included":False}
