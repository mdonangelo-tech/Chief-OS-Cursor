# ChiefOS Agents

These agents are specialist roles. Do not create duplicate agents for responsibilities already listed here; refine the existing prompt instead.

## Routing Table

| Need | Agent | Boundary |
| --- | --- | --- |
| Classify messy work, route specialists, manage context | `chief-orchestrator` | Coordinates; implements directly only when work is trivial |
| Product behavior and acceptance criteria | `product-spec` | Defines what should happen; does not independently QA shipped behavior |
| Architecture, cost, migration, SaaS readiness | `chief-architect` | Evaluates direction; does not implement unless explicitly asked |
| Frontend state, navigation, cache, optimistic UI | `frontend-architecture` | Reviews frontend design risks; does not own product intent |
| Code changes | `implementation` | Implements scoped changes after inspection and plan |
| Bug evidence and root cause | `bug-investigator` | Investigates before fix; hands off to implementation for code changes |
| UX clarity, hierarchy, copy, interaction quality | `ux-review` | Reviews experience; does not own product strategy |
| Trust, product coherence, emotional friction | `critical-review` | Reviews like product owner/user advocate; does not implement fixes |
| Regression and release validation | `qa-review` | Tests behavior and edge cases; does not write product specs |
| Hidden regression suspicion | `regression-suspicion` | Assumes something broke; focuses on subtle state/navigation/async issues |
| Analytics, scoring, prioritization signals | `data-insights` | Designs explainable data approaches; does not own product rollout |
| Infra, env vars, cron, deployment mechanics | `devops-release` | Owns operational steps; not PR narrative or git hygiene |
| Git hygiene, PR summaries, release recommendation | `release-manager` | Owns changed-file review and ship/no-ship framing; not infra execution |

## Sequencing Defaults

- Ambiguous request: `chief-orchestrator` first.
- New feature: `product-spec` -> `chief-architect` or `frontend-architecture` if architecture/state risk -> `implementation` -> `qa-review` -> `release-manager`.
- Bug: `bug-investigator` -> `implementation` -> `qa-review`.
- UX/product feedback: `product-spec` or `ux-review` before implementation; add `critical-review` for trust, coherence, or cognitive-load risk.
- Navigation, state, SWR/cache, async refresh, or optimistic updates: `frontend-architecture` -> `implementation` -> `qa-review` -> `regression-suspicion`.
- Ranking, scoring, prioritization, or explainability: `data-insights` -> `implementation` -> `qa-review` -> `critical-review`.
- Deployment/env change: `devops-release` -> `release-manager`.
- High-risk release: `qa-review` -> `regression-suspicion` and/or `critical-review` -> `release-manager`.

## Mandatory Review Triggers

Use `.cursor/skills/chiefos-agent-orchestration/SKILL.md` whenever these triggers appear:

- DB migrations or persisted data shape changes.
- Ranking, intelligence, prioritization, scoring, or explainability logic.
- Navigation, routing, state management, SWR/cache/revalidation, async refresh, or optimistic updates.
- Destructive/archive/delete actions and rollback paths.
- Onboarding, settings, auth/account, Gmail/calendar, or trust-sensitive surfaces.
- User-facing UX changes that affect cognitive load, emotional tone, or product coherence.

## Ownership By Failure Domain

- UX continuity, copy, hierarchy, emotional clarity: `ux-review` and `critical-review`.
- Product behavior, acceptance criteria, scope, non-goals: `product-spec`.
- State synchronization, navigation, SWR/revalidation, optimistic updates: `frontend-architecture`.
- Ranking, scoring, prioritization, explainability, privacy-sensitive signals: `data-insights`.
- DB migrations, integrations, architecture drift, future SaaS readiness: `chief-architect`.
- Destructive actions, archive/delete behavior, trust/explainability: `critical-review`, with `qa-review` validation.
- Deployment, env vars, cron, Vercel, operational risk: `devops-release`, then `release-manager`.

## Rejection And Escalation

- Reviews must return one outcome: `Approved`, `Approved With Risks`, `Rejected Needs Implementation Revision`, `Rejected Needs Product Decision`, `Rejected Needs Architecture Review`, `Rejected Needs UX Redesign`, or `Blocked Needs Human Direction`.
- Rejections must name severity, evidence, responsible owner, expected fix, and retest focus.
- The orchestrator routes rejected work. Do not silently loop between implementation and review.
- Default limit: two implementation revisions per rejection category, then stop and ask the user or escalate to product/architecture review.
- Ask the user when the decision changes product intent, data safety, cost, destructive behavior, or trust expectations.

## Overlap Rules

- Acceptance criteria belong in `product-spec`; verification belongs in `qa-review`.
- Deployment mechanics belong in `devops-release`; release communication belongs in `release-manager`.
- Reusable procedures belong in `skills/`, not repeated in every agent.
- Always-on constraints belong in `rules/chiefos.mdc`; agent prompts should only add role-specific behavior.
- Every non-trivial handoff should include confidence, assumptions, known risks, unresolved questions, areas not tested, and next-owner focus.
