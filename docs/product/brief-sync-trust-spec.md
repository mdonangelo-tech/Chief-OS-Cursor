# Brief Sync Trust Spec

## Goal

Manual sync should create confidence. The user should know whether ChiefOS requested a sync, is syncing, completed it, refreshed the Brief, found no changes, partially failed, or needs reconnect.

## Lifecycle States

- `idle`: no sync currently running.
- `syncing`: Gmail and Calendar sync has been requested.
- `completed`: sync finished and the Brief has been asked to refresh.
- `unchanged`: sync finished but no visible inputs changed.
- `partial`: at least one channel synced while another had recoverable issues.
- `reconnect`: at least one account requires reconnect.
- `failed`: sync did not complete.

## User-Facing Copy

- Start: `Syncing Gmail and Calendar...`
- Success with changed data: `Brief refreshed just now.`
- Success with no changed data: `Everything was already current.`
- Partial: `Calendar synced. Gmail needs attention.`
- Reconnect: `Reconnect needed`
- Failure: `Sync failed. Try again or check accounts.`

## Data Contract

`POST /api/sync/all` should return enough safe information for the UI to explain the outcome:

- `ok`
- `hasErrors`
- `reconnectRequired`
- per-channel result summaries
- latest Gmail and Calendar sync timestamps when available
- changed or processed counts when the sync services can provide them

When exact changed counts are not available, the UI should avoid pretending data changed. It can say the sync completed and the Brief was refreshed.

## Timestamp Behavior

Relative timestamps must update in an open tab. Server-rendered timestamps are acceptable as initial values, but the visible relative label should be client-driven.

## Acceptance Criteria

- Pressing `Sync now` immediately shows a syncing state.
- Completion produces visible outcome text even when the Brief contents do not change.
- Partial sync and reconnect paths link to account settings.
- Relative sync timestamps update without a full page navigation.
- Manual sync invalidates or reconciles the Brief data path consistently with other Brief mutations.
