# Deployment guide

## Local CPU-safe development

1. Copy `.env.example` to `.env.local` and leave all GPU/realtime flags off.
2. Run `npm install && npm run dev` for the Studio only.
3. Start Docker Desktop, then run `docker compose up --build` for PostgreSQL, Redis, MinIO, LiveKit and mock workers.

## LiveKit Cloud plus RunPod or Modal GPU

Deploy the Studio separately, deploy the API/realtime services on a private container platform, and deploy `avatar-worker` and `presenter-worker` to the GPU provider. Give workers private service credentials, restrict ingress to the API/LiveKit control plane, pin an approved CUDA image, warm models, and publish health/latency metrics. Enable MuseTalk only after the commercial licence gate.

## Self-hosted LiveKit plus GPU VM

Place LiveKit and TURN behind TLS with UDP ports exposed, keep PostgreSQL/Redis private, and run GPU workers in the same low-latency region. Rotate LiveKit secrets, restrict worker egress, and test forced audio-only fallback before rollout.

## Vercel Studio frontend

Set the project root to `apps/studio-web`. Configure only public API base URLs in browser-exposed variables. Provider keys remain on external services. Vercel hosts the control plane UI, not MuseTalk, LivePortrait, FFmpeg batch renders or long-running LiveKit agents.

## Required manual actions

- Provision PostgreSQL, Redis and private S3 storage.
- Create LiveKit and model-provider accounts.
- Install an approved FFmpeg build for media workers.
- Approve each model/dependency licence and actor consent package.
- Configure DNS, TLS, CORS origins, secret rotation, backups, retention and deletion jobs.
- Run full consent, tenant-isolation, abuse and fallback tests in the target environment.

