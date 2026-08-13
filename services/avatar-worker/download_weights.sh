#!/bin/bash
# Replaces MuseTalk's own download_weights.sh, which had three compounding bugs
# (a dead China-mirror HF_ENDPOINT, the deprecated huggingface-cli command, and
# --include argument parsing that silently drops all but the first filename)
# plus no error checking of its own — it always printed a false "all weights
# downloaded successfully" regardless of what actually happened. This version
# fails loudly (set -e) and only fetches what musetalk_engine.py actually uses
# (skips MuseTalk's V1.0 weights and SyncNet, neither of which this service's
# inference path touches).
#
# The Hugging Face Hub files are fetched via download_weights.py, which calls
# huggingface_hub's Python API directly rather than shelling out to the `hf` /
# `huggingface-cli` console script — confirmed live that the script can be
# missing from PATH at runtime even when the package it ships from installed
# fine at build time (MuseTalk's own original script only worked around this
# by force-reinstalling "huggingface_hub[cli]" immediately before every call,
# which is exactly the kind of runtime-fragile behavior this rewrite exists to
# get away from).
set -e

CheckpointsDir="${1:-models}"
ScriptDir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
mkdir -p "$CheckpointsDir"/{musetalkV15,sd-vae,whisper,dwpose,face-parse-bisent}

python3 "$ScriptDir/download_weights.py" "$CheckpointsDir"

echo "[download_weights] Face parsing (BiSeNet, via Google Drive)..."
gdown 154JgKpzCPW82qINcVieuPH3fZ2e0P812 -O "$CheckpointsDir/face-parse-bisent/79999_iter.pth"

echo "[download_weights] Face parsing (ResNet18 backbone)..."
curl -fL https://download.pytorch.org/models/resnet18-5c106cde.pth \
  -o "$CheckpointsDir/face-parse-bisent/resnet18-5c106cde.pth"

echo "[download_weights] All weights downloaded and verified present."
