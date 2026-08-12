#!/bin/bash
# Replaces MuseTalk's own download_weights.sh, which had three compounding bugs
# (a dead China-mirror HF_ENDPOINT, the deprecated huggingface-cli command, and
# --include argument parsing that silently drops all but the first filename)
# plus no error checking of its own — it always printed a false "all weights
# downloaded successfully" regardless of what actually happened. This version
# fails loudly (set -e) and only fetches what musetalk_engine.py actually uses
# (skips MuseTalk's V1.0 weights and SyncNet, neither of which this service's
# inference path touches).
set -e

CheckpointsDir="${1:-models}"
mkdir -p "$CheckpointsDir"/{musetalkV15,sd-vae,whisper,dwpose,face-parse-bisent}

echo "[download_weights] MuseTalk V1.5 (unet)..."
hf download TMElyralab/MuseTalk --local-dir "$CheckpointsDir" \
  --include "musetalkV15/musetalk.json" --include "musetalkV15/unet.pth"

echo "[download_weights] SD VAE..."
hf download stabilityai/sd-vae-ft-mse --local-dir "$CheckpointsDir/sd-vae" \
  --include "config.json" --include "diffusion_pytorch_model.bin"

echo "[download_weights] Whisper (tiny)..."
hf download openai/whisper-tiny --local-dir "$CheckpointsDir/whisper" \
  --include "config.json" --include "pytorch_model.bin" --include "preprocessor_config.json"

echo "[download_weights] DWPose..."
hf download yzd-v/DWPose --local-dir "$CheckpointsDir/dwpose" \
  --include "dw-ll_ucoco_384.pth"

echo "[download_weights] Face parsing (BiSeNet, via Google Drive)..."
gdown 154JgKpzCPW82qINcVieuPH3fZ2e0P812 -O "$CheckpointsDir/face-parse-bisent/79999_iter.pth"

echo "[download_weights] Face parsing (ResNet18 backbone)..."
curl -fL https://download.pytorch.org/models/resnet18-5c106cde.pth \
  -o "$CheckpointsDir/face-parse-bisent/resnet18-5c106cde.pth"

echo "[download_weights] All weights downloaded and verified present."
