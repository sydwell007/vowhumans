"""Notification worker contract. It cannot claim delivery without a provider."""
import os
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, EmailStr, Field
app=FastAPI(title="VowHumans Notification Worker",version="1.0.0")
class Job(BaseModel): recipient:EmailStr; template_code:str=Field(min_length=2,max_length=100); idempotency_key:str=Field(min_length=16,max_length=255)
@app.get("/health")
def health(): return {"status":"ok","service":"notification-worker","provider":os.getenv("EMAIL_PROVIDER","disabled")}
@app.post("/jobs",status_code=202)
def job(_:Job):
    if os.getenv("EMAIL_PROVIDER","disabled")=="disabled": raise HTTPException(503,"Email provider disabled")
    return {"accepted":True,"state":"queued"}
