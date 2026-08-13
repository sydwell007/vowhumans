"""LiveKit worker entrypoint for the avatar participant.

Joins the same room as the voice agent (services/realtime-agent) via LiveKit's
explicit agent dispatch — see services/api-gateway/main.py's RoomAgentDispatch,
which attaches {organisation_id, human_slug} as this job's metadata. Subscribes to
the voice agent's published audio, segments it into per-utterance clips using
LiveKit's own active-speaker detection (not hand-rolled VAD), sends each clip to
avatar-worker for lip-sync rendering, and publishes the result as a video+audio
track under fixed, well-known names (vhm-avatar-video / vhm-avatar-audio) that
apps/studio-web's LiveVoiceRoom.tsx looks for.

Deliberately a separate process from realtime-agent — render.yaml documents that
service already needed a memory-plan upgrade because livekit-agents + the OpenAI
plugin routinely approach 512MB; adding OpenCV/frame buffers/an HTTP client here
too would risk taking the already-working voice path down with it. See
services/avatar-worker/PROVIDERS.md for the original design note this implements.

Every class/method/field/event name below was checked against livekit-agents~=1.6's
actual installed source (not just docs) before writing this — the same discipline
musetalk_engine.py needed after MuseTalk's docs turned out to differ from its real
API. That verification covers the mechanism; it does NOT cover real-room behavior
(active-speaker hysteresis, whether OpenAI Realtime's track has segmentation
quirks, real render() latency over the public internet). Treat the first deploy as
a debugging session, the same way avatar-worker's first several deploys were.
"""
from __future__ import annotations

import asyncio
import io
import json
import os
import subprocess
import tempfile
import wave
from pathlib import Path

import cv2
import httpx
import numpy as np
from livekit import rtc
from livekit.agents import JobContext, WorkerOptions, cli


def _log(msg: str) -> None:
    # Plain print(flush=True), not the logging module: none of this module's own
    # log.*() lines appeared anywhere in the logs during the first live test, even
    # in paths that must have fired every single job. logging.basicConfig() is a
    # silent no-op once the root logger already has handlers, and livekit.agents'
    # own startup (which runs before any job reaches this module) already installs
    # one — so our calls were being swallowed. print() bypasses that class of
    # problem entirely, the same fix MuseTalk's own buffered prints needed earlier.
    print(f"[avatar-participant] {msg}", flush=True)

AGENT_NAME = "vowhumans-avatar"
AVATAR_AUDIO_TRACK = "vhm-avatar-audio"
AVATAR_VIDEO_TRACK = "vhm-avatar-video"

AVATAR_WORKER_URL = os.getenv("AVATAR_WORKER_URL", "")
STUDIO_WEB_URL = os.getenv("STUDIO_WEB_URL", "")
INTERNAL_KEY = os.getenv("VOWHUMANS_INTERNAL_KEY", "")

# Speech-only audio throughout: matches Whisper's own native rate (avatar-worker
# resamples internally regardless, but requesting this directly skips one resample
# step) and is standard "wideband" VoIP quality — plenty for a talking-head call.
AUDIO_SAMPLE_RATE = 16000
AUDIO_CHANNELS = 1

# A real, fixed publish resolution — NOT a 1x1 placeholder. Confirmed live: publishing
# a video track backed by a VideoSource(width=1, height=1) crashed the whole worker
# process (native LiveKit abort, "Check failed: width > 0 (0 vs. 0)" in
# video_frame_buffer.cc) within seconds of startup, well before any real frame was
# ever captured — almost certainly the publish path computing a downscaled simulcast
# layer from the declared 1x1 source size, rounding to 0x0. Every captured frame is
# resized to this exact size so it always matches what the source declared.
PUBLISH_VIDEO_WIDTH = 512
PUBLISH_VIDEO_HEIGHT = 512

RENDER_TIMEOUT_SECONDS = float(os.getenv("AVATAR_RENDER_TIMEOUT_SECONDS", "8"))
# How long the agent must be continuously silent before a buffered utterance is
# considered finished and sent for rendering. Needs live tuning against real
# OpenAI Realtime speech pacing — too short cuts a reply on a natural pause, too
# long adds latency waiting for the next turn to start.
SILENCE_HOLD_SECONDS = float(os.getenv("AVATAR_SILENCE_HOLD_SECONDS", "0.7"))
SPEAKING_POLL_INTERVAL_SECONDS = 0.1


