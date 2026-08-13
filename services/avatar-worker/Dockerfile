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
    python3.10 python3.10-venv python3-pip git ffmpeg libgl1 libglib2.0-0 curl wget \
    && rm -rf /var/lib/apt/lists/*
RUN ln -sf /usr/bin/python3.10 /usr/bin/python

# The torch/mmcv/etc. installs below are multi-GB; a bare `pip install` gives
# up on the first slow read or a single flaky chunk. Confirmed live: one build
# failed on a corrupted-in-transit torch wheel (hash mismatch), the very next
# retry failed on a plain read timeout fetching a different package. Raise the
# timeout and let pip retry a flaky connection instead of failing the whole
# build on one bad chunk.
ENV PIP_DEFAULT_TIMEOUT=120
ENV PIP_RETRIES=5

WORKDIR /app

# MuseTalk is a research repo, not a pip package — vendor it in and put it on
# PYTHONPATH so musetalk_engine.py's `from musetalk...` imports resolve.
RUN git clone --depth 1 https://github.com/TMElyralab/MuseTalk.git /opt/MuseTalk
ENV PYTHONPATH="/opt/MuseTalk:${PYTHONPATH:-}"

# MuseTalk's own download_weights.sh has no error checking (it always prints
# "all weights downloaded successfully" regardless of what actually happened)
# and, confirmed live across three separate bugs, was silently fetching only
# a subset of the required files: a dead China-mirror HF_ENDPOINT, the
# deprecated `huggingface-cli` command, and `--include "a" "b"` syntax that
# the current `hf` CLI silently narrows to just the first pattern. Patching
# it incrementally cost several rebuild cycles: replaced entirely with our
# own download_weights.sh (fails loudly, fetches only what this service's
# inference path actually uses).
RUN rm /opt/MuseTalk/download_weights.sh

RUN pip install --no-cache-dir torch==2.0.1 torchvision==0.15.2 torchaudio==2.0.2 --index-url https://download.pytorch.org/whl/cu118
RUN pip install --no-cache-dir -r /opt/MuseTalk/requirements.txt
RUN pip install --no-cache-dir -U openmim \
    && mim install mmengine \
    && mim install "mmcv==2.0.1" \
    && mim install "mmdet==3.1.0" \
    && mim install "mmpose==1.1.0"

# MuseTalk's own requirements.txt doesn't pin huggingface-hub, so pip installs
# whatever is newest — which breaks transformers' internal version check
# (transformers requires huggingface-hub<1.0). Confirmed live on a real GPU pod:
# "ImportError: huggingface-hub>=0.19.3,<1.0 is required ... but found
# huggingface-hub==1.27.0". Pin it last so nothing upstream re-upgrades it.
RUN pip install --no-cache-dir "huggingface-hub<1.0,>=0.20.0"

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY main.py musetalk_engine.py entrypoint.sh download_weights.sh download_weights.py ./
RUN chmod +x entrypoint.sh download_weights.sh

EXPOSE 8000
ENTRYPOINT ["./entrypoint.sh"]
