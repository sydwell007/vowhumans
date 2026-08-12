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

NOT YET RUN AGAINST REAL HARDWARE. This was written from MuseTalk's documented
module layout and public source, not verified against a live GPU, since none was
available while writing it. The exact import paths, function signatures, and
tensor shapes are very likely to need at least one round of correction once run
for real — same as every other backend piece in this project needed real-log-driven
fixes before it worked. Treat the first deploy as a debugging session, not a
finished feature.
"""
from __future__ import annotations

import copy
import os
import pickle
import subprocess
import tempfile
import uuid
from dataclasses import dataclass
from pathlib import Path

import cv2
import numpy as np
import torch

MODELS_DIR = Path(os.getenv("MUSETALK_MODELS_DIR", "./models"))
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
FPS = 25
BATCH_SIZE = int(os.getenv("MUSETALK_BATCH_SIZE", "4"))


@dataclass
class PreparedAvatar:
    """Everything computed once from a still face image, reused for every render."""
    original_frame: np.ndarray
    bbox: tuple[int, int, int, int]
    latent: torch.Tensor
    mask: np.ndarray
    mask_crop_box: tuple[int, int, int, int]


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
        self.face_parser = FaceParsing()

    def prepare_avatar(self, image_path: str) -> PreparedAvatar:
        from musetalk.utils.blending import get_image_prepare_material
        from musetalk.utils.preprocessing import get_landmark_and_bbox

        frame = cv2.imread(image_path)
        if frame is None:
            raise ValueError(f"Could not read image at {image_path}")

        coord_list, frame_list = get_landmark_and_bbox([image_path], bbox_shift=0)
        bbox = coord_list[0]
        if bbox == coord_list[0] and bbox is None:
            raise ValueError("No face detected in the supplied image.")
        x1, y1, x2, y2 = bbox

        crop = frame_list[0][y1:y2, x1:x2]
        crop = cv2.resize(crop, (256, 256), interpolation=cv2.INTER_LANCZOS4)
        with torch.no_grad():
            latent = self.vae.get_latents_for_unet(crop)

        mask, mask_crop_box = get_image_prepare_material(frame, bbox, fp=self.face_parser, mode="jaw")

        return PreparedAvatar(original_frame=frame, bbox=bbox, latent=latent, mask=mask, mask_crop_box=mask_crop_box)

    def render(self, avatar: PreparedAvatar, audio_path: str, out_dir: str | None = None) -> str:
        """Renders one short clip for one reply's audio against a prepared avatar.
        Returns the path to an MP4 (video + the same audio, muxed) on disk."""
        from musetalk.utils.blending import get_image_blending
        from musetalk.utils.utils import datagen

        out_dir = out_dir or tempfile.mkdtemp(prefix="musetalk-render-")
        frames_dir = Path(out_dir) / "frames"
        frames_dir.mkdir(parents=True, exist_ok=True)

        whisper_input = self.audio_processor.get_audio_feature(audio_path, weight_dtype=self.weight_dtype)
        whisper_chunks = self.audio_processor.get_whisper_chunk(
            whisper_input, DEVICE, self.weight_dtype, self.pe, fps=FPS, audio_padding_length_left=2, audio_padding_length_right=2,
        )
        frame_count = len(whisper_chunks)
        if frame_count == 0:
            raise ValueError("No audio frames extracted — is the audio file empty or unreadable?")

        latents = [avatar.latent] * frame_count
        gen = datagen(whisper_chunks, latents, BATCH_SIZE)

        frame_index = 0
        for whisper_batch, latent_batch in gen:
            with torch.no_grad():
                audio_feature_batch = self.pe(whisper_batch.to(DEVICE, dtype=self.weight_dtype))
                pred_latents = self.unet.model(
                    latent_batch.to(DEVICE, dtype=self.weight_dtype),
                    torch.tensor([0], device=DEVICE),
                    encoder_hidden_states=audio_feature_batch,
                ).sample
                recon_frames = self.vae.decode_latents(pred_latents)

            for generated in recon_frames:
                blended = get_image_blending(
                    copy.deepcopy(avatar.original_frame), generated, avatar.bbox, avatar.mask, avatar.mask_crop_box,
                )
                cv2.imwrite(str(frames_dir / f"{frame_index:06d}.png"), blended)
                frame_index += 1

        silent_video_path = str(Path(out_dir) / "silent.mp4")
        subprocess.run(
            ["ffmpeg", "-y", "-r", str(FPS), "-i", str(frames_dir / "%06d.png"),
             "-vcodec", "libx264", "-pix_fmt", "yuv420p", silent_video_path],
            check=True, capture_output=True,
        )

        final_video_path = str(Path(out_dir) / f"reply-{uuid.uuid4().hex[:8]}.mp4")
        subprocess.run(
            ["ffmpeg", "-y", "-i", silent_video_path, "-i", audio_path,
             "-c:v", "copy", "-c:a", "aac", "-shortest", final_video_path],
            check=True, capture_output=True,
        )
        return final_video_path


def save_avatar_cache(avatar: PreparedAvatar, path: str) -> None:
    with open(path, "wb") as f:
        pickle.dump(avatar, f)


def load_avatar_cache(path: str) -> PreparedAvatar:
    with open(path, "rb") as f:
        return pickle.load(f)
