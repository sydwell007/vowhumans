# Architecture report and ADR-001

Status: accepted for the Phase 1–2 foundation on 2026-08-03.

## Decision

VowHumans is a standalone Turborepo. The Next.js Studio is a control plane, FastAPI services form the CPU/web data plane, LiveKit is the realtime transport, PostgreSQL is the source of truth, Redis carries locks and ephemeral session state, and S3-compatible storage holds consented media. GPU inference is an internal, separately deployed plane.

```text
Studio / SDK clients
        |
   API gateway  ---- PostgreSQL (tenant records, governance, usage)
        |       ---- Redis (queues, locks, session presence)
        |       ---- S3/MinIO (signed media objects)
        |
 LiveKit + realtime agent ---- STT / LLM / TTS providers
        |
 internal avatar participant ---- private GPU avatar worker
        |
 audio-only fallback when rendering is unavailable
```

The Afrihost PHP/MySQL files are an integration adapter for GoalVow shared-hosting applications. They hold integration metadata and initiate protected platform sessions; they do not run LiveKit agents, model inference, embeddings, or media processing.

## Why

- Shared hosting cannot safely or reliably run realtime and GPU inference.
- Provider interfaces prevent OpenAI, LiveKit, MuseTalk or a deployment vendor from becoming an irreversible dependency.
- A tenant-scoped relational core makes consent revocation, auditability and data deletion enforceable.
- Explicit feature flags allow the system to run without a GPU and prevent incomplete modes from appearing live.

## Trust boundaries

1. Browser clients receive short-lived room tokens, never provider credentials.
2. Service API keys are hashed and scoped; raw keys are displayed once.
3. Organisation IDs come from verified auth context, never from an untrusted request body alone.
4. Custom identities require approved, unexpired face and voice consent before publication or rendering.
5. Knowledge ingestion treats all uploaded and fetched content as data, not trusted Persona instructions.
6. Private PlugConnect answers are candidate-owned and excluded from employer retrieval paths.

## Provider contracts

All adapters expose `name`, `health`, capability metadata, and a typed operation. Realtime supports mock, OpenAI Realtime, or cascaded STT/LLM/TTS. Avatar supports mock, static, MuseTalk, LivePortrait composition, a future Audio2Face adapter, and audio-only fallback.

## Runtime audit

| Component | Audit result | Decision |
| --- | --- | --- |
| Node.js | 24.15.0 | Supported for local work; production Docker pins Node 22 LTS. |
| npm | 11.1.0 | Workspace package manager. |
| Python | 3.14.4 | Local compile validation; service image pins Python 3.12 for dependency support. |
| Docker CLI | 28.0.4 | Installed; daemon was not running. |
| FFmpeg | Not found | Presenter exports are disabled until installed or run in its worker image. |
| Git | 2.54.0 | Available. |
| NVIDIA | GTX 1050 Ti, 4 GB | Detected; insufficient assumption for production workloads. |
| CUDA toolkit | `nvcc` not found | GPU providers remain disabled. |

## Consequences

The first release is useful without pretending model inference is complete. Operators must configure external services, licences and consented assets before enabling live voice or avatar flags. This costs more integration effort but avoids deception, vendor lock-in and unsafe identity handling.

