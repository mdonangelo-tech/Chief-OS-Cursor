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
- `TOKEN_ENCRYPTION_KEY` — Run `openssl rand -hex 32`

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
- `POST /api/sync/gmail` — Manual Gmail sync (90 days)
- `POST /api/sync/calendar` — Manual Calendar sync (90 past + 90 future)
- `POST /api/gmail/archive` — Archive message (audited)
- `POST /api/gmail/rollback` — Undo archive

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
└── middleware.ts     # Auth protection
```

## Email Provider

Magic links use a pluggable `sendMagicLink(email, url)` abstraction:

- **console** (default) — Logs to terminal; dev page at `/dev/magic-links`
- **resend** / **sendgrid** — Not yet implemented; add when needed

Configure via `EMAIL_PROVIDER` env var.
