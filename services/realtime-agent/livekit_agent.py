"""LiveKit worker entrypoint.

This module is deliberately separate from the health API so CPU-only development can
start without credentials. Run it only after ENABLE_LIVEKIT and a conversation provider
are configured. Provider keys remain in the worker environment.

Every class/method/field/event name below (function_tool, RunContext, Agent(tools=...),
JobContext.add_shutdown_callback) was checked against livekit-agents~=1.6's actual
installed source before writing this, same discipline avatar-participant's own
livekit_agent.py documents needing.
"""
from __future__ import annotations
import json
import os
import httpx
from livekit import agents
from livekit.agents import Agent, AgentSession, JobContext, RunContext, WorkerOptions, cli, function_tool
from livekit.plugins import openai

STUDIO_WEB_URL = os.getenv("STUDIO_WEB_URL", "")
INTERNAL_KEY = os.getenv("VOWHUMANS_INTERNAL_KEY", "")

# Exactly what this module hardcoded before real persona/voice/knowledge existed —
# kept as literal fallback values, not just a comment, so any caller that doesn't
# pass job metadata (or whose lookup fails for any reason) gets identical behaviour
# to before this change, not a broken or half-configured call.
FALLBACK_INSTRUCTIONS = "Stay within the configured Persona scope, keep answers concise, and preserve user privacy."
FALLBACK_OPENING_INSTRUCTION = "Disclose that you are AI, then deliver the approved opening message."
FALLBACK_VOICE = os.getenv("OPENAI_REALTIME_VOICE", "marin")


class VowHumansAgent(Agent):
    def __init__(self, instructions: str, tools: list | None = None):
        disclosure = "You are an AI-generated digital human. Never imply that you are a real person. "
        super().__init__(instructions=disclosure + instructions, tools=tools or [])


async def _fetch_persona(client: httpx.AsyncClient, organisation_id: str, human_slug: str, persona_version_id: str | None) -> dict | None:
    if not (STUDIO_WEB_URL and INTERNAL_KEY):
        return None
    try:
        params = {"human_slug": human_slug}
        if persona_version_id:
            params["persona_version_id"] = persona_version_id
        resp = await client.get(
            f"{STUDIO_WEB_URL.rstrip('/')}/api/internal/v1/persona",
            headers={"x-internal-key": INTERNAL_KEY, "x-organisation-id": organisation_id},
            params=params,
        )
        if resp.status_code != 200:
            return None
        return resp.json().get("data")
    except httpx.HTTPError:
        return None


def _make_knowledge_tool(client: httpx.AsyncClient, organisation_id: str, knowledge_base_ids: list[str]):
    @function_tool
    async def search_knowledge_base(context: RunContext, query: str) -> str:
        """Search this digital human's assigned knowledge base for information relevant to
        the user's question. Call this whenever the user asks something that approved
        reference material might answer, before answering from general knowledge.

        Args:
            query: The user's question, or the specific topic to search for.
        """
        try:
            resp = await client.post(
                f"{STUDIO_WEB_URL.rstrip('/')}/api/internal/v1/knowledge-retrieval",
                headers={"x-internal-key": INTERNAL_KEY, "x-organisation-id": organisation_id},
                json={"knowledge_base_ids": knowledge_base_ids, "query": query},
            )
            chunks = resp.json().get("data", {}).get("chunks", []) if resp.status_code == 200 else []
        except httpx.HTTPError:
            chunks = []
        if not chunks:
            return "No relevant information was found in the knowledge base for this question."
        return "\n\n".join(f"[{c['document_title']}] {c['content']}" for c in chunks)

    return search_knowledge_base


async def entrypoint(ctx: JobContext):
    await ctx.connect()
    if os.getenv("ENABLE_OPENAI_REALTIME", "false").lower() != "true":
        raise RuntimeError("Realtime provider disabled; use the Studio mock flow")

    metadata = json.loads(ctx.job.metadata) if ctx.job.metadata else {}
    organisation_id = metadata.get("organisation_id")
    human_slug = metadata.get("human_slug")
    persona_version_id = metadata.get("persona_version_id")

    persona_instructions = FALLBACK_INSTRUCTIONS
    opening_instruction = FALLBACK_OPENING_INSTRUCTION
    voice = FALLBACK_VOICE
    tools: list = []

    # Kept open for this job's whole lifetime, not just this setup — the knowledge
    # tool closure below reuses it for calls the model makes mid-conversation, long
    # after entrypoint() itself has returned. Closed via add_shutdown_callback,
    # not a local `finally`, for exactly that reason.
    client = httpx.AsyncClient(timeout=10.0)
    ctx.add_shutdown_callback(client.aclose)

    if organisation_id and human_slug:
        persona_data = await _fetch_persona(client, organisation_id, human_slug, persona_version_id)
        persona = persona_data.get("persona") if persona_data else None
        if persona:
            persona_instructions = (
                f"{persona['system_instructions']}\n\n"
                f"Conversation style: {persona['conversation_style']}\n"
                f"Respond in {persona['language']}. Keep responses under {persona['max_response_words']} words."
            )
            opening_instruction = f"Disclose that you are AI, then deliver this opening message: {persona['opening_message']}"
            voice_info = persona_data.get("voice") if persona_data else None
            if voice_info and voice_info.get("provider_voice_id"):
                voice = voice_info["provider_voice_id"]
            knowledge_base_ids = persona.get("knowledge_base_ids") or []
            if knowledge_base_ids:
                tools = [_make_knowledge_tool(client, organisation_id, knowledge_base_ids)]

    session = AgentSession(llm=openai.realtime.RealtimeModel(model=os.getenv("OPENAI_REALTIME_MODEL", "gpt-realtime"), voice=voice))
    await session.start(room=ctx.room, agent=VowHumansAgent(persona_instructions, tools))
    await session.generate_reply(instructions=opening_instruction)


if __name__ == "__main__":
    # Explicit agent_name, not automatic/implicit dispatch (the previous default).
    # Confirmed live via LiveKit Cloud's own session records: once api-gateway
    # started attaching an explicit RoomAgentDispatch for the avatar participant to
    # a room's token, this worker's automatic dispatch stopped firing for that same
    # room entirely — LiveKit Cloud only shows the avatar participant and the human,
    # never this agent. Undocumented interaction, but reproduced across 6 separate
    # test rooms. Naming this worker too, and having api-gateway always dispatch it
    # explicitly (services/api-gateway/main.py), avoids ever mixing automatic and
    # explicit dispatch in the same room again.
    cli.run_app(WorkerOptions(entrypoint_fnc=entrypoint, agent_name="vowhumans-voice"))
