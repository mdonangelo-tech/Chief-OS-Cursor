# Architecture (lightweight map)

ChiefOS is a Next.js App Router product with a single primary surface (**Brief**) and supporting surfaces under **Settings**. The high-risk systems are Gmail mutations and automation.

## Directory boundaries (convention)

- `src/app/`: routes, pages, API route handlers (HTTP boundary)
- `src/services/`: domain logic and side effects (Gmail/Calendar/Brief/Declutter/LLM)
- `src/lib/`: shared utilities (env, db, auth, decision engine)
- `prisma/`: schema and migrations

### Boundary rules (keep it simple)
- UI components should not call Google APIs directly; they should hit `/api/*` routes or server actions that delegate to `src/services/*`.
- Anything that **mutates Gmail** must:
  - write an `AuditLog` entry
  - be reversible (per-message + per-run where possible)
  - be behind an opt-in flag when behavior is new or risky

## High-risk surfaces (require extra care in PRs)

### Gmail mutations
- `src/services/gmail/actions.ts`
- `src/services/declutter/*`

Checklist for changes:
- [ ] Feature flag / kill-switch considered for rollout safety
- [ ] Audit logging preserved (before/after labels + reason + runId when batch)
- [ ] Rollback path confirmed (`rollback*` functions still correct)

### Automation
- `src/app/api/cron/*`
- `vercel.json` crons

Checklist for changes:
- [ ] `CRON_SECRET` auth remains enforced
- [ ] Cron can run without Basic Auth (see `middleware.ts`)
- [ ] Any new automation is safe-by-default in preview environments

### Decision logic
- `src/lib/decision-engine.ts`

Checklist for changes:
- [ ] Conservative defaults maintained (unknown policy strings → no mutation)
- [ ] Test updated/added (`src/lib/decision-engine.test.ts`)

