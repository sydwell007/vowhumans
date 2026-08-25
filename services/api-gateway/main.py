from __future__ import annotations
import base64
import datetime
import hashlib
import hmac
import json
import os
import time
import uuid
from typing import Annotated, Literal
from fastapi import Depends, FastAPI, Header, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from livekit.api import AccessToken, RoomAgentDispatch, RoomConfiguration, VideoGrants
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

def _b64url_decode(data: str) -> bytes:
    return base64.urlsafe_b64decode(data + "=" * (-len(data) % 4))

def _verify_embed_token(token: str) -> uuid.UUID:
    # Node-side counterpart: apps/studio-web/src/lib/embedToken.ts. Minted fresh
    # per public embed call, server-side only by studio-web — never held by the
    # browser or by any third-party adapter, unlike the two key-based modes above.
    secret = os.getenv("VOWHUMANS_EMBED_TOKEN_SECRET", "")
    if not secret:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Embed tokens are not configured")
    try:
        encoded_payload, signature = token.split(".", 1)
    except ValueError as exc:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Malformed embed token") from exc
    expected_signature = base64.urlsafe_b64encode(hmac.new(secret.encode(), encoded_payload.encode(), hashlib.sha256).digest()).rstrip(b"=").decode()
    if not hmac.compare_digest(expected_signature, signature):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid embed token")
    try:
        payload = json.loads(_b64url_decode(encoded_payload))
    except (ValueError, json.JSONDecodeError) as exc:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Malformed embed token") from exc
    if payload.get("scope") != "embed":
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid embed token scope")
    if not isinstance(payload.get("exp"), (int, float)) or payload["exp"] < time.time():
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Embed token expired")
    try:
        return uuid.UUID(str(payload.get("organisation_id")))
    except ValueError as exc:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Malformed embed token") from exc

def auth_context(
    x_api_key: Annotated[str | None, Header()] = None,
    x_organisation_id: Annotated[str | None, Header()] = None,
    authorization: Annotated[str | None, Header()] = None,
) -> AuthContext:
    # Third mode, alongside (not replacing) the two key-based ones below: a
    # short-lived embed token, checked first only when no x_api_key is present so
    # an existing key-based caller's behaviour is completely unchanged.
    if not x_api_key and authorization and authorization.lower().startswith("bearer "):
        organisation_id = _verify_embed_token(authorization[7:].strip())
        return AuthContext(organisation_id=organisation_id, key_fingerprint="embed-token")

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
    # Which digital human this call is for — e.g. "thandi-mokoena", the same slug
    # StudioView.tsx already uses when assigning a face/voice/gesture profile to a
    # human. Optional: omitting it just means no avatar-participant is dispatched
    # (audio-only), matching every call before this field existed.
    human_slug: str | None = None
    # The specific persona_version_id an embed session pinned at enable-time
    # (digital_human_applications.persona_version_id) — deliberately NOT "whatever
    # is currently assigned", since a studio user can swap a human's live
    # assignment after an application was already enabled. Optional: the demo
    # flow has no real sessions row to pin from, so realtime-agent falls back to
    # resolving the human's current published assignment when this is absent.
    persona_version_id: uuid.UUID | None = None
    # BCP-47-ish locale code (e.g. "zu-ZA") the caller wants this call conducted
    # in — optional, purely additive. Threaded into the voice agent's dispatch
    # metadata the same way human_slug/persona_version_id already are; absent
    # means today's exact behaviour (realtime-agent falls back to the persona's
    # own default language).
    requested_language: str | None = None

TOKEN_TTL = datetime.timedelta(seconds=600)
VOICE_AGENT_NAME = "vowhumans-voice"
AVATAR_AGENT_NAME = "vowhumans-avatar"

