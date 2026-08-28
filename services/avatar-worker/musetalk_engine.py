"""Wrapper around the real MuseTalk pipeline (github.com/TMElyralab/MuseTalk),
adapted from their file/CLI-driven scripts/realtime_inference.py into a class with
two phases matching how the model is actually meant to be used efficiently:

  prepare_avatar(image_path)  -- run once per face: detect the face, crop it,
                                  encode it into the model's latent space. Expensive
                                  (~1s), so the result is cached and reused for every
                                  subsequent reply from that digital human.
  render(avatar, audio_path)  -- run once per spoken reply: extract Whisper audio
                                  features, run them through the UNet against the
                                  *cached* latent, decode back to RGB, blend the
                                  generated mouth region onto the original frame,
                                  mux with the audio into an MP4.

This imports MuseTalk's own modules rather than reimplementing the model — the
MuseTalk repo must be present on PYTHONPATH (the Dockerfile clones it) with model
weights downloaded to ./models per TMElyralab/MuseTalk's own setup instructions.

Verified against MuseTalk's actual source (musetalk/utils/*.py) and its reference
scripts/realtime_inference.py after the first live run surfaced several signature
mismatches from writing this against docs alone: get_landmark_and_bbox()'s real
parameter is upperbondrange (not bbox_shift) and its "no face" sentinel is
(0.0, 0.0, 0.0, 0.0) (not None); get_whisper_chunk() needs the actual WhisperModel
plus a librosa_length argument neither of which this originally passed (self.pe,
a PositionalEncoding module, is unrelated to the whisper encoder).
"""
from __future__ import annotations

import logging
import os
import pickle
import shutil
import subprocess
import tempfile
import uuid
from dataclasses import dataclass
from pathlib import Path

import cv2
import numpy as np
import torch

from blink_synth import BlinkMaterial, BlinkSchedule, apply_blink, build_blink_material
from gesture_sway import GestureConfig, apply_gesture_sway

log = logging.getLogger(__name__)

MODELS_DIR = Path(os.getenv("MUSETALK_MODELS_DIR", "./models"))
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
FPS = 25
BATCH_SIZE = int(os.getenv("MUSETALK_BATCH_SIZE", "16"))

__all__ = [
    "GestureConfig", "MuseTalkEngine", "apply_gesture_sway",
    "save_avatar_cache", "load_avatar_cache",
]


@dataclass
class PreparedAvatar:
    """Everything computed once from a still face image, reused for every render."""
    original_frame: np.ndarray
    bbox: tuple[int, int, int, int]
    latent: torch.Tensor
    mask: np.ndarray
    mask_crop_box: tuple[int, int, int, int]
    # None whenever the Haar cascade eye detector couldn't confidently find
    # both eyes in this particular source photo — see blink_synth.py. A
    # trailing field with a default so this stays a valid dataclass without
    # having to touch every existing positional construction of this class.
    blink_material: BlinkMaterial | None = None


