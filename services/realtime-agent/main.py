from __future__ import annotations
import hmac, os
from abc import ABC, abstractmethod
from fastapi import FastAPI, Header, HTTPException

class RealtimeProvider(ABC):
    name: str
    @abstractmethod
    async def health(self) -> dict: ...
    @abstractmethod
    async def start(self, persona: dict, context: dict) -> dict: ...

class MockRealtimeProvider(RealtimeProvider):
    name = "mock"
    async def health(self): return {"healthy":True,"capabilities":["transcript","interruptions","deterministic-response"]}
    async def start(self, persona, context): return {"provider_session_id":"mock-local","mode":"voice-contract-no-audio"}

class OpenAIRealtimeProvider(RealtimeProvider):
    name = "openai-realtime"
    async def health(self):
        enabled = os.getenv("ENABLE_OPENAI_REALTIME", "false").lower() == "true"
        return {"healthy":enabled and bool(os.getenv("OPENAI_API_KEY")),"capabilities":["webrtc","vad","interruptions"]}
    async def start(self, persona, context):
        if not (await self.health())["healthy"]: raise RuntimeError("OpenAI Realtime is not configured")
        raise NotImplementedError("Create the provider session through the LiveKit job entrypoint")

provider: RealtimeProvider = OpenAIRealtimeProvider() if os.getenv("ENABLE_OPENAI_REALTIME", "false").lower() == "true" else MockRealtimeProvider()
app = FastAPI(title="VowHumans Realtime Agent", version="1.0.0")

def _require_internal_key(value: str | None) -> None:
    expected = os.getenv("VOWHUMANS_INTERNAL_KEY", "")
    if not expected or not value or not hmac.compare_digest(expected, value):
        raise HTTPException(401, "Internal service key required")

@app.get("/health")
async def health(): return {"status":"ok","provider":provider.name,"provider_health":await provider.health(),"livekit_enabled":os.getenv("ENABLE_LIVEKIT","false").lower()=="true"}

@app.post("/internal/start")
async def start(payload: dict, x_internal_key: str | None = Header(default=None)):
    _require_internal_key(x_internal_key)
    try:
        return await provider.start(payload.get("persona", {}), payload.get("context", {}))
    except (NotImplementedError, RuntimeError) as exc:
        raise HTTPException(503, f"Realtime provider unavailable: {exc}")

