"""Deterministic motion-clip selection for captured video replicas.

This does not invent body motion. It selects only approved, performer-captured
clips from a replica manifest and keeps transitions at neutral boundaries.
"""
from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum
import random


class ConversationState(StrEnum):
    IDLE = "idle"
    LISTENING = "listening"
    THINKING = "thinking"
    SPEAKING = "speaking"
    INTERRUPTED = "interrupted"


ALLOWED_GESTURES = frozenset({"acknowledge", "explain", "emphasise", "reassure"})


@dataclass(frozen=True)
class MotionClip:
    key: str
    state: ConversationState
    gesture: str | None = None
    intensity: int = 1
    starts_neutral: bool = True
    ends_neutral: bool = True


class MotionDirector:
    """Selects clips without back-to-back repetition or unsafe transitions."""

    def __init__(self, clips: list[MotionClip], seed: int | None = None) -> None:
        self._clips = tuple(clips)
        self._last_key: str | None = None
        self._random = random.Random(seed)

    def select(
        self,
        state: ConversationState,
        gesture: str | None = None,
        max_intensity: int = 2,
    ) -> MotionClip:
        requested_gesture = gesture if gesture in ALLOWED_GESTURES else None
        candidates = [
            clip for clip in self._clips
            if clip.state is state
            and clip.intensity <= max_intensity
            and clip.starts_neutral
            and clip.ends_neutral
            and (requested_gesture is None or clip.gesture == requested_gesture)
        ]
        if not candidates and requested_gesture is not None:
            candidates = [
                clip for clip in self._clips
                if clip.state is state and clip.gesture is None
                and clip.starts_neutral and clip.ends_neutral
            ]
        if not candidates and state is not ConversationState.IDLE:
            candidates = [
                clip for clip in self._clips
                if clip.state is ConversationState.IDLE
                and clip.starts_neutral and clip.ends_neutral
            ]
        if not candidates:
            raise ValueError(f"Replica has no neutral-boundary clip for state '{state.value}'.")

        non_repeating = [clip for clip in candidates if clip.key != self._last_key]
        selected = self._random.choice(non_repeating or candidates)
        self._last_key = selected.key
        return selected

    def interrupt(self) -> MotionClip:
        """Prefer a captured interrupted clip, otherwise return neutral idle."""
        try:
            return self.select(ConversationState.INTERRUPTED)
        except ValueError:
            return self.select(ConversationState.IDLE)
