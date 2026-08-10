#!/bin/bash
set -e

# RunPod mounts a Network Volume at /workspace by default. Override
# RUNPOD_VOLUME_PATH as an env var on the Pod if yours is mounted elsewhere.
VOLUME_PATH="${RUNPOD_VOLUME_PATH:-/workspace}"
WORKSPACE_MODELS="$VOLUME_PATH/musetalk-models"
MUSETALK_REPO_MODELS=/opt/MuseTalk/models

mkdir -p "$WORKSPACE_MODELS"

# Point MuseTalk's own models/ directory at the persistent volume so its
# download_weights.sh writes there directly — after the first boot, restarts
# find the weights already present and skip the multi-GB download entirely.
if [ ! -L "$MUSETALK_REPO_MODELS" ]; then
  rm -rf "$MUSETALK_REPO_MODELS"
  ln -s "$WORKSPACE_MODELS" "$MUSETALK_REPO_MODELS"
fi

if [ ! -f "$WORKSPACE_MODELS/musetalkV15/unet.pth" ]; then
  echo "[entrypoint] MuseTalk weights not found on the network volume — downloading now (first boot only, several GB, this will take a while)..."
  cd /opt/MuseTalk && bash download_weights.sh
  cd /app
else
  echo "[entrypoint] MuseTalk weights already present on the network volume — skipping download."
fi

export MUSETALK_MODELS_DIR="$WORKSPACE_MODELS"
exec uvicorn main:app --host 0.0.0.0 --port 8000
