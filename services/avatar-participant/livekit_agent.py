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

RENDER_TIMEOUT_SECONDS = float(os.getenv("AVATAR_RENDER_TIMEOUT_SECONDS", "45"))
# How long the agent must be continuously silent before a buffered utterance is
# considered finished and sent for rendering. Needs live tuning against real
# OpenAI Realtime speech pacing — too short cuts a reply on a natural pause, too
# long adds latency waiting for the next turn to start.
SILENCE_HOLD_SECONDS = float(os.getenv("AVATAR_SILENCE_HOLD_SECONDS", "0.7"))
TURN_DRAIN_SECONDS = float(os.getenv("AVATAR_TURN_DRAIN_SECONDS", "0.25"))
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
        prepared_avatar = await _prepare_avatar(client, organisation_id, human_slug)
        if prepared_avatar is None:
            _log(f"No usable face for {organisation_id}/{human_slug} — this call stays audio-only.")
            return
        avatar_id, preview_frame = prepared_avatar
        _log(f"entrypoint: avatar prepared, avatar_id={avatar_id}")
        gesture = await _fetch_gesture(client, organisation_id, human_slug)

        session = AvatarSession(ctx, client, avatar_id, preview_frame, gesture)
        try:
            await session.run()
        finally:
            _log("entrypoint: session.run() returned, releasing avatar")
            await _release_avatar(client, avatar_id)


async def _prepare_avatar(client: httpx.AsyncClient, organisation_id: str, human_slug: str) -> tuple[str, np.ndarray] | None:
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
        preview_frame = cv2.imdecode(np.frombuffer(face_resp.content, dtype=np.uint8), cv2.IMREAD_COLOR)
        if preview_frame is None:
            _log(f"Assigned face for {organisation_id}/{human_slug} could not be decoded.")
            return None

        prepare_resp = await client.post(
            f"{AVATAR_WORKER_URL.rstrip('/')}/internal/v1/avatars",
            headers={"x-internal-key": INTERNAL_KEY},
            files={"image_file": ("face", face_resp.content, face_resp.headers.get("content-type", "image/png"))},
        )
        if prepare_resp.status_code != 201:
            _log(f"avatar-worker prepare failed: {prepare_resp.status_code} {prepare_resp.text}")
            return None
        return prepare_resp.json()["avatar_id"], preview_frame
    except httpx.HTTPError as exc:
        _log(f"Could not reach studio-web/avatar-worker to prepare an avatar: {exc}")
        return None


