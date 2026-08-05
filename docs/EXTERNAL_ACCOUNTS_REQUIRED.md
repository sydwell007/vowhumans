# External accounts and approvals

| Capability | Account or approval | Default |
|---|---|---|
| Domain/web | Domain registrar + Vercel project | DNS pending |
| API/database | Afrihost hosting + MariaDB | Uploaded base; expansion upload required |
| Authentication | Approved OIDC/auth provider or reviewed first-party service | Disabled |
| Transactional email | Approved sender, SPF/DKIM/DMARC and provider | Disabled |
| Payments | PayFast or Stripe merchant, tax and webhook review | Disabled |
| Realtime | LiveKit Cloud/self-host + TURN | Disabled |
| Models/TTS | Approved AI/voice provider and data terms | Disabled |
| GPU avatar/video | Licensed model assets and separate compute | Disabled |
| Storage | S3-compatible private bucket, lifecycle and CORS | Local development only |
| Monitoring | Error, trace, uptime and alert destination | Not configured |
| Compliance | Counsel, privacy, security and procurement review | Readiness only |

No account should be activated by placing a raw key in browser variables, SQL, the repository, or the Afrihost web root.
