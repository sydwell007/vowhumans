"""LiveKit worker entrypoint.

This module is deliberately separate from the health API so CPU-only development can
start without credentials. Run it only after ENABLE_LIVEKIT and a conversation provider
are configured. Provider keys remain in the worker environment.
"""
from __future__ import annotations
import os
from livekit import agents
from livekit.agents import Agent, AgentSession, JobContext, WorkerOptions, cli
from livekit.plugins import openai

class VowHumansAgent(Agent):
    def __init__(self, instructions: str):
        disclosure = "You are an AI-generated digital human. Never imply that you are a real person. "
        super().__init__(instructions=disclosure + instructions)

async def entrypoint(ctx: JobContext):
    await ctx.connect()
    # In production, retrieve the immutable Persona version through the authenticated
    # API gateway using room metadata. Never trust Persona instructions from a browser.
    persona_instructions = "Stay within the configured Persona scope, keep answers concise, and preserve user privacy."
    if os.getenv("ENABLE_OPENAI_REALTIME","false").lower() != "true":
        raise RuntimeError("Realtime provider disabled; use the Studio mock flow")
    session = AgentSession(llm=openai.realtime.RealtimeModel(model=os.getenv("OPENAI_REALTIME_MODEL", "gpt-realtime"), voice="alloy"))
    await session.start(room=ctx.room, agent=VowHumansAgent(persona_instructions))
    await session.generate_reply(instructions="Disclose that you are AI, then deliver the approved opening message.")

if __name__ == "__main__":
    cli.run_app(WorkerOptions(entrypoint_fnc=entrypoint))

