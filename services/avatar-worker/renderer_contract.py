"""Provider-neutral renderer contracts for VowHumans appearance tiers.

The module intentionally has no GPU or web-framework imports.  Control-plane
and worker tests can therefore reason about capability truth and fallback order
without loading MuseTalk or CUDA.
"""
from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum
from typing import Protocol


class RendererTier(StrEnum):
    PORTRAIT = "portrait"
    VIDEO_REPLICA = "video_replica"
    RIGGED_3D = "rigged_3d"


@dataclass(frozen=True)
class RendererCapabilities:
    tier: RendererTier
    provider: str
    preserves_captured_motion: bool
    supports_realtime: bool
    supports_batch: bool
    supports_structured_gestures: bool
    requires_gpu: bool
    experimental: bool = False


class PreparedRenderer(Protocol):
    renderer_tier: RendererTier
    provider: str


class AvatarRendererProvider(Protocol):
    @property
    def capabilities(self) -> RendererCapabilities: ...

    def health(self) -> dict[str, object]: ...


LEGACY_PORTRAIT_CAPABILITIES = RendererCapabilities(
    tier=RendererTier.PORTRAIT,
    provider="musetalk-portrait",
    preserves_captured_motion=False,
    supports_realtime=False,
    supports_batch=True,
    supports_structured_gestures=False,
    requires_gpu=True,
)

VIDEO_REPLICA_CAPABILITIES = RendererCapabilities(
    tier=RendererTier.VIDEO_REPLICA,
    provider="musetalk-video-replica",
    preserves_captured_motion=True,
    supports_realtime=False,
    supports_batch=True,
    supports_structured_gestures=True,
    requires_gpu=True,
)

RIGGED_3D_CAPABILITIES = RendererCapabilities(
    tier=RendererTier.RIGGED_3D,
    provider="rigged-3d-contract",
    preserves_captured_motion=False,
    supports_realtime=False,
    supports_batch=False,
    supports_structured_gestures=True,
    requires_gpu=True,
    experimental=True,
)


class LegacyPortraitProvider:
    """Adapter marker for the existing still-image MuseTalk renderer."""

    capabilities = LEGACY_PORTRAIT_CAPABILITIES

    def health(self) -> dict[str, object]:
        return {"provider": self.capabilities.provider, "available": True, "tier": self.capabilities.tier.value}


class VideoReplicaProvider:
    """Adapter marker for captured-frame, mouth-only retargeting."""

    capabilities = VIDEO_REPLICA_CAPABILITIES

    def health(self) -> dict[str, object]:
        return {"provider": self.capabilities.provider, "available": True, "tier": self.capabilities.tier.value}


class Rigged3DProvider:
    """Explicit scaffold; health never implies a renderer exists."""

    capabilities = RIGGED_3D_CAPABILITIES

    def health(self) -> dict[str, object]:
        return {"provider": self.capabilities.provider, "available": False, "tier": self.capabilities.tier.value, "reason": "experimental-contract-only"}


def fallback_order(requested: RendererTier) -> tuple[RendererTier, ...]:
    """Return the explicit, non-magical degradation order for a request."""
    if requested is RendererTier.RIGGED_3D:
        return (RendererTier.RIGGED_3D, RendererTier.VIDEO_REPLICA, RendererTier.PORTRAIT)
    if requested is RendererTier.VIDEO_REPLICA:
        return (RendererTier.VIDEO_REPLICA, RendererTier.PORTRAIT)
    return (RendererTier.PORTRAIT,)