def create_livekit_token(room: str, participant: str, organisation_id: uuid.UUID, session_id: uuid.UUID, human_slug: str | None, persona_version_id: uuid.UUID | None, requested_language: str | None = None) -> str:
    api_key, secret = os.getenv("LIVEKIT_API_KEY", ""), os.getenv("LIVEKIT_API_SECRET", "")
    if not api_key or not secret: raise HTTPException(503, "LiveKit is not configured")

    # Explicit agent dispatch for BOTH agents, always — rides on this same token
    # rather than a separate Room Service call, so the room is created and both jobs
    # dispatched atomically by the LiveKit server. realtime-agent used to rely on
    # implicit/automatic dispatch (no agent_name) and this only listed the avatar
    # participant explicitly — confirmed live via LiveKit Cloud's own session
    # records that doing so silently stopped the voice agent's automatic dispatch
    # from firing in the same room (undocumented interaction, reproduced across 6
    # separate test rooms: every one showed only the avatar participant and the
    # human, never the voice agent). realtime-agent now also has an explicit
    # agent_name, so every token must list it, or no voice agent joins at all.
    #
    # The voice agent's dispatch always carries {organisation_id, human_slug,
    # persona_version_id} metadata now too (previously it got nothing at all) —
    # this is what lets realtime-agent resolve the real persona/voice/knowledge
    # for this call instead of its old hardcoded instructions.
    voice_metadata = json.dumps({"organisation_id": str(organisation_id), "session_id": str(session_id), "human_slug": human_slug, "persona_version_id": str(persona_version_id) if persona_version_id else None, "requested_language": requested_language})
    room_agents = [RoomAgentDispatch(agent_name=VOICE_AGENT_NAME, metadata=voice_metadata)]
    if human_slug and os.getenv("ENABLE_AVATAR_PARTICIPANT", "false").lower() == "true":
        avatar_metadata = json.dumps({"organisation_id": str(organisation_id), "human_slug": human_slug})
        room_agents.append(RoomAgentDispatch(agent_name=AVATAR_AGENT_NAME, metadata=avatar_metadata))

    token = (
        AccessToken(api_key, secret)
        .with_identity(participant)
        .with_ttl(TOKEN_TTL)
        .with_grants(VideoGrants(room_join=True, room=room, can_publish=True, can_subscribe=True))
        .with_room_config(RoomConfiguration(agents=room_agents))
    )
    return token.to_jwt()

@app.get("/api/v1/health", tags=["health"])
def health():
    # No "realtime" field here on purpose: ENABLE_OPENAI_REALTIME only ever
    # matters to realtime-agent-worker (the actual voice bridge), a completely
    # separate Railway service from this one, deliberately deployed with no
    # public network of its own (docs/LIVE_VOICE_DEPLOYMENT.md — it only makes
    # outbound connections to LiveKit). This gateway's own copy of that env var,
    # if it even has one, was never load-bearing for anything and isn't a
    # trustworthy proxy for the worker's real config. avatar IS this gateway's
    # own decision — ENABLE_AVATAR_PARTICIPANT directly controls whether
    # create_livekit_token() attaches avatar dispatch metadata, right here.
    # apps/studio-web checks realtime-agent-health's own /health for the
    # realtime signal instead — see fetchGatewayHealth() in
    # apps/studio-web/src/app/api/v1/[...route]/route.ts.
    return {
        "status": "ok", "service": "api-gateway", "timestamp": int(time.time()),
        "providers": {
            "database": "configuration-ready", "redis": "configuration-ready",
            "avatar": "configured" if os.getenv("ENABLE_AVATAR_PARTICIPANT", "false").lower() == "true" else "audio-fallback",
        },
    }

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
    token = create_livekit_token(room, body.participant_identity, auth.organisation_id, body.session_id, body.human_slug, body.persona_version_id, body.requested_language)
    return {"url":os.getenv("LIVEKIT_URL"),"room":room,"token":token,"expires_in":int(TOKEN_TTL.total_seconds())}

@app.get("/api/v1/usage", tags=["usage"])
def usage(auth: Auth):
    return {"organisation_id":str(auth.organisation_id),"sessions":0,"minutes":0,"estimated_cost_minor":0,"currency":"ZAR"}

@app.get("/api/v1/{resource}", tags=["resources"])
def list_resource(resource: Literal["digital-humans","identities","voices","personas","knowledge","applications","webhooks","renders"], auth: Auth):
    return {"data":[],"resource":resource,"organisation_id":str(auth.organisation_id),"meta":{"request_mode":"empty-persistent-adapter"}}
