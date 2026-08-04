# Cost and observability design

Each provider call writes a `usage_record` with organisation, application, session/render, provider, model, unit, quantity, latency, estimated minor-unit cost and currency. Billing aggregation never requires reading private transcript content.

OpenTelemetry-compatible spans cover session creation, agent join, first transcript, first audio, avatar frame latency, dropped frames, reconnects, GPU memory, render duration and failure reason. Dashboards should break down p50/p95/p99 latency, failures and cost by organisation/application/provider. Budget alerts use daily and monthly thresholds; provider selection can hard-stop nonessential renders after budget exhaustion.

