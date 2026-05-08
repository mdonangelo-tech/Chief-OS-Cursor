# Calendar Assistant Spec

## Goal

Calendar should help the user prepare, protect strategic time, and notice meaningful schedule risks. It should not lead with passive load metrics.

## Time Semantics

- Calendar day grouping must use the user's IANA timezone from `UserCalendarPreferences.timezone`.
- If no preference exists, fall back to the runtime locale only as a temporary display fallback.
- All-day events should be grouped by their intended calendar date, not shifted by UTC midnight.
- `today`, `tomorrow`, and `early start` must use the same timezone rule.

## Insight Types

ChiefOS should prioritize:

- `prepare`: meetings that need prep or context.
- `protect_focus`: missing or fragmented focus blocks.
- `goal_gap`: no visible time for active goals or named priorities.
- `reclaim_time`: recurring or low-value meetings that may be moved, shortened, or skipped.
- `conflict`: schedule items that conflict with user goals, family constraints, or known preferences.
- `watchout`: overload or back-to-back risk only when paired with an action.

## Copy Rules

Prefer:

- `You have no protected focus block this afternoon. Want to hold 90 minutes?`
- `Your next meeting is with Acme at 2:00 PM. Review the last thread before joining.`
- `No time is reserved for job search this week.`

Avoid:

- `Heavy meeting load`
- `66 hours`
- `Overloaded Thursday`
- `Back-to-back: 4`

Metrics may appear as evidence after a recommendation, not as the headline.

## Acceptance Criteria

- The Calendar card answers what matters next, not only how busy the calendar is.
- The Calendar section shows today's items for the user's local date.
- Early starts are calculated in the user's timezone.
- Goal-aware insights use existing goal/context data when available and stay quiet when not enough evidence exists.
- Watchouts include a suggested next action or are omitted.
