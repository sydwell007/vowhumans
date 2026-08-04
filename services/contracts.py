from __future__ import annotations
from dataclasses import dataclass
from enum import StrEnum
from typing import Any

class AvatarMode(StrEnum):
    AUDIO_ONLY = "audio-only"
    STATIC = "static-portrait"
    LOOP = "pre-rendered-loop"
    MUSETALK = "musetalk"
    MUSETALK_LIVEPORTRAIT = "musetalk-liveportrait"

@dataclass(frozen=True)
class IdentityGate:
    owner: bool
    written: bool
    face: bool
    voice: bool
    commercial: bool
    roles: int
    applications: int
    geography: bool
    expiry: bool
    provenance: bool
    approved: bool
    revoked: bool = False

def may_generate(gate: IdentityGate) -> bool:
    return not gate.revoked and all((gate.owner, gate.written, gate.face, gate.voice, gate.commercial, gate.roles > 0, gate.applications > 0, gate.geography, gate.expiry, gate.provenance, gate.approved))

def effective_avatar_mode(requested: AvatarMode, worker_healthy: bool, consent_valid: bool) -> AvatarMode:
    if not worker_healthy or not consent_valid:
        return AvatarMode.AUDIO_ONLY
    return requested

def may_access_organisation(request_org_id: str, resource_org_id: str, *, platform_admin: bool = False) -> bool:
    """Keep tenant checks explicit even when a caller has a valid service key."""
    return platform_admin or request_org_id == resource_org_id

def may_read_candidate_transcript(*, requester_id: str, candidate_id: str, consented_reviewers: set[str] | None = None) -> bool:
    """Practice transcripts are candidate-owned and never implied by employer membership."""
    return requester_id == candidate_id or requester_id in (consented_reviewers or set())

def employer_completion_payload(session: dict[str, Any]) -> dict[str, Any]:
    """Return completion metadata without candidate answers, transcript, audio, or appearance data."""
    allowed = ("id", "application_id", "status", "started_at", "completed_at", "duration_seconds")
    return {key: session[key] for key in allowed if key in session}
