# VowHumans Digital Human Platform

VowHumans is GoalVow's consent-first platform for reusable AI presenters, tutors, interview-practice partners, mentors and support agents. This repository is an honest production foundation: the Studio, governance workflows, mock conversation flows, versioned API surface, SDKs, database migrations and CPU-safe service scaffolds are implemented; realtime provider accounts and GPU inference remain explicit operator integrations.

## What works now

| Mode | Status | Notes |
| --- | --- | --- |
| Voice-only | Development-ready | Mock flow works; LiveKit/OpenAI adapters require server credentials. |
| Static portrait | Functional | Original AI-generated placeholder humans with visible disclosure. |
| Pre-rendered avatar | Scaffold | Queue contract and presenter workflow are present; FFmpeg is required. |
| Live 2D avatar | Scaffold | MuseTalk/LivePortrait worker interfaces; separate licensed GPU deployment required. |
| 3D avatar | Planned | Provider interface only; no false 3D preview. |
| Presenter rendering | Mock functional | Scene/queue UI and API contract work; media pipeline needs FFmpeg and TTS/GPU providers. |

VowHumans does **not** claim Tavus-equivalent quality.

## Start the Studio

```powershell
npm install
npm run dev
```

Open `http://localhost:3000`. The UI runs with safe mock data and without a GPU. Copy `.env.example` to `.env.local` only when adding server-side providers.

## Validate

```powershell
npm run check
```

Docker Desktop must be running before `docker compose up --build`. FFmpeg is required for real presenter exports. The local audit found Node 24, npm 11, Python 3.14, Docker CLI 28, Git 2.54, and a GTX 1050 Ti; Docker daemon, FFmpeg and CUDA toolkit were unavailable during initial generation.

## Repository map

- `apps/studio-web` — Next.js Studio plus Interview, Tutor and Presenter demos.
- `services/*` — FastAPI API, realtime, avatar, presenter, media and moderation boundaries.
- `packages/database` — PostgreSQL core schema with organisation isolation.
- `packages/persona-schema` — immutable Persona contracts and avatar state machine.
- `packages/sdk-typescript`, `packages/sdk-python` — integration clients.
- `public/php`, `public/sql` — isolated Afrihost PHP/MySQL integration adapter for manual upload.
- `docs` — architecture, licensing, deployment, safety and integration guides.

## Manual accounts and tools

Real realtime operation needs OpenAI and LiveKit credentials. Media storage needs S3/MinIO. GPU modes need a CUDA-capable provider (RunPod, Modal or a GPU VM), approved model licences and licensed actor media. Vercel may host the Studio only; do not deploy GPU inference there.

See [Architecture](docs/ARCHITECTURE.md), [Commercial licence review](docs/COMMERCIAL-LICENCE-REVIEW.md), [Known limitations](docs/KNOWN-LIMITATIONS.md), and [Afrihost adapter](public/php/README.md).

