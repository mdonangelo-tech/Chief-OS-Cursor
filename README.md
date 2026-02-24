# Chief of Staff

Your calm, trustworthy daily brief—unifying Gmail and Google Calendar across personal and work accounts.

## Quick Start

### 1. Environment

```bash
cp .env.example .env
# Edit .env with your values
```

**Required for local dev:**
- `DATABASE_URL` — Postgres connection string
- `AUTH_SECRET` — Run `npx auth secret` to generate
- `ENCRYPTION_KEY` — Run `openssl rand -hex 32` (used to encrypt Google refresh tokens)

**Optional (email magic links):**
- `EMAIL_PROVIDER=console` (default) — Logs links to console; use `/dev/magic-links` in dev
- Set `resend` or `sendgrid` when wiring a real provider

**Optional (Google OAuth):**
- `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` — For connecting Gmail + Calendar
- Add redirect URI in Google Cloud Console: `{AUTH_URL}/api/connect-google/callback`

### 2. Database

Ensure Postgres is running and create the database:

```bash
createdb chief_os   # or: psql -c "CREATE DATABASE chief_os;"
```

Update `DATABASE_URL` in `.env` if needed (e.g. `postgresql://postgres:postgres@localhost:5432/chief_os`).

```bash
npm run db:migrate
```

### 3. Run

```bash
npm run dev
```

Visit http://localhost:3000

- **Login** — Email magic link (console: check terminal or `/dev/magic-links`)
- **Setup** — Connect Google, goals, declutter prefs, categories
- **Brief** — Morning brief with priorities, open loops, calendar, declutter suggestions
- **Audit** — Gmail action history, one-click undo
- **Dev: Magic Links** — Only visible when `NODE_ENV !== production`

## API routes

- `GET /api/google/health` — Validate tokens, test Gmail connection
- `GET /api/health` — Deployment health check (env + timestamp)
- `POST /api/sync/gmail` — Manual Gmail sync (90 days)
- `POST /api/sync/calendar` — Manual Calendar sync (90 past + 90 future)
- `POST /api/gmail/archive` — Archive message (audited)
- `POST /api/gmail/rollback` — Undo archive

## Production deployment (Vercel)

### Domains (canonical + redirects)

- **Canonical frontend**: `chief-os.ai`
- **API**: `api.chief-os.ai` (host-based rewrite to `/api/*` via `vercel.json`)
- `www.chief-os.ai` → **301** to `chief-os.ai` (preserves path + query)
- `chief-os.co` and `www.chief-os.co` → **301** to `https://chief-os.ai` (preserves path + query)

### Vercel setup (single project)

- Create one Vercel project for this repo.
- Add domains to the same project:
  - `chief-os.ai`
  - `www.chief-os.ai`
  - `api.chief-os.ai`
  - `chief-os.co`
  - `www.chief-os.co`
- `vercel.json` handles:
  - host-based rewrite for `api.chief-os.ai` → `/api/:path*`
  - edge-level redirects for `www` + `.co` domains

### Required env vars (Vercel)

Required for **production**:
- `AUTH_SECRET`
- `AUTH_URL` (set to `https://chief-os.ai`)
- `DATABASE_URL`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `ENCRYPTION_KEY` (64 hex chars; `openssl rand -hex 32`)
- `NEXT_PUBLIC_API_BASE_URL` (set to `https://api.chief-os.ai`)

Private access gate (optional):
- `PRIVATE_MODE` (`true` / `false`)
- If `PRIVATE_MODE=true`:
  - `BASIC_AUTH_USER`
  - `BASIC_AUTH_PASSWORD`

### Health check

- API subdomain (recommended):

```bash
curl -sS https://api.chief-os.ai/health
```

- Same-origin:

```bash
curl -sS https://chief-os.ai/api/health
```

### CORS

API CORS allowlist (for browser requests with `Origin`):
- `https://chief-os.ai`
- `https://www.chief-os.ai`

### Rate limiting + logging

- `/api/*` endpoints that use the API guard apply a **best-effort** in-memory rate limit (default **60 req/min/IP**).
- Note: on serverless/edge platforms this is **not** a perfect global limit; it’s intended as a simple safety net.

## GoDaddy DNS records to add

Add these records for each domain in GoDaddy (replace `YOUR_VERCEL_PROJECT` only if Vercel provides a specific target; the standard target is `cname.vercel-dns.com`).

### For `chief-os.ai`

| Host | Type | Value |
|---|---|---|
| `@` | `A` | `76.76.21.21` |
| `www` | `CNAME` | `cname.vercel-dns.com` |
| `api` | `CNAME` | `cname.vercel-dns.com` |

### For `chief-os.co`

| Host | Type | Value |
|---|---|---|
| `@` | `A` | `76.76.21.21` |
| `www` | `CNAME` | `cname.vercel-dns.com` |

## Private mode (Basic Auth)

Set `PRIVATE_MODE=true` plus `BASIC_AUTH_USER` / `BASIC_AUTH_PASSWORD` in Vercel. When enabled, an edge middleware requires Basic Auth for **all pages and `/api/*`**.

## Rollout checklist

- Set Vercel env vars (Production)
- Add GoDaddy DNS records for `chief-os.ai` + `chief-os.co`
- Add all domains to the Vercel project
- Verify redirects:
  - `chief-os.co/some/path?x=1` → `chief-os.ai/some/path?x=1`
  - `www.chief-os.ai` → `chief-os.ai`
- Verify API rewrite:
  - `https://api.chief-os.ai/health` returns `{ ok: true, ... }`
- If `PRIVATE_MODE=true`, verify Basic Auth prompt appears for both:
  - `https://chief-os.ai/brief`
  - `https://api.chief-os.ai/health`

## Stack

- Next.js 15 (App Router), TypeScript, Tailwind
- Auth.js (magic link + Google OAuth)
- Prisma, Postgres
- Pluggable email provider abstraction

## Project Structure

```
src/
├── app/              # Routes, pages
├── lib/              # Prisma, email, encryption, setup defaults
├── services/         # Gmail, Calendar, classification, LLM, brief
├── auth.ts           # Auth.js config
└── ...               # (middleware.ts lives at repo root)
```

## Email Provider

Magic links use a pluggable `sendMagicLink(email, url)` abstraction:

- **console** (default) — Logs to terminal; dev page at `/dev/magic-links`
- **resend** / **sendgrid** — Not yet implemented; add when needed

Configure via `EMAIL_PROVIDER` env var.
