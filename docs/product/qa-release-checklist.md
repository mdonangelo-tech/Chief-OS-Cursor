# QA And Release Checklist

## Automated Validation

- `npm test`: passed.
- `npx tsc --noEmit`: passed.
- `npm run lint`: passed with existing warnings in unrelated onboarding, declutter, and service files. No new lint errors were reported for the edited files by IDE diagnostics.

## Product QA

- Settings sidebar shows `Overview` under the Settings group, with exact active matching for `/settings`.
- Brief freshness naming replaces Workspace Refresh on the touched primary settings surfaces.
- Manual sync now returns a summarized result, revalidates Brief/account settings, and shows completed, unchanged, partial, reconnect, or failed feedback.
- Relative sync timestamps are client-updated in open tabs.
- Calendar grouping and early-start logic use a shared timezone helper and the saved user timezone when available.
- Calendar copy now leads with preparation, focus protection, and recovery-block language instead of raw overload diagnostics.
- Suggested Actions expose sender/domain alternatives when available and explain why the recommendation appeared.
- Declutter leads with rule suggestions, preview, and audit/recent-action paths.

## Manual QA Still Recommended

- Verify Brief sync against real Gmail/Calendar accounts with no-change, changed, partial failure, and reconnect scenarios.
- Check calendar day grouping near local midnight for US/Pacific, Europe/Berlin, and Asia/Tokyo.
- Confirm mobile settings access remains clear with the sidebar hidden.
- Try sender-rule and domain-rule conversions from Suggested Actions and confirm resulting suggestions are suppressed as expected.
- Confirm Declutter preview and audit links match the intended rollback path.

## Release Notes

This pass does not require a database migration. Rollback is a code revert of docs, UI, sync route, Brief payload, and the shared calendar-time helper.
