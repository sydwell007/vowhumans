# Live voice deployment (interview demo)

Wires real end-to-end voice for `/demos/interview`: browser mic → LiveKit room → a
deployed agent worker → OpenAI Realtime API. Every other surface (Studio dashboard,
tutor, presenter) is unaffected and stays in today's honest mock mode.

This is an operator-run deployment to Railway. Nothing here is automated; follow the
steps in order and hand the resulting gateway URL back for the final wiring step.
Never commit real secret values into this repository — every value below is either a
placeholder or is described by reference to where it already lives (your local
`.env.local`, which is gitignored).

## What gets deployed

Two Python services from this repo, as three Railway services (one directory hosts
two different run modes):

| Railway service | Root directory | Start command | Purpose |
| --- | --- | --- | --- |
| `api-gateway` | `services/api-gateway` | (from `railway.json`, no override needed) | Mints LiveKit tokens, creates session contracts |
| `realtime-agent-health` | `services/realtime-agent` | (from `railway.json`, no override needed) | Health/contract API only |
| `realtime-agent-worker` | `services/realtime-agent` | override to `python livekit_agent.py start` | The actual voice bridge — joins LiveKit rooms and talks to OpenAI Realtime |

Railway auto-detects Python via each directory's `requirements.txt` (Nixpacks) — no
Dockerfile needed. `realtime-agent-worker` needs its start command overridden in the
Railway dashboard (Settings → Deploy → Custom Start Command) since `railway.json` only
covers the default (health API) mode for that directory.

## 1. Create the Railway project

1. Sign up / log in at railway.app, create a new project from this GitHub repo.
2. Add three services as described in the table above, each with **Root Directory**
   set to the listed path. For `realtime-agent-worker`, after creating it, override
   its start command in the dashboard.
3. `realtime-agent-worker` doesn't need a public domain/port exposed (it makes
   outbound connections to LiveKit Cloud, not inbound HTTP) — you can leave
   networking off for that one service.

## 2. Set environment variables per service

**`api-gateway`:**
- `VOWHUMANS_ALLOWED_ORIGIN` = `https://vowhumans.com`
- `VOWHUMANS_SERVICE_API_KEYS` = a JSON object mapping each caller's key to the
  organisation UUID it's allowed to act as. For the public interview demo you need
  exactly this entry (the UUID is fixed in code, do not change it):
  ```json
  {"<value of VOWHUMANS_SERVICE_API_KEY from your .env.local>":"00000000-0000-4000-8000-000000000001"}
  ```
- `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET` = same values as `LIVEKIT_API_KEY` /
  `LIVEKIT_API_SECRET` in your local `.env.local`.
- `VOWHUMANS_EMBED_TOKEN_SECRET` = same value as `VOWHUMANS_EMBED_TOKEN_SECRET` in
  studio-web's environment (Vercel). Authenticates the short-lived embed token
  studio-web mints server-side for `/embed/*` live calls — a third `auth_context()`
  mode alongside the two above, used only by studio-web's own public embed routes,
  never by the browser or the PHP adapter directly.

**`realtime-agent-health`:** no required env vars beyond defaults.

**`realtime-agent-worker`:**
- `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` = same values as your local
  `.env.local`.
- `OPENAI_API_KEY` = same value as your local `.env.local`.
- `OPENAI_REALTIME_MODEL` = same value as your local `.env.local` (`gpt-realtime-2`).
- `ENABLE_OPENAI_REALTIME` = `true`.

## 3. Deploy and get the gateway URL

Deploy all three. Railway gives `api-gateway` a public URL like
`https://api-gateway-production-xxxx.up.railway.app`. Confirm it's healthy:

```
curl https://<your-api-gateway-url>/api/v1/health
```

Should return `{"status":"ok",...}`. Send me that URL — the remaining wiring below
needs it and I'll apply it for you.

## 4. Final wiring (once the gateway URL is known)

Three places need the real URL and matching keys:

1. **Live `config.php`** on Afrihost (`platform.base_url` currently self-references
   `https://api.vowhumans.com`, which is wrong — it must point at the Railway
   gateway):
   ```php
   'platform' => [
       'base_url' => 'https://<your-api-gateway-url>',
       'service_api_key' => '<PHP_GATEWAY_KEY>',
   ],
   'webhook_secrets' => ['platform' => '<WEBHOOK_SECRET>'],
   ```
   `<PHP_GATEWAY_KEY>` and `<WEBHOOK_SECRET>` must be two **different** freshly
   generated random values (previously both fields were set to the same value —
   fixed separately in this pass; I generated fresh ones for you in chat, not
   written here). Add `<PHP_GATEWAY_KEY>` to `api-gateway`'s
   `VOWHUMANS_SERVICE_API_KEYS` map on Railway too, bound to the same demo
   organisation UUID, so the PHP adapter can also mint tokens if it ever needs to.

2. **Vercel project settings** (Production and Preview environments):
   - `API_GATEWAY_URL` = `https://<your-api-gateway-url>`
   - `VOWHUMANS_SERVICE_API_KEY` = the same value already in your local `.env.local`
     (must match an entry in the gateway's `VOWHUMANS_SERVICE_API_KEYS`).
   - `VOWHUMANS_EMBED_TOKEN_SECRET` = a freshly generated random value, also set on
     `api-gateway` above (must match exactly on both sides — this one is never
     shared with the PHP adapter or any other caller).

3. **Local `.env.local`** (optional, only if you want to test against the real
   deployed backend from `npm run dev` instead of the mock): set `API_GATEWAY_URL`
   to the same Railway URL.

## Verification

- `curl https://<gateway-url>/api/v1/health` → `200`.
- Visit `/demos/interview`, complete setup, click start. If everything above is wired,
  the room shows "Live voice is connected" and a real OpenAI voice responds to your
  mic. If any piece isn't reachable, the page falls back to today's existing safe
  mock room automatically — this is expected behaviour, not a bug, and confirms the
  fallback path still works.
- Railway logs for `realtime-agent-worker` should show it registering with LiveKit
  and accepting a job when a room is created.
