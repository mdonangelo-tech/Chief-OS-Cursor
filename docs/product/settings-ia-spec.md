# Settings IA And Freshness Spec

## Goal

Make Settings feel like a clear control center, not a nested copy of itself. Reframe refresh preferences in user language so they do not overlap with memory or personal context.

## Navigation Decisions

- The sidebar Settings label is the parent group.
- The `/settings` route remains as `Overview` for now because mobile and onboarding entry points still need a safe landing page.
- The `Overview` item should only be active on `/settings`, not every nested settings route.
- Settings subpages should keep their direct sidebar entries.
- Back links may still point to `/settings`, but their copy should say `Back to overview` or `Back to Settings overview` where practical.

## Freshness Naming

Use `Brief freshness` for user-visible refresh behavior. This frames the feature around the outcome the user cares about: whether ChiefOS has current enough context to prepare a useful Brief.

Avoid:

- `Workspace refresh`
- `Refresh insights`
- Language that implies Personal Context, memory, and sync are the same system

## UX Requirements

- Settings overview should emphasize next setup/status actions first, not duplicate every sidebar destination equally.
- The overview may include cards for major areas, but it should be titled `Settings overview`.
- `Brief freshness` belongs near account/sync preferences, not under Intelligence.
- Copy should describe when ChiefOS updates the Brief and how freshness affects recommendations.

## Acceptance Criteria

- The app no longer displays `Settings` as both a sidebar section and the first child item.
- `/settings/personal`, `/settings/accounts`, and other subpages do not also highlight the overview item.
- No primary settings surface uses `Workspace refresh` as the user-facing feature name.
- Onboarding and mobile-safe entry points to settings remain intact.
