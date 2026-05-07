# Contributing to ChiefOS

This project optimizes for **startup speed** with **production-quality safety**.

## Branching
- Create short-lived branches from `main`.
- Naming:
  - `feat/...`, `fix/...`, `chore/...`, `ops/...`, `spike/...`

## PR discipline (low ceremony, high signal)
- Prefer small PRs (split UI refactors from behavior changes).
- Include a clear rollback plan when touching high-risk surfaces (see below).
- Use the PR template.

## Local checks (match CI)

```bash
npm run lint
npx tsc --noEmit
npm test
```

## Lint policy (keep CI usable)
Lint runs in CI and should stay high-signal. Some repo-wide legacy issues are temporarily warnings (see `docs/engineering/lint-roadmap.md`).

## High-risk surfaces (extra care required)
- Gmail mutations: `src/services/gmail/*`, `src/services/declutter/*`
- Automation: `src/app/api/cron/*`, `vercel.json`
- Decision engine: `src/lib/decision-engine.ts`
- Schema/migrations: `prisma/`

Expectations for high-risk changes:
- Safe-by-default rollout (feature flag or kill-switch when appropriate)
- Audit logging preserved
- Clear rollback path

## One-time GitHub settings (recommended)
Configure branch protection for `main`:
- Require **1 approval**
- Require status checks:
  - `CI / test` (GitHub Actions workflow)
- Require branch to be up to date before merge
- (Optional) Enable auto-merge when checks pass

