# MetaHuman / NVIDIA ACE feasibility

## Fit

MetaHuman plus NVIDIA ACE is a plausible **Fully Rigged 3D** provider for use cases that value controllable full-body animation, camera movement and stylised production over literal captured-video fidelity. It is not the foundation for the current replica POC.

## Advantages

- Mature facial/body rig and animation tooling.
- Structured animation and gesture control.
- Strong Unreal Engine production ecosystem.
- Potential ACE speech/facial animation integration on NVIDIA infrastructure.

## Constraints to validate

- MetaHuman, Unreal and ACE licensing for SaaS, customer exports and white-label applications.
- GPU size, cold start, concurrency and regional availability.
- Pixel-streaming/web delivery cost and mobile/browser behavior.
- Performer consent mapping from a real identity into a rigged representation.
- Vendor lock-in, export formats and long-term asset portability.
- Whether output quality meets VowHumans' disclosed-AI promise without creating an uncanny mismatch with the performer.

## Recommendation

Keep `Rigged3DProvider` as an experimental provider contract behind `ENABLE_METAHUMAN_ACE` and `ENABLE_RIGGED_3D`. Run a separate licensed feasibility spike after the captured-video replica has passed. Do not silently substitute a 3D rig when a customer selected Photoreal Replica.
