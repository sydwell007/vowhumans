# URL and redirect plan

| Previous route | Canonical route | Behaviour |
|---|---|---|
| `/` Studio dashboard | `/studio` | New commercial home at `/`; Studio retained |
| `/dashboard` | `/studio/dashboard` | Temporary redirect |
| `/identities`, `/voices`, `/personas`, `/knowledge`, `/sessions`, `/presenter`, `/applications`, `/usage`, `/settings`, `/audit` | `/studio/{section}` | Temporary compatibility redirects |
| `/digital-humans` | `/digital-humans` | Now public gallery; Studio is `/studio/digital-humans` |
| `/integrations` | `/integrations` | Now public catalogue; Studio is `/studio/integrations` |
| `/webhooks` | `/webhooks` | Now developer documentation; Studio/API settings remain in the portals |

Use temporary redirects during the launch observation window. Change unambiguous legacy redirects to permanent only after analytics and external integrations show no unexpected callers.
