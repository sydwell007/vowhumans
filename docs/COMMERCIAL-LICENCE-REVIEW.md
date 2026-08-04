# Commercial licence review

This is an engineering inventory, not legal advice. Re-check every version and transitive dependency before production.

| Dependency | Intended use | Licence / commercial posture | Production gate |
| --- | --- | --- | --- |
| Next.js, React, Turborepo | Studio and build orchestration | MIT | Preserve notices. |
| FastAPI, Uvicorn, Pydantic | Service APIs | MIT / BSD-3-Clause | Preserve notices. |
| PostgreSQL, Redis | Data and ephemeral state | PostgreSQL / BSD-3-Clause | Approved for normal commercial use. |
| MinIO client / server | S3-compatible development storage | Apache-2.0 / AGPLv3 server | Review network-use obligations; hosted S3 may be preferable. |
| LiveKit server / SDKs | WebRTC and agent transport | Apache-2.0 | Preserve notices; cloud service terms apply separately. |
| OpenAI APIs | Realtime, LLM, STT, TTS adapters | Commercial service terms | Account, data controls and current terms required. |
| MuseTalk | Optional lip synchronisation | Upstream terms must be checked at install time | Do not commit weights or enable until code, weights and dataset provenance are approved. |
| LivePortrait | Optional motion layer | Code/weight licences require review | Bundled InsightFace detection models are not approved for commercial production; replace detector first. |
| InsightFace bundled models | Face detection in some upstream examples | Commercial use restricted/unclear | Explicitly prohibited in production configuration. |
| FFmpeg | Media assembly | LGPL/GPL varies by build flags | Use an approved build and document codecs. |
| Lucide | Interface icons | ISC | Preserve notice. |

Actor recordings, cloned voices and face assets are not software dependencies. Each requires a separate identity-owner record, written face and voice consent, permitted applications/roles, geography, expiry and revocation controls.

