"""Downloads MuseTalk's inference weights straight through huggingface_hub's Python
API, instead of shelling out to the `hf`/`huggingface-cli` console script. Confirmed
live: that script was absent from PATH at runtime even though the huggingface-hub
package it ships from installed successfully at build time (MuseTalk's own deleted
download_weights.sh worked around this the same way we hit it — with a *runtime*
`pip install -U "huggingface_hub[cli]"` immediately before every call — which we
don't want to depend on either). Importing the library directly needs no console
script and no PATH at all.
"""
import sys
from pathlib import Path

from huggingface_hub import hf_hub_download

checkpoints_dir = Path(sys.argv[1] if len(sys.argv) > 1 else "models")

# (repo_id, filename, destination directory)
FILES = [
    ("TMElyralab/MuseTalk", "musetalkV15/musetalk.json", checkpoints_dir),
    ("TMElyralab/MuseTalk", "musetalkV15/unet.pth", checkpoints_dir),
    ("stabilityai/sd-vae-ft-mse", "config.json", checkpoints_dir / "sd-vae"),
    ("stabilityai/sd-vae-ft-mse", "diffusion_pytorch_model.bin", checkpoints_dir / "sd-vae"),
    ("openai/whisper-tiny", "config.json", checkpoints_dir / "whisper"),
    ("openai/whisper-tiny", "pytorch_model.bin", checkpoints_dir / "whisper"),
    ("openai/whisper-tiny", "preprocessor_config.json", checkpoints_dir / "whisper"),
    ("yzd-v/DWPose", "dw-ll_ucoco_384.pth", checkpoints_dir / "dwpose"),
]

for repo_id, filename, local_dir in FILES:
    print(f"[download_weights] {repo_id} :: {filename}", flush=True)
    local_dir.mkdir(parents=True, exist_ok=True)
    hf_hub_download(repo_id=repo_id, filename=filename, local_dir=str(local_dir))

print("[download_weights] Hugging Face Hub downloads done.", flush=True)
