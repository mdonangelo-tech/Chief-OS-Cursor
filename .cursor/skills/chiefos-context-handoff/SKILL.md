---
name: chiefos-context-handoff
description: Creates compact ChiefOS handoffs and continuation prompts when context is long, ownership changes, a task pauses, or a fresh conversation would be clearer.
---
# ChiefOS Context Handoff

Use this skill when context needs to be compressed for a fresh chat, another agent, or a later continuation.

## Workflow

1. Identify the next owner: orchestrator, product, architect, implementation, QA, UX, DevOps, release, or user.
2. Preserve only durable context: goal, constraints, decisions, files, evidence, completed work, open questions, risks, and next action.
3. Drop noise: repeated discussion, stale hypotheses, full file dumps, unrelated terminal output, and resolved branches of thought.
4. Write a paste-ready prompt for the next owner.
5. If saving a file, use `.cursor/handoffs/YYYY-MM-DD-short-task-name.md`.

## Handoff Template

```md
# Handoff: Short Task Name

## Goal

## Constraints To Preserve

## Current State

## Decisions Made

## Files And Systems Involved

## Evidence Or Test Results

## Completed Work

## Open Questions

## Risks

## Context To Drop

## Next Owner

## Paste-Ready Prompt
```

## Quality Bar

- The next agent can act without reading the full old conversation.
- File paths are named, not pasted wholesale.
- User instructions that affect scope are preserved exactly.
- The next step is specific enough to execute or review.
