# Avatar providers

`MockAvatarProvider` validates the contract and fallback path. `MuseTalkAvatarProvider` will accept PCM/WAV chunks, warm approved weights, report frame latency, honour cancellation and expose only an authenticated internal endpoint. `LivePortraitMotionProvider` composes restrained expression templates through a replaceable detector abstraction. Commercial production must not use the restricted bundled InsightFace model. `NvidiaAudio2FaceProvider` is a future adapter only.

The LiveKit avatar participant is separately responsible for consuming agent audio, backpressure, frame/audio synchronisation, publishing tracks, preventing room reuse and disconnecting cleanly. Rendering failure always returns to audio-only.