class MuseTalkEngine:
    """Loads MuseTalk once at process startup; process crashes loudly if the
    weights/imports aren't right, rather than silently degrading — the caller
    (main.py) decides whether to fall back to audio-only when ENABLE_MUSETALK
    is off or this constructor raises."""

    def __init__(self) -> None:
        # Deferred import: these packages only exist once MuseTalk's own repo is
        # cloned onto PYTHONPATH by the Dockerfile, and importing them eagerly at
        # module load time would break `main.py --help`-style usage / local dev
        # without the weights present.
        from transformers import WhisperModel

        from musetalk.utils.audio_processor import AudioProcessor
        from musetalk.utils.face_parsing import FaceParsing
        from musetalk.utils.utils import load_all_model

        # MuseTalk's own load_all_model()/VAE loading resolves the vae_type
        # ("sd-vae") as the *relative* path "models/sd-vae" internally — it
        # assumes the process cwd is MuseTalk's own repo root. This service's
        # cwd is /app (its own WORKDIR), so that relative path resolved to
        # nowhere. Confirmed live: "OSError: models/sd-vae is not a local
        # folder and is not a valid model identifier". /opt/MuseTalk/models is
        # a symlink to MUSETALK_MODELS_DIR (entrypoint.sh), so this also picks
        # up the real, persistent-volume weights correctly.
        os.chdir("/opt/MuseTalk")

        unet_model_path = str(MODELS_DIR / "musetalkV15" / "unet.pth")
        unet_config_path = str(MODELS_DIR / "musetalkV15" / "musetalk.json")
        whisper_dir = str(MODELS_DIR / "whisper")

        self.vae, self.unet, self.pe = load_all_model(
            unet_model_path=unet_model_path,
            vae_type="sd-vae",
            unet_config=unet_config_path,
            device=DEVICE,
        )
        self.vae.vae = self.vae.vae.half().to(DEVICE)
        self.unet.model = self.unet.model.half().to(DEVICE)
        self.pe = self.pe.half().to(DEVICE)
        self.weight_dtype = torch.float16

        self.audio_processor = AudioProcessor(feature_extractor_path=whisper_dir)
        # AudioProcessor only wraps the feature *extractor* (mel-spectrogram prep) —
        # get_whisper_chunk() separately needs the actual Whisper encoder model to turn
        # those features into hidden states. Confirmed against MuseTalk's own
        # scripts/realtime_inference.py: this is loaded as a second, separate object,
        # not something AudioProcessor or load_all_model() already provides.
        self.whisper = WhisperModel.from_pretrained(whisper_dir).to(device=DEVICE, dtype=self.weight_dtype).eval()
        self.whisper.requires_grad_(False)
        self.face_parser = FaceParsing()
        self._timesteps = torch.tensor([0], device=DEVICE)

    def prepare_avatar(self, image_path: str) -> PreparedAvatar:
        from musetalk.utils.blending import get_image_prepare_material
        from musetalk.utils.preprocessing import get_landmark_and_bbox

        frame = cv2.imread(image_path)
        if frame is None:
            raise ValueError(f"Could not read image at {image_path}")

        # MuseTalk's real parameter name is upperbondrange, not bbox_shift (confirmed live:
        # "get_landmark_and_bbox() got an unexpected keyword argument 'bbox_shift'"). It also
        # signals "no face detected" with the placeholder (0.0, 0.0, 0.0, 0.0), not None.
        coord_list, frame_list = get_landmark_and_bbox([image_path], upperbondrange=0)
        bbox = coord_list[0]
        if bbox == (0.0, 0.0, 0.0, 0.0):
            raise ValueError("No face detected in the supplied image.")
        x1, y1, x2, y2 = bbox

        crop = frame_list[0][y1:y2, x1:x2]
        crop = cv2.resize(crop, (256, 256), interpolation=cv2.INTER_LANCZOS4)
        with torch.no_grad():
            latent = self.vae.get_latents_for_unet(crop)

        mask, mask_crop_box = get_image_prepare_material(frame, bbox, fp=self.face_parser, mode="jaw")

        # Best-effort and one-off: a photo the Haar cascade can't confidently
        # find both eyes in (steep angle, glasses glare, low light) must
        # never fail avatar prep — it just means blinking stays unavailable
        # for this one avatar while everything else still works.
        try:
            blink_material = build_blink_material(frame, bbox)
        except Exception:  # noqa: BLE001 - deliberately broad, see comment above
            log.warning("Blink material detection failed for this avatar; blinking will stay inactive.", exc_info=True)
            blink_material = None
        if blink_material is None:
            log.info("No confident 2-eye detection for this avatar; blinking will stay inactive for it.")

        return PreparedAvatar(
            original_frame=frame, bbox=bbox, latent=latent, mask=mask, mask_crop_box=mask_crop_box,
            blink_material=blink_material,
        )

    def render(self, avatar: PreparedAvatar, audio_path: str, gesture: GestureConfig | None = None, out_dir: str | None = None) -> str:
        """Renders one short clip for one reply's audio against a prepared avatar.
        Returns the path to an MP4 (video + the same audio, muxed) on disk."""
        from musetalk.utils.blending import get_image_blending
        from musetalk.utils.utils import datagen

        owns_out_dir = out_dir is None
        out_dir = out_dir or tempfile.mkdtemp(prefix="musetalk-render-")

        # get_audio_feature() returns (features, sample_count) — both required by
        # get_whisper_chunk() below (librosa_length has no default and was previously
        # omitted entirely; whisper here must be the WhisperModel, not self.pe, which
        # is an unrelated PositionalEncoding module). Confirmed against MuseTalk's own
        # scripts/realtime_inference.py.
        whisper_input_features, librosa_length = self.audio_processor.get_audio_feature(audio_path, weight_dtype=self.weight_dtype)
        whisper_chunks = self.audio_processor.get_whisper_chunk(
            whisper_input_features, DEVICE, self.weight_dtype, self.whisper, librosa_length,
            fps=FPS, audio_padding_length_left=2, audio_padding_length_right=2,
        )
        frame_count = len(whisper_chunks)
        if frame_count == 0:
            raise ValueError("No audio frames extracted — is the audio file empty or unreadable?")

        latents = [avatar.latent] * frame_count
        gen = datagen(whisper_chunks, latents, BATCH_SIZE)

        # One schedule per reply, built once against this reply's real
        # duration — not per-frame — so blink_alpha() below is a cheap,
        # allocation-free lookup in the hot per-frame loop. Requires both a
        # confident eye detection for this avatar (avatar.blink_material)
        # and the feature actually being enabled on the assigned profile.
        blink_schedule: BlinkSchedule | None = None
        if gesture is not None and gesture.blinking_enabled and avatar.blink_material is not None:
            blink_schedule = BlinkSchedule.build(
                max(gesture.blink_interval_min_seconds, 0.5),
                max(gesture.blink_interval_max_seconds, gesture.blink_interval_min_seconds, 0.5),
                total_seconds=frame_count / FPS,
            )

        silent_video_path = str(Path(out_dir) / "silent.mp4")
        height, width = avatar.original_frame.shape[:2]
        encoder = subprocess.Popen(
            [
                "ffmpeg", "-loglevel", "error", "-y", "-f", "rawvideo",
                "-pix_fmt", "bgr24", "-s", f"{width}x{height}", "-r", str(FPS),
                "-i", "pipe:0", "-an", "-vcodec", "libx264", "-preset", "ultrafast",
                "-tune", "zerolatency", "-pix_fmt", "yuv420p", silent_video_path,
            ],
            stdin=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )

        try:
            x1, y1, x2, y2 = avatar.bbox
            assert encoder.stdin is not None
            frame_index = 0
            for whisper_batch, latent_batch in gen:
                with torch.no_grad():
                    audio_feature_batch = self.pe(whisper_batch.to(DEVICE))
                    pred_latents = self.unet.model(
                        latent_batch.to(DEVICE, dtype=self.weight_dtype),
                        self._timesteps,
                        encoder_hidden_states=audio_feature_batch,
                    ).sample
                    pred_latents = pred_latents.to(device=DEVICE, dtype=self.vae.vae.dtype)
                    recon_frames = self.vae.decode_latents(pred_latents)

                for generated in recon_frames:
                    # Stream frames into ffmpeg. The previous PNG-per-frame path
                    # wrote and reread hundreds of large files for every reply.
                    resized = cv2.resize(generated.astype(np.uint8), (x2 - x1, y2 - y1))
                    blended = get_image_blending(
                        avatar.original_frame.copy(), resized, avatar.bbox, avatar.mask, avatar.mask_crop_box,
                    )
                    # Blink is composited before the gesture sway warp, not
                    # after, so the eye region moves together with the rest
                    # of the head during a tilt/nod/sway instead of visibly
                    # lagging behind it.
                    frame_t = frame_index / FPS
                    blended = apply_blink(blended, avatar.blink_material, frame_t, blink_schedule)
                    blended = apply_gesture_sway(blended, frame_t, gesture)
                    encoder.stdin.write(np.ascontiguousarray(blended).tobytes())
                    frame_index += 1

            encoder.stdin.close()
            stderr = encoder.stderr.read() if encoder.stderr is not None else b""
            return_code = encoder.wait()
            if return_code != 0:
                raise subprocess.CalledProcessError(return_code, encoder.args, stderr=stderr)

            final_video_path = str(Path(out_dir) / f"reply-{uuid.uuid4().hex[:8]}.mp4")
            subprocess.run(
                ["ffmpeg", "-loglevel", "error", "-y", "-i", silent_video_path, "-i", audio_path,
                 "-c:v", "copy", "-c:a", "aac", "-shortest", "-movflags", "+faststart", final_video_path],
                check=True, capture_output=True,
            )
            return final_video_path
        except Exception:
            if encoder.poll() is None:
                encoder.kill()
                encoder.wait()
            if owns_out_dir:
                shutil.rmtree(out_dir, ignore_errors=True)
            raise


def save_avatar_cache(avatar: PreparedAvatar, path: str) -> None:
    with open(path, "wb") as f:
        pickle.dump(avatar, f)


def load_avatar_cache(path: str) -> PreparedAvatar:
    with open(path, "rb") as f:
        return pickle.load(f)
