# Recommended post-deployment improvements

## Next production increments

1. Add an asynchronous durable runner for tasks that exceed the synchronous Vercel function window, with idempotency keys and resumable checkpoints.
2. Add provider-specific cost calculators maintained from published price tables; keep `estimated_cost_minor` null until a verified calculator exists.
3. Add signed work-product export and release channels only after tool permissions, destination allowlists and human release policy are approved.
4. Add deployment promotion approval UI and automatic rollback to the prior immutable deployment version.
5. Add browser-based realtime test evidence for microphone consent, interruption, reconnect and audio fallback.
6. Add OpenTelemetry traces keyed by request, work item, deployment and provider request IDs without recording private prompt content.
7. Add controlled test fixtures per role template and regression runs after Persona, knowledge, tool or model-policy version changes.
8. Add retention controls for runtime usage/provider health separate from higher-value governance and review evidence.
9. Add SLOs only after sufficient real traffic exists; do not infer enterprise reliability from sandbox samples.
10. Add customer-facing incident messages and provider failover policies before enabling production runtime.

## Recommended default rollout

Keep Test Centre, Sandbox runner, provider health, work queue, work products and human review enabled. Keep external tools and production runtime disabled until each tenant has completed provider connection tests, escalation tests, review training and a signed production promotion.
