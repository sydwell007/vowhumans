# CUDA 11.8 matches MuseTalk's documented PyTorch 2.0.1+cu118 requirement.
# Built for a RunPod GPU Pod (persistent, not RunPod Serverless) — this process
# loads several GB of model weights into GPU memory once at startup and stays
# resident, which fits a long-running pod much better than a cold-started
# serverless function.
#
# Model weights are NOT baked into this image (they're several GB and would make
# the image slow to build and push). Instead entrypoint.sh downloads them once,
# on first boot, into RunPod's persistent Network Volume (mounted at /workspace)
# — every restart after that reuses the cached copy instead of re-downloading.
FROM nvidia/cuda:11.8.0-cudnn8-runtime-ubuntu22.04

ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3.10 python3.10-venv python3-pip git ffmpeg libgl1 libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*
RUN ln -sf /usr/bin/python3.10 /usr/bin/python

WORKDIR /app

# MuseTalk is a research repo, not a pip package — vendor it in and put it on
# PYTHONPATH so musetalk_engine.py's `from musetalk...` imports resolve. Its
# download_weights.sh (run at container startup, not build time — see entrypoint.sh)
# needs to run from within this checkout.
RUN git clone --depth 1 https://github.com/TMElyralab/MuseTalk.git /opt/MuseTalk
ENV PYTHONPATH="/opt/MuseTalk:${PYTHONPATH:-}"

RUN pip install --no-cache-dir torch==2.0.1 torchvision==0.15.2 torchaudio==2.0.2 --index-url https://download.pytorch.org/whl/cu118
RUN pip install --no-cache-dir -r /opt/MuseTalk/requirements.txt
RUN pip install --no-cache-dir -U openmim \
    && mim install mmengine \
    && mim install "mmcv==2.0.1" \
    && mim install "mmdet==3.1.0" \
    && mim install "mmpose==1.1.0"

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY main.py musetalk_engine.py entrypoint.sh ./
RUN chmod +x entrypoint.sh

EXPOSE 8000
ENTRYPOINT ["./entrypoint.sh"]
