# Cost and usage model

Commercial logic is centralised in `packages/commercial-core`. Proposed launch plans are Sandbox, Starter, Professional, Business and Enterprise, priced in ZAR with a configurable 15% annual discount. VAT, provider premiums and contract terms are not hard-coded as final commercial commitments.

Meter at minimum: live audio minutes, provider model tokens, TTS characters/minutes, presenter minutes, GPU seconds, render output duration, object storage/egress, API calls, webhook attempts, seats, premium identity/voice licences, support tier and marketplace gross/commission/payout.

Every usage record needs organisation, workspace, product, provider, unit, quantity, unit cost, currency, event time and idempotency key. Provider invoice reconciliation must compare raw provider totals with internal aggregates. Budgets and alerts should warn before hard limits. The ROI calculator uses disclosed assumptions and exports a directional estimate; it is not a quote or guarantee.