async def entrypoint(ctx: JobContext) -> None:
    _log(f"entrypoint: job received, raw metadata={ctx.job.metadata!r}")
    metadata = json.loads(ctx.job.metadata) if ctx.job.metadata else {}
    organisation_id = metadata.get("organisation_id")
    human_slug = metadata.get("human_slug")
    if not organisation_id or not human_slug:
        _log("No organisation_id/human_slug on this job — nothing to do.")
        return

    await ctx.connect()
    _log(f"entrypoint: connected to room {ctx.room.name} as {ctx.room.local_participant.identity}")

    async with httpx.AsyncClient(timeout=30.0) as client:
        avatar_id = await _prepare_avatar(client, organisation_id, human_slug)
        if avatar_id is None:
            _log(f"No usable face for {organisation_id}/{human_slug} — this call stays audio-only.")
            return
        _log(f"entrypoint: avatar prepared, avatar_id={avatar_id}")

        # Sent as soon as an avatar is ready to render, not on the first successful
        # render — every turn from here on (lip-synced or, on a render failure, the
        # raw-audio fallback) publishes through vhm-avatar-audio, so it's safe for
        # the frontend to commit to that track the moment this arrives.
        await ctx.room.local_participant.publish_data(json.dumps({"type": "vhm_avatar_ready"}), reliable=True)
        _log("entrypoint: published vhm_avatar_ready")

        session = AvatarSession(ctx, client, avatar_id)
        try:
            await session.run()
        finally:
            _log("entrypoint: session.run() returned, releasing avatar")
            await _release_avatar(client, avatar_id)


async def _prepare_avatar(client: httpx.AsyncClient, organisation_id: str, human_slug: str) -> str | None:
    if not (AVATAR_WORKER_URL and STUDIO_WEB_URL and INTERNAL_KEY):
        _log("AVATAR_WORKER_URL / STUDIO_WEB_URL / VOWHUMANS_INTERNAL_KEY not fully configured.")
        return None
    try:
        face_resp = await client.get(
            f"{STUDIO_WEB_URL.rstrip('/')}/api/internal/v1/faces",
            headers={"x-internal-key": INTERNAL_KEY, "x-organisation-id": organisation_id},
            params={"human_slug": human_slug},
        )
        if face_resp.status_code != 200:
            _log(f"No face assigned for {organisation_id}/{human_slug} (studio-web returned {face_resp.status_code}).")
            return None

        prepare_resp = await client.post(
            f"{AVATAR_WORKER_URL.rstrip('/')}/internal/v1/avatars",
            headers={"x-internal-key": INTERNAL_KEY},
            files={"image_file": ("face", face_resp.content, face_resp.headers.get("content-type", "image/png"))},
        )
        if prepare_resp.status_code != 201:
            _log(f"avatar-worker prepare failed: {prepare_resp.status_code} {prepare_resp.text}")
            return None
        return prepare_resp.json()["avatar_id"]
    except httpx.HTTPError as exc:
        _log(f"Could not reach studio-web/avatar-worker to prepare an avatar: {exc}")
        return None


async def _release_avatar(client: httpx.AsyncClient, avatar_id: str) -> None:
    if not AVATAR_WORKER_URL:
        return
    try:
        await client.delete(f"{AVATAR_WORKER_URL.rstrip('/')}/internal/v1/avatars/{avatar_id}", headers={"x-internal-key": INTERNAL_KEY})
    except httpx.HTTPError:
        pass  # Best-effort — avatar-worker's own in-memory cache is per-process anyway.


