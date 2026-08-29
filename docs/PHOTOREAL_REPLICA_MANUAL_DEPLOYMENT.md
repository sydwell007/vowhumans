# Photoreal Replica manual deployment

## Safe order

1. Back up Neon and apply `packages/database/migrations/021_photoreal_replicas.sql` on staging first. Production builds run `scripts/migrate-replicas.mjs` under an advisory lock and verify all eight tables plus the no-`bytea` media boundary.
2. For the Afrihost adapter, upload the new PHP endpoint and import `public/sql/007_photoreal_replicas.sql`. Never upload SQL into a publicly accessible document path after import.
3. Configure a private S3-compatible bucket. Block public access; allow signed browser PUT from `https://vowhumans.com`; enable encryption, lifecycle retention and access logs.
4. Set `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY` and `S3_REGION` in the Vercel server environment.
5. Deploy `services/replica-processor` from `render.yaml`, set the same `VOWHUMANS_INTERNAL_KEY`, and verify `/health` reports `stores_raw_media: false`.
6. Set `REPLICA_PROCESSOR_URL` in Vercel. Keep every replica feature flag false.
7. Build a new RunPod image from `services/avatar-worker/Dockerfile`. The COPY line must include `video_replica_engine.py`, `renderer_contract.py`, `motion_director.py` and `stream_buffer.py` as well as the existing gesture/blink files.
8. Push a new immutable tag using the current registry convention; do not overwrite the deployed portrait tag.
9. Update/restart the RunPod pod and verify `/health` reports `model_loaded: true`, `video_replica_enabled: false` and the expected image tag in the platform console.
10. Deploy the avatar participant code to Render with `ENABLE_VIDEO_REPLICA=false`.
11. Deploy Studio/Vercel, apply the migration, and confirm `/studio/replicas` shows storage and feature truth correctly.

## Authorised POC

1. Register/approve the performer identity and active face/commercial consent.
2. Follow `REPLICA_CAPTURE_PROTOCOL.md` and capture the five required clips.
3. Submit processing. Resolve every automated failure; do not edit evidence to force a pass.
4. Enable `ENABLE_VIDEO_REPLICA=true` only in an isolated staging worker/participant environment.
5. Prepare the published version, render arbitrary speech, send one `vhm_motion_cue` explanation event and run the benchmark.
6. Record visual review and LiveKit latency evidence. Approval remains blocked while either is `not_tested`.
7. If—and only if—all gates pass, create an enabled `human_replica_assignments` record and run a limited pilot.

## Rollback

Set `ENABLE_VIDEO_REPLICA=false`. The participant immediately falls back to Quick Portrait, then audio-only if portrait preparation fails. Do not delete schema rows or capture evidence during incident rollback. Revoke the replica/identity for a consent event, disable the assignment, then complete audited object deletion.

## Streaming gate

Do not set `ENABLE_STREAMING_REPLICA=true` yet. Before enabling it, deploy a persistent 100–300 ms audio/frame transport, connect `LatestFrameBuffer` metrics, implement interruption cancellation and meet every LiveKit threshold in `REPLICA_PERFORMANCE_BENCHMARK.md`.
