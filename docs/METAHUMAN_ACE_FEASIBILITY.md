# MetaHuman / NVIDIA ACE feasibility

## Fit

MetaHuman in Unreal Engine 5.8 is now the implemented **Fully Rigged 3D** pilot provider for use cases that value controllable full-body animation, camera movement and stylised production over literal captured-video fidelity. NVIDIA ACE remains optional and is not required by the current implementation.

## Advantages

- Mature facial/body rig and animation tooling.
- Structured animation and gesture control.
- Strong Unreal Engine production ecosystem.
- Built-in MetaHuman Animator audio-driven animation is the preferred first facial solver; ACE remains a separately gated future option.

## Constraints to validate

- MetaHuman, Unreal and ACE licensing for SaaS, customer exports and white-label applications.
- GPU size, cold start, concurrency and regional availability.
- Pixel-streaming/web delivery cost and mobile/browser behavior.
- Performer consent mapping from a real identity into a rigged representation.
- Vendor lock-in, export formats and long-term asset portability.
- Whether output quality meets VowHumans' disclosed-AI promise without creating an uncanny mismatch with the performer.

## Implemented boundary

The separate `vowhumans-metahuman` repository now provides the UE 5.8 stage, authenticated semantic-control bridge, local runtime broker, Pixel Streaming 2 bootstrap and assembled-character validator. Studio-web allocates it only for an approved, published `rigged_3d` assignment with active face and commercial consent. The browser receives a validated player URL rather than the broker secret.

Keep `ENABLE_RIGGED_3D=false` until the first licensed character passes rig, face, body-motion and streaming-latency review. Keep `ENABLE_METAHUMAN_ACE=false` unless ACE is independently licensed and integrated. Never silently substitute this renderer when a customer selected Photoreal Replica; the embed exposes an explicit voice fallback only when 3D allocation fails.
