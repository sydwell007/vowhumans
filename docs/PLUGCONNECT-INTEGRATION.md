# PlugConnect integration guide

PlugConnect uses a scoped service key (`sessions:create`, `sessions:read-own`, `usage:read-own`) to create a candidate-owned practice session. Send trusted job context from the PlugConnect server, choose `realistic`, `guided`, `quick` or `confidence`, and request a short-lived LiveKit token. Never send API keys from browser code.

Completion stores a transcript only when the candidate consented. Candidate feedback is returned to the candidate. Employer APIs receive session usage and completion status, never practice answers or transcript content.

See `packages/sdk-typescript/examples/plugconnect.ts` for a server-side example. Delete requests revoke signed media access and queue transcript/recording erasure according to retention policy.

