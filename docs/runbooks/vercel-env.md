# Vercel environment & secrets

This repo runs as **one Vercel project** with:
- **Frontend**: `chief-os.ai`
- **API**: `api.chief-os.ai` (host-based rewrite to `/api/*` via `vercel.json`)
- **Cron**: calls `/api/cron/sync-and-run` daily (see `vercel.json`)

## Environments

### Local (`.env`)
- Use `.env.example` → `.env` as a starting point.
- Keep real secrets out of git (the repo ignores `.env*` files).

### Preview (Vercel PR previews)
Recommended defaults:
- Use a **separate database** or schema from production.
- Use **separate Google OAuth credentials** (or limit to test accounts).
- Disable risky automation by default (see “Automation safety” below).

### Production
- Real domains, real database, real OAuth app.
- Any Gmail mutation must be auditable + reversible.

## Required env vars (production)

### Core
- `AUTH_SECRET`
- `AUTH_URL` (set to `https://chief-os.ai`)
- `DATABASE_URL`
- `DIRECT_URL` (recommended; direct/non-pooler URL for migrations)
- `NEXT_PUBLIC_API_BASE_URL` (set to `https://api.chief-os.ai`)

### Google OAuth
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `ENCRYPTION_KEY` (64 hex chars; encrypts Google refresh tokens)

### Cron
- `CRON_SECRET` (Bearer secret required by `/api/cron/sync-and-run`)

### Morning Brief Email
- `EMAIL_PROVIDER`
  - Local/dev default: `console` logs email attempts and does not contact an external provider.
  - Production recommended: `resend`.
- `RESEND_API_KEY` when `EMAIL_PROVIDER=resend`.
- `EMAIL_FROM`, for example `ChiefOS Brief <brief@updates.chief-os.ai>`.
  - If omitted, the app falls back to `AUTH_EMAIL_FROM` for transactional mail.
- Resend domain setup:
  - Create and verify a sending domain or subdomain in Resend, preferably `updates.chief-os.ai`.
  - Add the SPF and DKIM DNS records Resend provides.
  - Add DMARC if the domain does not already have it.
  - Do not use `onboarding@resend.dev` for production sends.

### Optional safety controls
- `DOGFOOD_ALLOWED_EMAILS` (comma-separated allowlist)
- `PRIVATE_MODE` (`true`/`false`)
  - If `true`: `BASIC_AUTH_USER`, `BASIC_AUTH_PASSWORD`

## Optional env vars
- `SHADOW_DATABASE_URL` (used by Prisma in some workflows; see `prisma/schema.prisma`)
- `ONBOARDING_V1_ENABLED`
- LLM:
  - `LLM_PROVIDER` (`openai` | `anthropic`)
  - `OPENAI_API_KEY` / `ANTHROPIC_API_KEY`
  - `OPENAI_MODEL` / `ANTHROPIC_MODEL`
  - `LLM_CLASSIFICATION_ENABLED` (`true`/`false`)

## Cron schedule and “morning prep” timing

Vercel Cron schedules in `vercel.json` are **UTC-based**. ChiefOS currently uses a **single** daily cron to run:
- Gmail sync
- Calendar sync and calendar enrichment
- Auto-archive batch when enabled

### Current best-fit schedule

The cron is set to `0 11 * * *`, which runs at **7:00am America/New_York during daylight saving time**. This is the current early-product best fit for the founder's local morning.

Morning Brief Email is sent from the same cron after Gmail sync, Calendar sync/enrichment, and auto-archive complete. The app uses the user's saved timezone to dedupe by local day, but the MVP does not run separate per-timezone cron schedules.

### DST limitation

Because the schedule is global UTC, it cannot perfectly match local 7:00am across daylight saving changes or multiple user timezones without more scheduling infrastructure. In standard time, America/New_York 7:00am is `12:00 UTC`.

### Where to change the cron

- `vercel.json` → `crons[0].schedule`
- Cron handler: `src/app/api/cron/sync-and-run/route.ts`

## Automation safety (recommended defaults)
For **preview** and early production rollouts:
- Keep any automated Gmail mutation behind an env flag.
- Prefer “label/digest only” behavior until confidence is high.
- Maintain a clear kill-switch (env var) you can flip without redeploying code.
- Keep Morning Brief Email disabled in settings until the sending domain is verified.
- To stop real emails quickly, set `EMAIL_PROVIDER=console` or remove `RESEND_API_KEY`.

## Secret rotation (quick runbook)
When rotating secrets (Auth, OAuth, cron):
- Rotate in **preview first**, validate smoke checks, then rotate production.
- For `CRON_SECRET`: update Vercel env, then immediately verify cron endpoint authorization.

