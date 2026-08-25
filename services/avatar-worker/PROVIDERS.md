# Avatar providers

`MockAvatarProvider` validates the contract and fallback path. `MuseTalkAvatarProvider` will accept PCM/WAV chunks, warm approved weights, report frame latency, honour cancellation and expose only an authenticated internal endpoint. `LivePortraitMotionProvider` composes restrained expression templates through a replaceable detector abstraction. Commercial production must not use the restricted bundled InsightFace model. `NvidiaAudio2FaceProvider` is a future adapter only.

The LiveKit avatar participant is separately responsible for consuming agent audio, backpressure, frame/audio synchronisation, publishing tracks, preventing room reuse and disconnecting cleanly. Rendering failure always returns to audio-only.

## Production MuseTalk pod

Use a GPU with at least 16 GB VRAM and keep the pod in the region closest to the
Render workers and LiveKit region. An RTX 4090 is sufficient; the request/response
batch renderer and cross-region network path normally matter more than additional
GPU class once the model is warm.

The current image defaults `MUSETALK_BATCH_SIZE` to `16`. The participant waits for
the avatar tracks before the first reply, segments replies from explicit voice-agent
state events, and publishes the original LiveKit PCM alongside rendered frames. Do
not add browser-side audio delays or AAC re-encoding.

After building a new avatar-worker image, update the RunPod pod image tag, expose
TCP port `8000` as an HTTP service, and verify `https://<pod-id>-8000.proxy.runpod.net/health`
returns `model_loaded: true`. Then set the exact same URL as `AVATAR_WORKER_URL` on
the Render `vowhumans-avatar-participant` service and redeploy that service.
