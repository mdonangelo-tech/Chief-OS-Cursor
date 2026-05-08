# Bug Reproduction Notes

## Calendar Wrong Day

Static reproduction path:

- `getBriefPayload` grouped events with `startAt.toISOString().slice(0, 10)`, which is a UTC day key.
- `CalendarWatchoutsSection` looked up today with `new Date().toISOString().slice(0, 10)`, also UTC.
- A user west of UTC with an evening event or a user east of UTC near local midnight can see events grouped under the wrong local day.
- Early-start flags used `Date#getHours()`, which follows the server runtime timezone rather than the user's configured timezone.

## Sync Trust Staleness

Static reproduction path:

- `BriefSyncControls` posted to `/api/sync/all`, then called `router.refresh()` without route-level revalidation.
- `BriefHeader` rendered relative time on the server using `Date.now()`, so an open tab could keep showing `just now` until a navigation or refresh.
- The sync API returned raw per-account arrays but no user-facing lifecycle summary, making a valid no-op sync indistinguishable from a stale UI.

## Fix Direction

- Centralize timezone-aware calendar day helpers.
- Return a summarized sync result and revalidate `/brief` in the sync route.
- Move visible relative time labels into a client component that updates on an interval.
