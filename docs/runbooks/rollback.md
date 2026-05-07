# Rollback & safety runbook

ChiefOS can mutate Gmail state (archive/spam/label). Rollbacks must be fast and low-stress.

## Rollback hierarchy (fastest → slowest)
1. **Feature flag / kill-switch** (env var): disable the risky behavior without code changes.
2. **Stop automation**: disable cron or automation entrypoints.
3. **Undo via audit log**: use stored audit actions to revert message label changes.
4. **Revert deployment**: roll back to a previous Vercel deployment.

## Automation entrypoints
- Vercel cron hits `GET /api/cron/sync-and-run` daily.
- The cron route requires `Authorization: Bearer ${CRON_SECRET}`.

## If auto-archiving/spam goes wrong

### Immediate containment
- Disable the automation behavior via env flag (recommended convention):
  - Set `AUTO_ARCHIVE_ENABLED=false` (or equivalent) in Vercel **Production** env.
- If needed, temporarily disable Vercel cron schedule.

### Verify stop condition
- Confirm cron calls return `ok: true` but report no mutations, or return a controlled “disabled” response (implementation-dependent).

### Undo existing mutations
- Use the rollback mechanisms built on `AuditLog` (per-message rollback and per-run rollback).
- Prefer rolling back by `runId` when a batch run caused impact.

## Deployment rollback (Vercel)
- Roll back to the last known-good deployment from Vercel Deployments UI.
- Keep the env-based kill-switch OFF until you’ve validated the restored behavior.

## Post-incident checklist (lightweight)
- Write a short incident note: what happened, blast radius, fix, guardrail to prevent recurrence.
- Add/adjust a feature flag default or safety check.
- Add a small test or smoke check if it would have caught this.

