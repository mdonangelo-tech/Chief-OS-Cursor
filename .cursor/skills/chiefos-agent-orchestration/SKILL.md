---
name: chiefos-agent-orchestration
description: Coordinates ChiefOS multi-agent work with delegation rules, ownership routing, mandatory review gates, confidence handoffs, rejection handling, escalation paths, and release flow.
---
# ChiefOS Agent Orchestration

Use this skill for non-trivial ChiefOS work, especially multi-file, user-facing, trust-sensitive, stateful, ranking, data, integration, deployment, or release work.

## Delegation First

The orchestrator coordinates by default. It may handle only tiny, low-risk tasks directly. For anything meaningful, it should classify the request, identify risk domains, route specialist work, sequence reviews, and consolidate outcomes.

## Ownership Routing

- Product behavior, scope, non-goals, acceptance criteria: `product-spec`.
- UX hierarchy, copy, interaction clarity, visual density: `ux-review`.
- Product coherence, trust, emotional friction, cognitive load: `critical-review`.
- React architecture, navigation, state sync, SWR/cache, optimistic updates: `frontend-architecture`.
- Ranking, scoring, prioritization, explainability, privacy-sensitive signals: `data-insights`.
- Data model, migrations, integrations, cost, SaaS readiness: `chief-architect`.
- Bug evidence and root cause: `bug-investigator`.
- Scoped code changes: `implementation`.
- Regression validation and edge cases: `qa-review`.
- Hidden regression suspicion: `regression-suspicion`.
- Deployment mechanics: `devops-release`.
- Git hygiene, PR/release narrative, ship decision: `release-manager`.

## Mandatory Review Triggers

Invoke QA and the relevant specialist review when work touches:

- DB migrations or persisted data shape.
- Ranking, intelligence, prioritization, scoring, or explainability.
- Navigation, routing, state management, SWR/cache/revalidation, async refresh, or optimistic updates.
- Destructive/archive/delete behavior and rollback paths.
- Onboarding, settings, auth/account, Gmail/calendar, or trust-sensitive surfaces.
- User-facing UX that changes cognitive load, emotional tone, or product coherence.

## Default Flow

1. `chief-orchestrator` classifies work and assigns owners.
2. `product-spec`, `ux-review`, `chief-architect`, `frontend-architecture`, or `data-insights` define intent and constraints when needed.
3. `implementation` makes scoped changes.
4. `qa-review` validates acceptance criteria and obvious regressions.
5. `regression-suspicion` reviews hidden state, navigation, async, and cross-page failures when risk triggers apply.
6. `critical-review` checks trust, coherence, cognitive load, and emotional friction for user-facing or trust-sensitive work.
7. `release-manager` gives the final release recommendation.

## Handoff Confidence

Every non-trivial handoff should include:

```md
## Handoff Confidence
Confidence: High | Medium | Low

## Assumptions

## Known Risks

## Unresolved Questions

## Areas Not Tested

## Needs Next Owner Focus
```

## Review Outcomes

Use one of these states:

- `Approved`: no blocking issues.
- `Approved With Risks`: shippable only if documented risks are accepted.
- `Rejected Needs Implementation Revision`: return to `implementation`.
- `Rejected Needs Product Decision`: return to `product-spec` or ask the user.
- `Rejected Needs Architecture Review`: route to `chief-architect` or `frontend-architecture`.
- `Rejected Needs UX Redesign`: route to `ux-review` or `critical-review`.
- `Blocked Needs Human Direction`: stop and ask the user when trade-offs affect product intent, data safety, cost, destructive behavior, or trust.

## Rejection Rules

- Rejections must include severity, evidence, owner, expected fix, and retest focus.
- The orchestrator owns routing after rejection; reviewers should not silently loop work.
- Default limit: two implementation revisions per rejection category. After that, stop and ask the user or escalate to architecture/product review.
- If specialists disagree, the orchestrator records the conflict, identifies the decision owner, and asks the user when the decision changes product intent or risk tolerance.

## Release Flow

After approval, `release-manager` summarizes implemented changes, migrations, env/secrets/cron/deployment implications, verification evidence, manual QA checklist, known risks, follow-ups, rollback path, and one recommendation:

- `Safe To Ship`
- `Safe Behind Feature Flag`
- `Requires More Testing`
- `Should Not Ship`

## Cursor Limits

Cursor can support this through explicit subagent delegation, skills, rules, structured prompts, and review gates. Do not assume a fixed agent graph will always run unattended. Custom agents need clear prompts and sufficient context; handoff artifacts are the reliable contract between isolated agent contexts.
