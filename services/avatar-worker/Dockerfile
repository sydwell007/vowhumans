# CUDA 11.8 matches MuseTalk's documented PyTorch 2.0.1+cu118 requirement.
# Built for a RunPod GPU Pod (persistent, not RunPod Serverless) — this process
# loads several GB of model weights into GPU memory once at startup and stays
# resident, which fits a long-running pod much better than a cold-started
# serverless function.
FROM nvidia/cuda:11.8.0-cudnn8-runtime-ubuntu22.04

ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3.10 python3.10-venv python3-pip git ffmpeg libgl1 libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*
RUN ln -sf /usr/bin/python3.10 /usr/bin/python

WORKDIR /app

# MuseTalk is a research repo, not a pip package — vendor it in and put it on
# PYTHONPATH so musetalk_engine.py's `from musetalk...` imports resolve.
RUN git clone --depth 1 https://github.com/TMElyralab/MuseTalk.git /opt/MuseTalk
ENV PYTHONPATH=/opt/MuseTalk:$PYTHONPATH

RUN pip install --no-cache-dir torch==2.0.1 torchvision==0.15.2 torchaudio==2.0.2 --index-url https://download.pytorch.org/whl/cu118
RUN pip install --no-cache-dir -r /opt/MuseTalk/requirements.txt
RUN pip install --no-cache-dir -U openmim \
    && mim install mmengine \
    && mim install "mmcv==2.0.1" \
    && mim install "mmdet==3.1.0" \
    && mim install "mmpose==1.1.0"

# Model weights (several GB) — MuseTalk's own download script. Baking this into
# the image means a large image but an instant-ready container; if the RunPod
# build times out on this, switch to downloading at first boot into a RunPod
# Network Volume instead so it only happens once across restarts.
RUN cd /opt/MuseTalk && bash download_weights.sh
ENV MUSETALK_MODELS_DIR=/opt/MuseTalk/models

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY main.py musetalk_engine.py .

EXPOSE 8000
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
