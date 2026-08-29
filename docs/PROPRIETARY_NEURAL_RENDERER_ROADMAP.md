# Proprietary neural renderer roadmap

VowHumans should not train a foundation avatar model now. The near-term moat is authorised capture quality, governance, motion continuity, provider portability and enterprise operation.

## Phase 1 — evidence and orchestration

- Complete one authorised captured-video POC.
- Measure mouth-only MuseTalk quality and LiveKit latency.
- Build a versioned capture corpus with explicit research/training consent separated from commercial rendering consent.
- Accumulate failure labels, not just successful demos.

## Phase 2 — provider abstraction and evaluation

- Compare at least two mouth-retargeting providers behind the same renderer contract.
- Standardise per-frame landmarks, masks, audio features and neutral transition metadata.
- Add reproducible offline evaluation for sync, temporal consistency and outside-mouth preservation.
- Keep customer raw media isolated; never create a shared training corpus by default.

## Phase 3 — bounded proprietary components

- Train small task-specific components only where benchmarks show a material gap: mouth compositing, temporal stabilisation, clip transitions or expression selection.
- Use licensed/consented data with provenance manifests and deletion lineage.
- Preserve provider fallback and exportability.

## Phase 4 — renderer decision

Only consider a complete proprietary renderer when usage, quality delta, unit economics, legal rights and retained engineering capability justify it. Require red-team review, model-card documentation, identity revocation tests and independent visual acceptance before pilot.
