# Implementation Architecture Notes

## Brief Sync

Manual sync should keep using the existing `/api/sync/all` boundary. The route should summarize Gmail and Calendar outcomes for the client and invalidate `/brief` after sync work completes. This keeps the UI from depending only on `router.refresh()` and aligns manual sync with existing Brief server actions.

## Calendar Timezone

Calendar day semantics should be centralized in a small shared helper. The server should group events by the user's configured timezone before sending `byDay` to the client, and the client should only format those local day keys. This avoids mixing UTC keys with browser-local display logic.

## Recommendation Learning

The first implementation should avoid schema changes. Existing rule creation and `RejectedSuggestion` records are enough to support a more collaborative first pass: show sender/domain alternatives, make dismissal copy explicit, and use saved rule type as the learning signal already available in `PersonRule` and `OrgRule`. A future schema can add explicit recommendation events if the behavior needs longer-term biasing.

## Rollback

All implementation phases are reversible by reverting UI and helper changes. No migration is required for this first pass.
