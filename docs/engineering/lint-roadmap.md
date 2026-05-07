# Lint roadmap (temporary rule downgrades)

We run lint in CI to catch real issues early, but we avoid blocking iteration on prototype-era debt.

## Current strategy (Option A)

CI runs:
- `npm run lint` (must be non-interactive; warnings allowed)
- `npx tsc --noEmit` (hard gate)
- `npm test` (hard gate)

Temporary rule downgrades (warnings):
- `@typescript-eslint/no-explicit-any`
- `@typescript-eslint/no-unused-vars` (warn; ignores `_prefixed` vars/args/caught errors)
- `@typescript-eslint/no-empty-object-type`

Why: existing repo-wide violations make these rules too noisy to gate merges today, but the warnings still surface issues to clean up over time.

## Tightening plan (staged)

### Stage 1 (now)
- Keep the above rules as warnings.
- Avoid introducing new `any` in **high-risk surfaces**:
  - `src/services/gmail/*`
  - `src/services/declutter/*`
  - `src/app/api/cron/*`
  - `src/lib/decision-engine.ts`

### Stage 2 (ongoing, “boy scout rule”)
- In files you touch, remove obvious unused vars and avoid new `any`.

### Stage 3 (targeted cleanup)
- Reduce `any` in high-risk surfaces first.
- Add/strengthen types for request/response boundaries (API routes + service outputs).

### Stage 4 (re-enable as errors)
- Turn `no-explicit-any` back to **error** once violations are low enough that it won’t block normal work.
- Consider making unused-vars an **error** once the codebase is cleaner and patterns are consistent.

