"""Captured-video replica preparation and mouth-only MuseTalk retargeting.

Unlike the portrait renderer, this module never repeats one photograph and
never synthesises blink/body sway. Every output frame starts from an ordered
performer-captured source frame; MuseTalk replaces only its mouth region.
"""
from __future__ import annotations

import os
import shutil
import subprocess
import tempfile
import uuid
from dataclasses import dataclass
from pathlib import Path

import cv2
import numpy as np
import torch

from motion_director import ConversationState, MotionClip, MotionDirector
from renderer_contract import RendererTier

MAX_FRAMES_PER_CLIP = int(os.getenv("REPLICA_MAX_FRAMES_PER_CLIP", "750"))
FPS = 25


@dataclass
class PreparedReplicaFrame:
    source: np.ndarray
    bbox: tuple[int, int, int, int]
    latent: torch.Tensor
    mask: np.ndarray
    mask_crop_box: tuple[int, int, int, int]


@dataclass
class PreparedReplicaClip:
    descriptor: MotionClip
    frames: list[PreparedReplicaFrame]


@dataclass
class PreparedVideoReplica:
    clips: dict[str, PreparedReplicaClip]
    director: MotionDirector
    renderer_tier: RendererTier = RendererTier.VIDEO_REPLICA
    provider: str = "musetalk-video-replica"


def _decode_video(path: str) -> tuple[list[np.ndarray], float]:
    capture = cv2.VideoCapture(path)
    if not capture.isOpened():
        raise ValueError(f"Could not open replica clip at {path}")
    fps = float(capture.get(cv2.CAP_PROP_FPS) or FPS)
    frames: list[np.ndarray] = []
    try:
        while len(frames) < MAX_FRAMES_PER_CLIP:
            ok, frame = capture.read()
            if not ok:
                break
            frames.append(frame)
    finally:
        capture.release()
    if not frames:
        raise ValueError("Replica clip contained no readable frames.")
    # Normalize once so source cadence and MuseTalk's 25fps audio chunks agree.
    if abs(fps - FPS) > 0.25:
        duration = len(frames) / fps
        target_count = max(1, round(duration * FPS))
        frames = [frames[min(len(frames) - 1, round(index * fps / FPS))] for index in range(target_count)]
    return frames, fps


def prepare_video_replica(engine, clip_paths: dict[str, str], manifest: dict) -> PreparedVideoReplica:
    from musetalk.utils.blending import get_image_prepare_material
    from musetalk.utils.preprocessing import get_landmark_and_bbox

    descriptors: list[MotionClip] = []
    prepared: dict[str, PreparedReplicaClip] = {}
    manifest_clips = manifest.get("clips")
    if not isinstance(manifest_clips, list):
        raise ValueError("Replica manifest needs a clips list.")
    for raw in manifest_clips:
        if not isinstance(raw, dict):
            raise ValueError("Every replica clip descriptor must be an object.")
        key = str(raw.get("key", ""))
        if key not in clip_paths:
            raise ValueError(f"Missing uploaded clip '{key}'.")
        try:
            state = ConversationState(str(raw.get("state", "")))
        except ValueError as exc:
            raise ValueError(f"Unsupported conversation state for clip '{key}'.") from exc
        descriptor = MotionClip(
            key=key,
            state=state,
            gesture=raw.get("gesture_key") if isinstance(raw.get("gesture_key"), str) else None,
            intensity=max(1, min(3, int(raw.get("intensity", 1)))),
            starts_neutral=raw.get("starts_neutral") is True,
            ends_neutral=raw.get("ends_neutral") is True,
        )
        source_frames, _ = _decode_video(clip_paths[key])
        temp_dir = tempfile.mkdtemp(prefix="replica-landmarks-")
        try:
            frame_paths: list[str] = []
            for index, frame in enumerate(source_frames):
                frame_path = str(Path(temp_dir) / f"{index:06d}.jpg")
                if not cv2.imwrite(frame_path, frame, [cv2.IMWRITE_JPEG_QUALITY, 96]):
                    raise ValueError("Could not stage replica frame for landmark detection.")
                frame_paths.append(frame_path)
            coordinates, detected_frames = get_landmark_and_bbox(frame_paths, upperbondrange=0)
            prepared_frames: list[PreparedReplicaFrame] = []
            for index, (bbox, source) in enumerate(zip(coordinates, detected_frames, strict=True)):
                if bbox == (0.0, 0.0, 0.0, 0.0):
                    raise ValueError(f"Face tracking failed in clip '{key}' at frame {index}.")
                x1, y1, x2, y2 = bbox
                crop = source[y1:y2, x1:x2]
                crop = cv2.resize(crop, (256, 256), interpolation=cv2.INTER_LANCZOS4)
                with torch.no_grad():
                    latent = engine.vae.get_latents_for_unet(crop)
                mask, mask_crop_box = get_image_prepare_material(source, bbox, fp=engine.face_parser, mode="jaw")
                prepared_frames.append(PreparedReplicaFrame(source, bbox, latent, mask, mask_crop_box))
        finally:
            shutil.rmtree(temp_dir, ignore_errors=True)
        if len(prepared_frames) < 2:
            raise ValueError(f"Replica clip '{key}' needs at least two tracked frames.")
        descriptors.append(descriptor)
        prepared[key] = PreparedReplicaClip(descriptor, prepared_frames)
    # Construction also proves a safe idle fallback exists.
    director = MotionDirector(descriptors)
    director.select(ConversationState.IDLE)
    return PreparedVideoReplica(prepared, MotionDirector(descriptors))


