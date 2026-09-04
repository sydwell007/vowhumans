"""Reliable video metadata probing for containers OpenCV reports incompletely."""
from __future__ import annotations

import json
import subprocess


def _rate(value: object) -> float:
    text = str(value or "0")
    try:
        numerator, denominator = text.split("/", 1)
        return float(numerator) / float(denominator) if float(denominator) else 0.0
    except (ValueError, ZeroDivisionError):
        try:
            return float(text)
        except ValueError:
            return 0.0


def probe_video(path: str) -> dict[str, float | int]:
    completed = subprocess.run(
        [
            "ffprobe", "-v", "error", "-select_streams", "v:0",
            "-show_entries", "stream=width,height,avg_frame_rate,r_frame_rate,nb_frames,duration:format=duration",
            "-of", "json", path,
        ],
        check=True,
        capture_output=True,
        text=True,
        timeout=30,
    )
    payload = json.loads(completed.stdout)
    stream = (payload.get("streams") or [{}])[0]
    container = payload.get("format") or {}
    fps = _rate(stream.get("avg_frame_rate")) or _rate(stream.get("r_frame_rate"))
    duration_seconds = float(stream.get("duration") or container.get("duration") or 0)
    try:
        frame_count = int(stream.get("nb_frames") or 0)
    except (TypeError, ValueError):
        frame_count = 0
    if frame_count <= 0 and duration_seconds > 0 and fps > 0:
        frame_count = round(duration_seconds * fps)
    return {
        "fps": fps,
        "frame_count": frame_count,
        "width": int(stream.get("width") or 0),
        "height": int(stream.get("height") or 0),
        "duration_ms": round(duration_seconds * 1000),
    }
