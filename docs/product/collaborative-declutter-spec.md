# Collaborative Declutter Spec

## Goal

Declutter should feel like ChiefOS is proposing helpful automation that the user can shape. The user should not have to accept an exact rule or reject the whole idea.

## Suggested Action Behavior

Each recommendation should include:

- the recommendation
- why ChiefOS suggested it
- the default action
- alternative actions when available
- a safe dismissal path

Initial editable choices:

- save sender rule
- save domain rule
- review all suggestions
- unsubscribe when supported
- send to digest or low priority when category rules support it
- dismiss recommendation

## Learning Signals

ChiefOS should learn from user modifications conservatively:

- If the user repeatedly chooses domain rules over sender rules for similar senders, bias future recommendations toward domain rules.
- If the user dismisses a sender/domain, suppress only the relevant suggestion scope.
- If the user changes category/action, record the preference as recommendation evidence, not as an irreversible global rule unless the user explicitly saves it.

Schema changes are optional for the first UX pass. If added later, learning events should be privacy-aware and explainable.

## Declutter Section Behavior

Declutter should lead with next actions:

- preview safe bulk actions
- review rule suggestions
- tune low-priority policy
- review recent actions or undo

Digest counts can remain as context, but they should not be the only value in the section.

## CTA Pattern

Use a consistent action footer:

- primary action: filled/accent button
- secondary action: bordered or surface button
- tertiary action: muted text link

Actions should align visually across Brief Declutter and Suggested Actions.

## Acceptance Criteria

- Brief suggestions offer sender/domain alternatives where data allows.
- Suggestions explain why they appeared in user-facing language.
- `Not now` copy does not imply temporary deferral if the action suppresses future suggestions.
- Declutter provides a clear next step even when digest counts are low.
- Recent actions/audit remains easy to find for trust and rollback.
