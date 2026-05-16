# Handoff: Auto-Archive Observability & Fix

**Branch:** `fix/auto-archive-daily-rules`
**Date:** 2026-05-15

---

## Root Cause Summary

The auto-archive daily job was silently returning `{ processed: 0, remainingEligible: 0 }` with no way to distinguish between four possible reasons:
1. `autoArchiveEnabled` is false (the pref defaults to `false` — most likely cause)
2. No connected Google accounts
3. No `archive_after_*` category rules configured
4. Ran correctly but found no eligible mail

The previous fix attempt (commit `5098b22`) rewrote `runAutoArchiveBatch` to use the decision engine and cursor pagination, but did not add any logging. As a result, production failures were invisible.

A secondary risk: the audit log dedup query fetched ALL historical ARCHIVE/SPAM entries with no date filter. Over time this becomes an unbounded `NOT IN (...)` SQL clause that degrades query planning. Since `CHIEFOS_ARCHIVED_LABEL` already prevents re-archiving at the label level, this query was also partially redundant.

---

## What Changed

### `src/types/declutter.ts`
- Added `AutoArchiveBatchStatus` union type (`"disabled" | "no_accounts" | "no_archive_policies" | "ran"`)
- Added `AutoArchiveBatchSkipReasons` and `AutoArchiveBatchPerAccount` types
- Extended `RunAutoArchiveResponse` with optional `status`, `scanned`, `skipReasons`, `perAccount` fields (backward-compatible — UI only reads `processed` and `remainingEligible`)

### `src/services/declutter/run-auto-archive-batch.ts`
- **Structured logging** via `console.info(JSON.stringify({...}))` at: `start`, `disabled`, `no_accounts`, `policies`, `no_archive_policies`, `scan_start`, `audit_dedup`, `scan_complete`, `archive_complete`, `archive_errors`, `spam_errors`, `result`
- **Early exit for `no_archive_policies`**: if no category has `archive_after_48h` or `archive_after_days`, returns immediately instead of scanning all inbox messages pointlessly
- **AuditLog lookback capped to 90 days** (constant `AUDIT_LOG_LOOKBACK_DAYS = 90`). Primary dedup guard remains `CHIEFOS_ARCHIVED_LABEL`.
- **Richer return type**: `RunAutoArchiveBatchResult` now includes `status`, `scanned`, `skipReasons`, `perAccount`
- **Skip reason tracking**: counts `notYetDue` (archiveAt in future) and `decisionNone` (action not ARCHIVE_AT/SPAM, or SPAM with no archiveAt) separately
- **Per-account error capture**: `batchArchiveMessages` and `batchSpamMessages` both return `errors: string[]`; these were previously discarded; now surfaced in logs and `perAccount`

### `src/app/api/cron/sync-and-run/route.ts`
- `row.autoArchive` now includes `status`, `scanned`, `skipReasons`, `perAccount` from the batch result

### `src/app/api/declutter/run-auto-archive/route.ts`
- Passes richer fields through to the API response

---

## Files Touched

- `src/types/declutter.ts`
- `src/services/declutter/run-auto-archive-batch.ts`
- `src/app/api/cron/sync-and-run/route.ts`
- `src/app/api/declutter/run-auto-archive/route.ts`
- `docs/handoffs/2026-05-15-auto-archive-fix.md` (this file)

---

## Checks Run

- `npx tsc --noEmit` — clean
- `npm run lint` — no errors (existing warnings unchanged)
- `npm test` — 47/47 pass

---

## Deployment Notes

1. No schema migration required.
2. No new environment variables.
3. The cron schedule (`0 11 * * *` UTC) is unchanged.
4. After deploying, verify the next cron run at 11am UTC by checking Vercel function logs for lines with `"service":"auto-archive-batch"`. You should see at minimum a `start` and `disabled`/`no_archive_policies`/`ran` event per user.
5. If you see `"event":"disabled"` for all users: enable auto-archive per user in Settings → Declutter → Auto-archive toggle.
6. If you see `"event":"no_archive_policies"`: no categories have `archive_after_48h` or `archive_after_days` rules. Set these in Settings → Declutter → Category rules.

---

## Known Gaps / Follow-Ups

### 1. `POST /api/declutter/auto-archive` is dead code (low priority)
`src/app/api/declutter/auto-archive/route.ts` calls the old `runAutoArchive()` from `src/services/declutter/auto-archive.ts`. No UI component calls this endpoint — the UI uses `/api/declutter/run-auto-archive` which calls `runAutoArchiveBatch`. The old route and service are unreachable from the product. They should be deleted in a cleanup pass to avoid future confusion.

### 2. `move_to_spam` is silently not processed by the batch job
In `policyToDecision`, `move_to_spam` returns `{ action: "SPAM", archiveAt: null }`. In `runAutoArchiveBatch`, the guard `if (!decision.archiveAt) continue` skips all SPAM decisions. This means categories configured with `move_to_spam` are never acted on by the daily cron. This is a pre-existing bug, not introduced here. Fix would be: treat `action === "SPAM"` with `archiveAt === null` as immediately eligible (no time window required), similar to how `label_only` works in reverse.

### 3. The recount scan after archiving is expensive
After each archive batch, the code re-scans up to 50k messages to count `remainingEligible`. For large mailboxes this doubles the DB read cost per cron run. A lighter approach would be an approximate count (`SELECT COUNT(*)` with the same filters instead of fetching full rows) or skip the recount entirely in the cron path and only do it in the interactive path. This is a future optimization, not a correctness issue.

### 4. Vercel function timeout risk
The cron runs Gmail sync + Calendar sync + enrichment + auto-archive + brief email for every user, all sequentially. With multiple users or slow Gmail API responses, this could exceed Vercel's function timeout before auto-archive runs. Monitor `durationMs` in the cron response. If it approaches the limit, consider running auto-archive in a separate cron or splitting per-user work.
