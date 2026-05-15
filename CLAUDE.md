# ChiefOS Claude Context

ChiefOS is an executive operating layer for busy founders, execs, investors, and high-agency users.

The product is not just an email app, calendar app, or chatbot. It is designed to help users understand what matters, reduce cognitive load, coordinate work/life logistics, and eventually interact through web, email, calendar, WhatsApp, Slack, voice, and other channels.

## Current product focus

The current MVP focuses on:
- Gmail sync and triage
- Google Calendar enrichment
- Morning Brief / daily priorities
- Suggested actions
- Declutter and auto-archive rules
- Settings for sync, personalization, and user preferences

## Product principles

1. Prioritize what matters, not what is newest.
2. Preserve user trust above all else.
3. Never take destructive actions without clear rules, logs, and reversibility.
4. Prefer explainable automation over mysterious AI behavior.
5. Build durable foundations: normalized events, priorities, tasks, people, rules, and actions.
6. Avoid one-off hacks that only work for Gmail if the concept should eventually work across channels.

## Engineering rules

1. Never edit `main` directly.
2. Work on a named feature branch.
3. Keep changes scoped to the assigned task.
4. Do not introduce new providers, SDKs, queues, cron systems, or architecture patterns without documenting the decision.
5. Prefer small, reviewable commits.
6. Run relevant tests/checks before finishing.
7. Update or create a handoff note in `docs/handoffs/`.
8. Include what changed, files touched, tests run, risks, and follow-ups.
9. If uncertain, inspect the code before guessing.
10. Do not rewrite unrelated files.

## Before coding, read

- `docs/product/current-state.md`
- `docs/engineering/architecture.md`
- `docs/engineering/ai-workflow.md`