def _loop_index(index: int, length: int) -> int:
    if length <= 1:
        return 0
    period = (length * 2) - 2
    offset = index % period
    return offset if offset < length else period - offset


def render_video_replica(
    engine,
    replica: PreparedVideoReplica,
    audio_path: str,
    conversation_state: str = "speaking",
    gesture_key: str | None = None,
    out_dir: str | None = None,
) -> str:
    from musetalk.utils.blending import get_image_blending
    from musetalk.utils.utils import datagen

    try:
        state = ConversationState(conversation_state)
    except ValueError as exc:
        raise ValueError(f"Unsupported conversation state '{conversation_state}'.") from exc
    selected = replica.director.select(state, gesture_key)
    clip = replica.clips[selected.key]
    owns_out_dir = out_dir is None
    out_dir = out_dir or tempfile.mkdtemp(prefix="replica-render-")
    features, audio_length = engine.audio_processor.get_audio_feature(audio_path, weight_dtype=engine.weight_dtype)
    chunks = engine.audio_processor.get_whisper_chunk(
        features, engine.whisper.device, engine.weight_dtype, engine.whisper, audio_length,
        fps=FPS, audio_padding_length_left=2, audio_padding_length_right=2,
    )
    if not chunks:
        raise ValueError("No audio frames extracted from the replica render request.")
    sequence = [clip.frames[_loop_index(index, len(clip.frames))] for index in range(len(chunks))]
    generator = datagen(chunks, [frame.latent for frame in sequence], int(os.getenv("MUSETALK_BATCH_SIZE", "16")))
    height, width = sequence[0].source.shape[:2]
    silent_path = str(Path(out_dir) / "silent.mp4")
    encoder = subprocess.Popen([
        "ffmpeg", "-loglevel", "error", "-y", "-f", "rawvideo", "-pix_fmt", "bgr24",
        "-s", f"{width}x{height}", "-r", str(FPS), "-i", "pipe:0", "-an", "-vcodec", "libx264",
        "-preset", "ultrafast", "-tune", "zerolatency", "-pix_fmt", "yuv420p", silent_path,
    ], stdin=subprocess.PIPE, stderr=subprocess.PIPE)
    frame_index = 0
    try:
        assert encoder.stdin is not None
        for whisper_batch, latent_batch in generator:
            with torch.no_grad():
                encoded_audio = engine.pe(whisper_batch.to(engine.whisper.device))
                predicted = engine.unet.model(
                    latent_batch.to(engine.whisper.device, dtype=engine.weight_dtype),
                    engine._timesteps,
                    encoder_hidden_states=encoded_audio,
                ).sample
                generated_frames = engine.vae.decode_latents(predicted.to(device=engine.whisper.device, dtype=engine.vae.vae.dtype))
            for generated in generated_frames:
                source = sequence[frame_index]
                x1, y1, x2, y2 = source.bbox
                mouth = cv2.resize(generated.astype(np.uint8), (x2 - x1, y2 - y1))
                # This is the defining replica contract: source body/head/eyes/hands
                # stay untouched; only MuseTalk's jaw/mouth mask is composited.
                output = get_image_blending(source.source.copy(), mouth, source.bbox, source.mask, source.mask_crop_box)
                encoder.stdin.write(np.ascontiguousarray(output).tobytes())
                frame_index += 1
        encoder.stdin.close()
        stderr = encoder.stderr.read() if encoder.stderr is not None else b""
        code = encoder.wait()
        if code != 0:
            raise subprocess.CalledProcessError(code, encoder.args, stderr=stderr)
        final_path = str(Path(out_dir) / f"replica-{uuid.uuid4().hex[:8]}.mp4")
        subprocess.run([
            "ffmpeg", "-loglevel", "error", "-y", "-i", silent_path, "-i", audio_path,
            "-c:v", "copy", "-c:a", "aac", "-shortest", "-movflags", "+faststart", final_path,
        ], check=True, capture_output=True)
        return final_path
    except Exception:
        if encoder.poll() is None:
            encoder.kill()
            encoder.wait()
        if owns_out_dir:
            shutil.rmtree(out_dir, ignore_errors=True)
        raise