async def _fetch_gesture(client: httpx.AsyncClient, organisation_id: str, human_slug: str) -> dict | None:
    """Best-effort — the digital human's real configured head-motion range
    (see apps/studio-web/src/lib/gesture.ts), forwarded to avatar-worker so a
    rendered reply actually moves the way it was configured to. A failure or
    no-assignment here must never block or degrade the call itself; the
    caller just proceeds without a gesture_json field, identical to today's
    behavior before this existed."""
    if not (STUDIO_WEB_URL and INTERNAL_KEY):
        return None
    try:
        resp = await client.get(
            f"{STUDIO_WEB_URL.rstrip('/')}/api/internal/v1/gesture",
            headers={"x-internal-key": INTERNAL_KEY, "x-organisation-id": organisation_id},
            params={"human_slug": human_slug},
        )
        if resp.status_code != 200:
            return None
        body = resp.json()
        return body.get("data") if isinstance(body, dict) else None
    except httpx.HTTPError as exc:
        _log(f"Could not fetch gesture profile for {organisation_id}/{human_slug}: {exc}")
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

    def __init__(self, ctx: JobContext, client: httpx.AsyncClient, avatar_id: str, preview_frame: np.ndarray, gesture: dict | None = None) -> None:
        self._ctx = ctx
        self._client = client
        self._avatar_id = avatar_id
        self._preview_frame = preview_frame
        self._gesture = gesture
        self._video_source = rtc.VideoSource(width=PUBLISH_VIDEO_WIDTH, height=PUBLISH_VIDEO_HEIGHT)
        self._audio_source = rtc.AudioSource(sample_rate=AUDIO_SAMPLE_RATE, num_channels=AUDIO_CHANNELS)
        self._agent_participant: rtc.RemoteParticipant | None = None
        self._buffer: list[rtc.AudioFrame] = []
        self._speaking = False
        self._silence_elapsed = 0.0
        self._has_explicit_turn_events = False
        self._pending_finalize: asyncio.Task[None] | None = None
        self._render_lock = asyncio.Lock()
        self._stop = asyncio.Event()

    async def run(self) -> None:
        video_track = rtc.LocalVideoTrack.create_video_track(AVATAR_VIDEO_TRACK, self._video_source)
        audio_track = rtc.LocalAudioTrack.create_audio_track(AVATAR_AUDIO_TRACK, self._audio_source)
        await self._ctx.room.local_participant.publish_track(video_track)
        await self._ctx.room.local_participant.publish_track(audio_track)
        self._capture_video_frame(self._preview_frame)
        _log(f"AvatarSession.run: published {AVATAR_VIDEO_TRACK} and {AVATAR_AUDIO_TRACK}")

        self._ctx.room.on("track_subscribed", self._on_track_subscribed)
        self._ctx.room.on("active_speakers_changed", self._on_active_speakers_changed)
        self._ctx.room.on("data_received", self._on_data_received)
        self._ctx.room.on("disconnected", lambda *_: self._stop.set())

        # The voice worker waits for this before generating its opening reply. The
        # browser can therefore select the avatar audio track before any speech is
        # emitted, avoiding a mid-sentence audio-source switch.
        await self._ctx.room.local_participant.publish_data(
            json.dumps({"type": "vhm_avatar_ready"}),
            reliable=True,
        )

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
            if self._pending_finalize is not None:
                self._pending_finalize.cancel()

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
        if self._has_explicit_turn_events:
            return
        was_speaking = self._speaking
        self._speaking = any(p.sid == self._agent_participant.sid for p in speakers)
        if self._speaking != was_speaking:
            _log(f"active_speakers_changed: agent speaking={self._speaking} (speakers={[p.identity for p in speakers]})")

    def _on_data_received(self, data_packet) -> None:
        try:
            message = json.loads(data_packet.data.decode("utf-8"))
        except (AttributeError, UnicodeDecodeError, ValueError):
            return
        if message.get("type") != "vhm_voice_state":
            return

        state = message.get("state")
        if state not in {"initializing", "idle", "listening", "thinking", "speaking"}:
            return
        self._has_explicit_turn_events = True
        was_speaking = self._speaking
        self._speaking = state == "speaking"
        if self._speaking:
            if self._pending_finalize is not None:
                self._pending_finalize.cancel()
                self._pending_finalize = None
        elif was_speaking:
            self._pending_finalize = asyncio.create_task(self._finalize_after_drain())
        _log(f"voice state event: {state} (was_speaking={was_speaking})")

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

    async def _finalize_after_drain(self) -> None:
        try:
            # Reliable data and RTP audio use different transports. Give the final
            # audio packets a short window to arrive after the state transition.
            await asyncio.sleep(TURN_DRAIN_SECONDS)
            if not self._speaking:
                self._dispatch_buffer("voice state")
        finally:
            self._pending_finalize = None

    def _dispatch_buffer(self, source: str) -> None:
        if not self._buffer:
            return
        self._silence_elapsed = 0.0
        frames, self._buffer = self._buffer, []
        _log(f"turn finalized from {source}, {len(frames)} frames, dispatching render")
        asyncio.create_task(self._handle_turn(frames))

    async def _watch_for_silence(self) -> None:
        while True:
            await asyncio.sleep(SPEAKING_POLL_INTERVAL_SECONDS)
            if self._has_explicit_turn_events:
                continue
            if self._speaking:
                self._silence_elapsed = 0.0
                continue
            if not self._buffer:
                continue
            self._silence_elapsed += SPEAKING_POLL_INTERVAL_SECONDS
            if self._silence_elapsed >= SILENCE_HOLD_SECONDS:
                self._dispatch_buffer("active-speaker fallback")

    async def _handle_turn(self, frames: list[rtc.AudioFrame]) -> None:
        # One render at a time — a turn that's still rendering when the next one
        # finishes would otherwise publish out of order.
        async with self._render_lock:
            try:
                video_bytes = await asyncio.wait_for(self._render(frames), timeout=RENDER_TIMEOUT_SECONDS)
            except (TimeoutError, asyncio.TimeoutError, httpx.HTTPError) as exc:
                _log(f"Render failed or timed out ({exc}) — falling back to raw audio for this turn.")
                await self._play_frames(frames)
                return
            if video_bytes is None:
                await self._play_frames(frames)
                return
            _log(f"_handle_turn: render succeeded, {len(video_bytes)} bytes, playing rendered clip")
            await self._play_rendered_clip(video_bytes, frames)

    async def _render(self, frames: list[rtc.AudioFrame]) -> bytes | None:
        wav_bytes = _frames_to_wav(frames)
        _log(f"_render: sending {len(wav_bytes)} bytes of WAV audio to avatar-worker")
        data = {"avatar_id": self._avatar_id}
        if self._gesture is not None:
            data["gesture_json"] = json.dumps(self._gesture)
        resp = await self._client.post(
            f"{AVATAR_WORKER_URL.rstrip('/')}/internal/v1/render",
            headers={"x-internal-key": INTERNAL_KEY},
            data=data,
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

    async def _play_rendered_clip(self, mp4_bytes: bytes, audio_frames: list[rtc.AudioFrame]) -> None:
        with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as f:
            f.write(mp4_bytes)
            video_path = f.name
        try:
            frames, fps = _read_video_frames(video_path)
            if not frames:
                _log("Rendered clip contained no readable video frames; replaying clean audio only.")
                await self._play_frames(audio_frames)
                return
            # Reuse the original LiveKit PCM instead of decoding the AAC copy from
            # the MP4. This avoids a lossy encode/decode cycle and its priming
            # padding, which was audible as broken words and visible as lip drift.
            await asyncio.gather(
                self._play_video_frames(frames, 1.0 / fps),
                self._play_frames(audio_frames),
            )
        finally:
            Path(video_path).unlink(missing_ok=True)

    async def _play_video_frames(self, frames: list[np.ndarray], interval: float) -> None:
        loop = asyncio.get_running_loop()
        started_at = loop.time()
        for index, bgr in enumerate(frames):
            self._capture_video_frame(bgr)
            delay = started_at + ((index + 1) * interval) - loop.time()
            if delay > 0:
                await asyncio.sleep(delay)

    def _capture_video_frame(self, bgr: np.ndarray) -> None:
        # Assigned faces and rendered clips can have different dimensions; every
        # frame must match the fixed dimensions declared by VideoSource.
        resized = cv2.resize(bgr, (PUBLISH_VIDEO_WIDTH, PUBLISH_VIDEO_HEIGHT))
        rgb = cv2.cvtColor(resized, cv2.COLOR_BGR2RGB)
        self._video_source.capture_frame(
            rtc.VideoFrame(
                PUBLISH_VIDEO_WIDTH,
                PUBLISH_VIDEO_HEIGHT,
                rtc.VideoBufferType.RGB24,
                rgb.tobytes(),
            )
        )

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
