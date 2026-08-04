# Known limitations and exact mode status

VowHumans is not Tavus-equivalent.

- **Voice-only:** the browser demo is functional in deterministic mock mode. LiveKit and OpenAI Realtime adapters require external accounts and credentials before real audio transport is functional.
- **Static portrait:** functional with the included original AI-generated placeholders and persistent visible disclosure.
- **Pre-rendered avatar:** job contracts and UI are implemented; a real MP4 is not generated until FFmpeg and a TTS/avatar provider are configured.
- **Live 2D avatar:** MuseTalk, motion and fallback service boundaries exist, but no model weights are bundled and the audited machine lacks CUDA toolkit support.
- **3D avatar:** not implemented. Audio2Face is a future adapter flag only.
- **Presenter rendering:** mock scene generation, queuing and progress states are functional. Production voice generation, compositing, caption alignment and export require provider configuration.

Other limitations: the local UI uses seeded development data; production authentication, email delivery, billing settlement, signed object URLs and persistent queues require infrastructure setup. The generated placeholder portraits must not be represented as real actors.

