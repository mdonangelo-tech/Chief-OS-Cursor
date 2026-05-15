---
name: chiefos-release-readiness
description: Reviews ChiefOS release readiness, changed files, deployment risk, rollback, verification, secrets, env vars, and PR framing before shipping.
---
# ChiefOS Release Readiness

Use this skill before merging, deploying, creating a PR, or approving a release.

## Workflow

1. Inspect changed files and separate intended changes from unrelated edits.
2. Identify migrations, secrets, env vars, cron, Vercel, auth, Gmail/calendar, and data-safety risks.
3. Confirm verification steps exist and are realistic.
4. Confirm rollback steps exist for user-facing, data, or deployment changes.
5. Draft release or PR framing in plain language.
6. Recommend ship, hold, or needs-review.

## Review Template

```md
# Release Readiness Review

## Summary

## Changed Files Reviewed

## Intended Scope

## Unrelated Or Risky Changes

## Verification

## Deployment Notes

## Secrets And Env Vars

## Rollback

## PR Or Release Notes

## Recommendation
```

## Guardrails

- Do not approve a release with unexplained unrelated diffs.
- Do not introduce paid infrastructure without explicit approval.
- Treat rollback as required for production-impacting work.
- Keep DevOps mechanics in `devops-release`; use this skill for readiness review and release framing.
