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
- Calendar sync
- Auto-archive batch (when enabled)

Because the schedule is global UTC, it cannot perfectly match **each user’s local morning** without introducing more scheduling infrastructure.

### Best-effort approach (current)
- Store a preferred local “morning prep” time and a timezone in **Settings → Workspace & Sync**.\n+- Use this primarily for:\n+  - guiding which UTC cron hour to choose\n+  - documenting DST behavior\n+
### DST limitation
If your timezone observes daylight savings, a single UTC cron hour will typically align with **either** winter **or** summer local time.\n+Options:\n+- Pick a best-fit UTC hour (acceptable for early product / single primary timezone)\n+- Adjust `vercel.json` seasonally when DST changes\n+
### Where to change the cron
- `vercel.json` → `crons[0].schedule`\n+- Cron handler: `src/app/api/cron/sync-and-run/route.ts`\n+
## Automation safety (recommended defaults)
For **preview** and early production rollouts:
- Keep any automated Gmail mutation behind an env flag.
- Prefer “label/digest only” behavior until confidence is high.
- Maintain a clear kill-switch (env var) you can flip without redeploying code.

## Secret rotation (quick runbook)
When rotating secrets (Auth, OAuth, cron):
- Rotate in **preview first**, validate smoke checks, then rotate production.
- For `CRON_SECRET`: update Vercel env, then immediately verify cron endpoint authorization.

