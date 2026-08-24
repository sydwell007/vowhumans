# Post-deployment manual actions

## Required

1. Deploy the build so Vercel prebuild applies PostgreSQL migration `019_post_deployment_runtime.sql` using the unpooled Neon connection.
2. Confirm `/api/health` reports `runtime_ready: true`.
3. In Vercel Production environment variables, set the desired gates from `.env.example`. Keep `ENABLE_PRODUCTION_RUNTIME=false` until production approval.
4. Confirm `OPENAI_API_KEY` and `OPENAI_CHAT_MODEL` only if model-backed sandbox work is authorised. A configured key does not enable execution unless `ENABLE_WORKFORCE_MODEL_EXECUTION=true`.
5. Set `AFRIHOST_API_BASE_URL` only if the compatibility bridge exposes a safe health endpoint. Do not copy Neon or provider credentials into `public/php` or `public/sql`.
6. Sign in as an owner/admin, open Operations and run **Test provider connections**.
7. Run Test Presence for one Digital Human; run Test Role, Test Work and Escalation for one deployed Digital Colleague.
8. Create a sandbox work item, generate a deterministic brief, record a human review and verify the runtime/decision trail.
9. Confirm pause blocks new work, resume restores it and cancellation preserves history.

## Provider-specific

- Realtime: test explicit microphone consent, disconnect/reconnect and interruption in each supported browser.
- Avatar/GPU: verify `/health`, rendering latency and automatic voice/text fallback.
- LiveKit: verify credentials, room creation and media transport without exposing secrets.
- OpenAI: verify the selected approved model and budget. `BUDGET_BLOCKED` requires billing/credit action, not a configuration reset.

## Rollback

Disable the relevant feature flag first. Pause affected Digital Colleagues in Operations. Preserve all runtime evidence. Roll back the Vercel deployment if needed; migration 019 is additive and should not be destructively reversed during an incident.