class AvatarSession:
    """One room's worth of state: the published tracks, which participant is the
    voice agent, and the buffered-audio-to-rendered-video pipeline for each turn."""

    def __init__(self, ctx: JobContext, client: httpx.AsyncClient, avatar_id: str) -> None:
        self._ctx = ctx
        self._client = client
        self._avatar_id = avatar_id
        self._video_source = rtc.VideoSource(width=PUBLISH_VIDEO_WIDTH, height=PUBLISH_VIDEO_HEIGHT)
        self._audio_source = rtc.AudioSource(sample_rate=AUDIO_SAMPLE_RATE, num_channels=AUDIO_CHANNELS)
        self._agent_participant: rtc.RemoteParticipant | None = None
        self._buffer: list[rtc.AudioFrame] = []
        self._speaking = False
        self._silence_elapsed = 0.0
        self._render_lock = asyncio.Lock()
        self._stop = asyncio.Event()

    async def run(self) -> None:
        video_track = rtc.LocalVideoTrack.create_video_track(AVATAR_VIDEO_TRACK, self._video_source)
        audio_track = rtc.LocalAudioTrack.create_audio_track(AVATAR_AUDIO_TRACK, self._audio_source)
        await self._ctx.room.local_participant.publish_track(video_track)
        await self._ctx.room.local_participant.publish_track(audio_track)
        _log(f"AvatarSession.run: published {AVATAR_VIDEO_TRACK} and {AVATAR_AUDIO_TRACK}")

        self._ctx.room.on("track_subscribed", self._on_track_subscribed)
        self._ctx.room.on("active_speakers_changed", self._on_active_speakers_changed)
        self._ctx.room.on("disconnected", lambda *_: self._stop.set())

        # In case the agent's track was already subscribed before these listeners
        # were attached (a real possibility — publish_track above has no ordering
        # guarantee relative to when the voice agent joined and published its own
        # track), check what's already in the room right now too.
        for participant in self._ctx.room.remote_participants.values():
            _log(f"AvatarSession.run: existing participant identity={participant.identity} kind={participant.kind} publications={list(participant.track_publications.keys())}")
            for publication in participant.track_publications.values():
                if publication.track is not None:
                    self._on_track_subscribed(publication.track, publication, participant)

        watcher = asyncio.create_task(self._watch_for_silence())
        try:
            await self._stop.wait()
        finally:
            watcher.cancel()

    def _on_track_subscribed(self, track: rtc.Track, publication: rtc.TrackPublication, participant: rtc.RemoteParticipant) -> None:
        _log(f"track_subscribed: participant identity={participant.identity} kind={participant.kind} track.kind={track.kind} track.name={publication.name!r}")
        if participant.kind != rtc.ParticipantKind.PARTICIPANT_KIND_AGENT or track.kind != rtc.TrackKind.KIND_AUDIO:
            return
        if self._agent_participant is not None:
            return  # Already tracking one agent track; ignore any further ones.
        self._agent_participant = participant
        _log(f"track_subscribed: tracking agent participant {participant.identity} for audio")
        asyncio.create_task(self._consume_agent_audio(track))

    def _on_active_speakers_changed(self, speakers: list[rtc.Participant]) -> None:
        if self._agent_participant is None:
            return
        was_speaking = self._speaking
        self._speaking = any(p.sid == self._agent_participant.sid for p in speakers)
        if self._speaking != was_speaking:
            _log(f"active_speakers_changed: agent speaking={self._speaking} (speakers={[p.identity for p in speakers]})")

    async def _consume_agent_audio(self, track: rtc.Track) -> None:
        _log("_consume_agent_audio: starting to consume audio frames")
        frame_count = 0
        stream = rtc.AudioStream.from_track(track=track, sample_rate=AUDIO_SAMPLE_RATE, num_channels=AUDIO_CHANNELS)
        try:
            async for event in stream:
                self._buffer.append(event.frame)
                frame_count += 1
                if frame_count % 200 == 0:
                    _log(f"_consume_agent_audio: {frame_count} frames received so far (buffer={len(self._buffer)})")
        finally:
            _log(f"_consume_agent_audio: stream ended after {frame_count} frames")
            await stream.aclose()

    async def _watch_for_silence(self) -> None:
        while True:
            await asyncio.sleep(SPEAKING_POLL_INTERVAL_SECONDS)
            if self._speaking:
                self._silence_elapsed = 0.0
                continue
            if not self._buffer:
                continue
            self._silence_elapsed += SPEAKING_POLL_INTERVAL_SECONDS
            if self._silence_elapsed >= SILENCE_HOLD_SECONDS:
                self._silence_elapsed = 0.0
                frames, self._buffer = self._buffer, []
                _log(f"_watch_for_silence: utterance finalized, {len(frames)} frames, dispatching render")
                asyncio.create_task(self._handle_turn(frames))

    async def _handle_turn(self, frames: list[rtc.AudioFrame]) -> None:
        # One render at a time — a turn that's still rendering when the next one
        # finishes would otherwise publish out of order.
        async with self._render_lock:
            try:
                video_bytes = await asyncio.wait_for(self._render(frames), timeout=RENDER_TIMEOUT_SECONDS)
            except (TimeoutError, asyncio.TimeoutError, httpx.HTTPError, subprocess.CalledProcessError) as exc:
                _log(f"Render failed or timed out ({exc}) — falling back to raw audio for this turn.")
                await self._play_frames(frames)
                return
            if video_bytes is None:
                await self._play_frames(frames)
                return
            _log(f"_handle_turn: render succeeded, {len(video_bytes)} bytes, playing rendered clip")
            await self._play_rendered_clip(video_bytes)

    async def _render(self, frames: list[rtc.AudioFrame]) -> bytes | None:
        wav_bytes = _frames_to_wav(frames)
        _log(f"_render: sending {len(wav_bytes)} bytes of WAV audio to avatar-worker")
        resp = await self._client.post(
            f"{AVATAR_WORKER_URL.rstrip('/')}/internal/v1/render",
            headers={"x-internal-key": INTERNAL_KEY},
            data={"avatar_id": self._avatar_id},
            files={"audio_file": ("turn.wav", wav_bytes, "audio/wav")},
        )
        if resp.status_code != 200:
            _log(f"avatar-worker render failed: {resp.status_code} {resp.text}")
            return None
        return resp.content

    async def _play_frames(self, frames: list[rtc.AudioFrame]) -> None:
        """Fallback path: replay the already-captured raw audio verbatim, no video."""
        for frame in frames:
            await self._audio_source.capture_frame(frame)

    async def _play_rendered_clip(self, mp4_bytes: bytes) -> None:
        with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as f:
            f.write(mp4_bytes)
            video_path = f.name
        pcm_path = f"{video_path}.pcm"
        try:
            frames, fps = _read_video_frames(video_path)
            # ffmpeg subprocess extraction reuses musetalk_engine.py's existing
            # pattern rather than adding a PyAV dependency just for this.
            subprocess.run(
                ["ffmpeg", "-y", "-i", video_path, "-f", "s16le", "-ar", str(AUDIO_SAMPLE_RATE), "-ac", str(AUDIO_CHANNELS), pcm_path],
                check=True, capture_output=True,
            )
            pcm_bytes = Path(pcm_path).read_bytes()
            await asyncio.gather(
                self._play_video_frames(frames, 1.0 / fps),
                self._play_pcm(pcm_bytes),
            )
        finally:
            Path(video_path).unlink(missing_ok=True)
            Path(pcm_path).unlink(missing_ok=True)

    async def _play_video_frames(self, frames: list[np.ndarray], interval: float) -> None:
        for bgr in frames:
            # avatar-worker's output size varies with the source photo's detected
            # face bbox — always resize to the fixed size the VideoSource was
            # constructed with, since captured frames must match it.
            resized = cv2.resize(bgr, (PUBLISH_VIDEO_WIDTH, PUBLISH_VIDEO_HEIGHT))
            rgb = cv2.cvtColor(resized, cv2.COLOR_BGR2RGB)
            self._video_source.capture_frame(rtc.VideoFrame(PUBLISH_VIDEO_WIDTH, PUBLISH_VIDEO_HEIGHT, rtc.VideoBufferType.RGB24, rgb.tobytes()))
            await asyncio.sleep(interval)

    async def _play_pcm(self, pcm_bytes: bytes) -> None:
        bytes_per_sample = 2  # s16le
        frame_samples = int(AUDIO_SAMPLE_RATE * 0.02)  # 20ms frames
        frame_bytes = frame_samples * bytes_per_sample * AUDIO_CHANNELS
        for offset in range(0, len(pcm_bytes), frame_bytes):
            chunk = pcm_bytes[offset : offset + frame_bytes]
            if len(chunk) < frame_bytes:
                chunk = chunk + b"\x00" * (frame_bytes - len(chunk))
            await self._audio_source.capture_frame(rtc.AudioFrame(chunk, AUDIO_SAMPLE_RATE, AUDIO_CHANNELS, frame_samples))


def _frames_to_wav(frames: list[rtc.AudioFrame]) -> bytes:
    buffer = io.BytesIO()
    with wave.open(buffer, "wb") as wav_file:
        wav_file.setnchannels(AUDIO_CHANNELS)
        wav_file.setsampwidth(2)  # AudioFrame data is signed 16-bit PCM
        wav_file.setframerate(AUDIO_SAMPLE_RATE)
        for frame in frames:
            wav_file.writeframes(bytes(frame.data))
    return buffer.getvalue()


def _read_video_frames(video_path: str) -> tuple[list[np.ndarray], float]:
    cap = cv2.VideoCapture(video_path)
    fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
    frames: list[np.ndarray] = []
    try:
        while True:
            ok, frame = cap.read()
            if not ok:
                break
            frames.append(frame)
    finally:
        cap.release()
    return frames, fps


if __name__ == "__main__":
    cli.run_app(WorkerOptions(entrypoint_fnc=entrypoint, agent_name=AGENT_NAME))
