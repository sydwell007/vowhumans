# Real authentication deployment

Registration, login, logout and session persistence are real now — scrypt-hashed
passwords, revocable server-side sessions (httpOnly cookie), lockout after 5 failed
attempts, `/studio` protected for any account, `/admin` protected to `owner`/`admin`
roles only. Nothing here is automated; this is an operator-run setup, same pattern as
the earlier live-voice/Railway handoff.

Not built yet, deliberately: email verification, password reset, MFA, SSO/OIDC. All
flagged in `docs/MANUAL_CONFIGURATION_REQUIRED.md` and `docs/SECURITY_RISK_REPORT.md`.

## 1. Provision the database

From the Vercel dashboard, attach a **Vercel Postgres** database to this project
(Storage → Create Database → Postgres). Vercel automatically injects `POSTGRES_URL`
(and related `POSTGRES_*` vars) into the project's environment variables — the app
reads `DATABASE_URL` first, falling back to `POSTGRES_URL`, so no extra wiring is
needed once it's attached.

## 2. Run the migrations, in order

Vercel Postgres doesn't auto-run init scripts the way the local `docker-compose`
Postgres container does (see `docker-compose.yml` — it mounts
`packages/database/migrations` as `/docker-entrypoint-initdb.d`, which only fires on
a fresh local container). Against the real database, run all four manually, in order,
using the connection string Vercel shows you (or `vercel env pull` to get it locally
first):

```
psql "$DATABASE_URL" -f packages/database/migrations/001_platform.sql
psql "$DATABASE_URL" -f packages/database/migrations/002_seed.sql
psql "$DATABASE_URL" -f packages/database/migrations/003_commercial_platform.sql
psql "$DATABASE_URL" -f packages/database/migrations/004_auth.sql
```

(`002_seed.sql` seeds the platform's own demo organisation/digital-humans/personas
data — unrelated to end-user accounts, but the later migrations reference tables it
touches, so keep the order.)

## 3. Confirm two more env vars in Vercel's Production environment

`AUTH_SECRET` and `SESSION_COOKIE_DOMAIN` already exist as env-var names (used
elsewhere for other purposes too) with real values in your local `.env.local` — but
**local values don't carry over to Vercel automatically**. Set both explicitly in the
Vercel project's Production environment:

- `AUTH_SECRET` — any 64+ random hex/base64 characters (peppers the stored session
  hash; generate a fresh one for production, don't reuse the local dev value).
- `SESSION_COOKIE_DOMAIN` — `.vowhumans.com` (leading dot, so the cookie works across
  the apex and any subdomain). Leave unset locally — the code treats `localhost` as
  "don't set a cookie domain".

## Verification

- `curl https://<your-deployment>/api/v1/auth/session` → `{"success":true,"data":{"authenticated":false}}` once the DB is wired but before anyone's logged in.
- Register a new workspace at `/sign-up`, confirm you land in `/studio` with your real name/organisation shown in the sidebar and dashboard greeting.
- Log out (sidebar profile button), confirm `/studio` now redirects to `/sign-in`.
- Log back in with the same credentials; try 5 wrong passwords in a row and confirm the 6th (even correct) attempt is rejected as locked for a few minutes.
- Visit `/admin` on a fresh non-owner account (if you create one) and confirm it's blocked; on the original owner account, confirm it loads.
