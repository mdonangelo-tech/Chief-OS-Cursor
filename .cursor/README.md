# ChiefOS Cursor OS

This folder contains the local AI operating system for ChiefOS. It defines how AI work is routed, planned, handed off, and reviewed without changing application behavior by itself.

## Folder Map

- `rules/`: always-on ChiefOS constraints that should remain short and project-specific.
- `agents/`: specialist roles for orchestration, product, architecture, frontend architecture, implementation, QA, UX, data, critical review, regression suspicion, DevOps, and release review.
- `skills/`: reusable workflows that can be invoked across agents without copying long procedures into every prompt.
- `plans/`: templates and saved plans for medium or high-risk work.
- `handoffs/`: context handoffs for fresh chats or agent continuations.
- `decisions/`: lightweight decision records for durable architectural or product choices.

## Operating Flow

1. Start with `chief-orchestrator` when work is ambiguous, multi-step, or likely to involve multiple specialists.
2. Use `.cursor/skills/chiefos-agent-orchestration/SKILL.md` for delegation, risk triggers, confidence handoffs, rejection handling, and release flow.
3. Route by failure domain: product intent, UX, frontend state, intelligence/ranking, architecture, implementation, QA, regression suspicion, critical review, DevOps, and release.
4. Require QA and specialist review for high-risk work such as migrations, ranking, navigation/state, destructive actions, onboarding/settings, trust, or async refresh.
5. Write a handoff when context gets long, the task changes direction, or another agent needs to continue.
6. Keep application code out of `.cursor/`; this folder is for prompts, workflows, and local AI operating guidance.

## Cursor Orchestration Limits

- Cursor can support collaborative execution through explicit subagent delegation, skills, rules, structured prompts, and review gates.
- Do not assume a fixed agent graph will always run unattended. The active agent or user should explicitly invoke critical specialists when review must not be skipped.
- Custom agents work best with clear prompts and compact handoffs because each delegated context may not inherit the full conversation.
- Treat handoff confidence, review outcomes, and release recommendations as the durable contract between agents.

## Context Discipline

- Prefer file paths, decisions, constraints, and deltas over pasted full files.
- Do not include `debug.log` as prompt context unless the task explicitly concerns that log.
- Summarize external evidence instead of carrying full transcripts forward.
- Start a fresh conversation when the brief is clearer than the accumulated context.

## Simplification Rule

Use three layers only:

1. `rules/` for universal ChiefOS guardrails.
2. `agents/` for role boundaries and output shapes.
3. `skills/` for reusable workflows.

If guidance fits more than one layer, keep it in the least-loaded layer and reference it from elsewhere.
