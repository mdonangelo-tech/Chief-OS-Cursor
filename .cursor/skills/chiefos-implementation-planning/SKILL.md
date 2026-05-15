---
name: chiefos-implementation-planning
description: Produces concise ChiefOS implementation plans for multi-file, user-facing, ambiguous, integration-sensitive, or risky changes before coding begins.
---
# ChiefOS Implementation Planning

Use this skill before implementation when the change is not a tiny mechanical edit.

## Workflow

1. Restate the user goal in one or two sentences.
2. Identify likely files, systems, and existing patterns to inspect.
3. Define acceptance criteria in observable terms.
4. Choose the smallest safe implementation approach.
5. List validation steps and rollback expectations.
6. Call out risks, especially Gmail/calendar, auth, scheduling, env vars, paid infrastructure, data safety, and mobile UX.

## Plan Template

```md
# Implementation Plan

## Goal

## Current Understanding

## Likely Files Or Systems

## Proposed Steps

## Acceptance Criteria

## Validation

## Risks

## Rollback
```

## Scope Rules

- Keep the plan proportional to risk.
- Ask blocking questions before finalizing the plan.
- Do not include unrelated cleanup.
- Prefer existing helpers and local patterns over new abstractions.
