# ChiefOS Skills

Project skills hold reusable workflows that should not be repeated across agent prompts. Keep each skill focused, concise, and one level deep.

## Available Skills

- `chiefos-agent-orchestration`: coordinate delegation, ownership routing, mandatory review gates, confidence handoffs, rejection handling, escalation, and release flow.
- `chiefos-context-handoff`: create compact handoffs and continuation prompts when context gets long or ownership changes.
- `chiefos-implementation-planning`: prepare implementation plans with acceptance criteria, likely files, validation, risks, and rollback.
- `chiefos-release-readiness`: review release readiness, deployment risk, rollback, secrets/env changes, and PR framing.

## Authoring Rules

- Use a `SKILL.md` file with valid frontmatter.
- Keep descriptions specific and written in third person.
- Prefer checklists and templates over long explanations.
- Do not duplicate full agent prompts here; skills are procedures, agents are roles.
