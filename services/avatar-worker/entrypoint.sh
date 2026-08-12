#!/bin/bash
set -e

# RunPod mounts a Network Volume at /workspace by default. Override
# RUNPOD_VOLUME_PATH as an env var on the Pod if yours is mounted elsewhere.
VOLUME_PATH="${RUNPOD_VOLUME_PATH:-/workspace}"
WORKSPACE_MODELS="$VOLUME_PATH/musetalk-models"
MUSETALK_REPO_MODELS=/opt/MuseTalk/models

mkdir -p "$WORKSPACE_MODELS"

# Point MuseTalk's own models/ directory at the persistent volume — MuseTalk's
# internal code (face parsing, dwpose config, etc.) resolves some weight paths
# as "./models/..." relative to its own repo root regardless of where we tell
# our download script to write, so this symlink keeps both sides looking at
# the same, persistent copy. After the first boot, restarts find the weights
# already present and skip the multi-GB download entirely.
if [ ! -L "$MUSETALK_REPO_MODELS" ]; then
  rm -rf "$MUSETALK_REPO_MODELS"
  ln -s "$WORKSPACE_MODELS" "$MUSETALK_REPO_MODELS"
fi

# Check every file the pipeline actually needs, not just one, before deciding
# the download can be skipped on restart.
WEIGHTS_COMPLETE=true
for f in \
  "musetalkV15/unet.pth" \
  "whisper/config.json" \
  "sd-vae/config.json" \
  "face-parse-bisent/79999_iter.pth" \
  "face-parse-bisent/resnet18-5c106cde.pth" \
  "dwpose/dw-ll_ucoco_384.pth"
do
  if [ ! -f "$WORKSPACE_MODELS/$f" ]; then
    WEIGHTS_COMPLETE=false
    echo "[entrypoint] Missing weight file: $f"
  fi
done

if [ "$WEIGHTS_COMPLETE" = false ]; then
  echo "[entrypoint] MuseTalk weights incomplete or missing on the network volume — (re)downloading now (several GB, this will take a while)..."
  bash /app/download_weights.sh "$WORKSPACE_MODELS"
else
  echo "[entrypoint] MuseTalk weights already present on the network volume — skipping download."
fi

export MUSETALK_MODELS_DIR="$WORKSPACE_MODELS"
exec uvicorn main:app --host 0.0.0.0 --port 8000
