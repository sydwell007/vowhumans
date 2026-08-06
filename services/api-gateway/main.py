from __future__ import annotations
import base64
import hashlib
import hmac
import json
import os
import time
import uuid
from typing import Annotated, Literal
from fastapi import Depends, FastAPI, Header, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

app = FastAPI(title="VowHumans API Gateway", version="1.0.0", docs_url="/api/docs", openapi_url="/api/openapi.json")
app.add_middleware(CORSMiddleware, allow_origins=[os.getenv("VOWHUMANS_ALLOWED_ORIGIN", "http://localhost:3000")], allow_credentials=False, allow_methods=["GET","POST","PATCH","DELETE"], allow_headers=["content-type","x-api-key","x-organisation-id","x-request-id"])

class AuthContext(BaseModel):
    organisation_id: uuid.UUID
    key_fingerprint: str

def _load_key_registry() -> dict[str, str]:
    # Optional VOWHUMANS_SERVICE_API_KEYS: JSON map of {service_key: organisation_id}.
    # When configured, the organisation is resolved from the matched key instead of
    # being trusted from a client-supplied header. Falls back to the legacy single
    # shared-key/header-trust mode (dev-only) when unset.
    raw = os.getenv("VOWHUMANS_SERVICE_API_KEYS", "")
    if not raw:
        return {}
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        return {}
    return {str(key): str(org_id) for key, org_id in parsed.items()} if isinstance(parsed, dict) else {}

_KEY_REGISTRY = _load_key_registry()

def auth_context(x_api_key: Annotated[str | None, Header()] = None, x_organisation_id: Annotated[str | None, Header()] = None) -> AuthContext:
    if not x_api_key:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Valid server-side service key required")

    if _KEY_REGISTRY:
        matched_org_id = next((org_id for key, org_id in _KEY_REGISTRY.items() if hmac.compare_digest(key, x_api_key)), None)
        if matched_org_id is None:
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Valid server-side service key required")
        try:
            organisation_id = uuid.UUID(matched_org_id)
        except ValueError as exc:
            raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, "Service key registry misconfigured") from exc
        if x_organisation_id and x_organisation_id != str(organisation_id):
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Organisation header does not match the scoped service key")
        return AuthContext(organisation_id=organisation_id, key_fingerprint=hashlib.sha256(x_api_key.encode()).hexdigest()[:12])

    expected = os.getenv("VOWHUMANS_SERVICE_API_KEY", "")
    if not expected or not hmac.compare_digest(expected, x_api_key):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Valid server-side service key required")
    try: organisation_id = uuid.UUID(x_organisation_id or "")
    except ValueError as exc: raise HTTPException(400, "Verified organisation header required") from exc
    return AuthContext(organisation_id=organisation_id, key_fingerprint=hashlib.sha256(x_api_key.encode()).hexdigest()[:12])

Auth = Annotated[AuthContext, Depends(auth_context)]

class InterviewSessionRequest(BaseModel):
    candidate_reference: str = Field(min_length=3, max_length=200)
    digital_human_id: uuid.UUID
    mode: Literal["realistic","guided","quick","confidence"]
    job_context: str = Field(min_length=3, max_length=12000)
    transcript_consent: bool = False
    recording_consent: bool = False

class PresenterProjectRequest(BaseModel):
    title: str = Field(min_length=2, max_length=180)
    script: str = Field(min_length=1, max_length=100000)
    digital_human_id: uuid.UUID
    aspect_ratio: Literal["16:9","9:16","1:1","audio"] = "16:9"
    output_language: str = "en-ZA"

class LiveKitTokenRequest(BaseModel):
    session_id: uuid.UUID
    participant_identity: str = Field(min_length=3, max_length=180)

def _b64url(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).rstrip(b"=").decode()

def create_livekit_token(room: str, participant: str) -> str:
    api_key, secret = os.getenv("LIVEKIT_API_KEY", ""), os.getenv("LIVEKIT_API_SECRET", "")
    if not api_key or not secret: raise HTTPException(503, "LiveKit is not configured")
    now = int(time.time())
    header = _b64url(json.dumps({"alg":"HS256","typ":"JWT"},separators=(",",":")).encode())
    payload = _b64url(json.dumps({"iss":api_key,"sub":participant,"nbf":now-5,"exp":now+600,"video":{"roomJoin":True,"room":room,"canPublish":True,"canSubscribe":True}},separators=(",",":")).encode())
    signing = f"{header}.{payload}".encode()
    return f"{header}.{payload}.{_b64url(hmac.new(secret.encode(), signing, hashlib.sha256).digest())}"

@app.get("/api/v1/health", tags=["health"])
def health():
    return {"status":"ok","service":"api-gateway","timestamp":int(time.time()),"providers":{"database":"configuration-ready","redis":"configuration-ready","avatar":"audio-fallback"}}

@app.post("/api/v1/sessions/interview-practice", status_code=201, tags=["sessions"])
def create_interview_session(body: InterviewSessionRequest, auth: Auth):
    session_id = uuid.uuid4()
    return {"id":str(session_id),"organisation_id":str(auth.organisation_id),"state":"created","owner_scope":"candidate","transcript_consent":body.transcript_consent,"recording_consent":body.recording_consent,"room_token":None,"candidate_feedback_url":f"/practice/{session_id}/feedback","employer_answer_access":False}

@app.post("/api/v1/sessions/{session_id}/complete", tags=["sessions"])
def complete_session(session_id: uuid.UUID, auth: Auth):
    return {"id":str(session_id),"state":"completed","organisation_id":str(auth.organisation_id)}

@app.delete("/api/v1/sessions/{session_id}", status_code=202, tags=["sessions"])
def delete_session(session_id: uuid.UUID, auth: Auth):
    return {"id":str(session_id),"deletion":"queued","organisation_id":str(auth.organisation_id)}

@app.post("/api/v1/presenter-projects", status_code=201, tags=["presenter-projects"])
def create_presenter_project(body: PresenterProjectRequest, auth: Auth):
    return {"id":str(uuid.uuid4()),"organisation_id":str(auth.organisation_id),"title":body.title,"state":"draft","render_mode":"provider-not-configured"}

@app.post("/api/v1/livekit/token", tags=["livekit"])
def livekit_token(body: LiveKitTokenRequest, auth: Auth):
    room=f"vhm_{auth.organisation_id.hex[:10]}_{body.session_id.hex[:16]}"
    return {"url":os.getenv("LIVEKIT_URL"),"room":room,"token":create_livekit_token(room,body.participant_identity),"expires_in":600}

@app.get("/api/v1/usage", tags=["usage"])
def usage(auth: Auth):
    return {"organisation_id":str(auth.organisation_id),"sessions":0,"minutes":0,"estimated_cost_minor":0,"currency":"ZAR"}

@app.get("/api/v1/{resource}", tags=["resources"])
def list_resource(resource: Literal["digital-humans","identities","voices","personas","knowledge","applications","webhooks","renders"], auth: Auth):
    return {"data":[],"resource":resource,"organisation_id":str(auth.organisation_id),"meta":{"request_mode":"empty-persistent-adapter"}}
