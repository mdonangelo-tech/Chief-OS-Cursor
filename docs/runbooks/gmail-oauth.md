# Gmail OAuth runbook

ChiefOS uses Google OAuth for:
- Sign-in (Auth.js provider)
- Connecting Gmail/Calendar accounts for sync + brief generation

## Recommended environment separation
- **Preview**: use a separate OAuth client, or restrict to test accounts.
- **Production**: dedicated OAuth client with only required scopes.

## Redirect URIs
Ensure your Google Cloud OAuth client allows these (adjust if domains change):
- `${AUTH_URL}/api/auth/callback/google` (sign-in)
- `${AUTH_URL}/api/connect-google/callback` (connect account)

## Scope policy (keep least-privilege)
- Only request scopes that are strictly needed.
- Any new scope addition must be called out in the PR and reviewed.

## Token safety
- Refresh tokens are encrypted with `ENCRYPTION_KEY`.
- Rotating `ENCRYPTION_KEY` requires a migration strategy (existing tokens become unreadable). Prefer rotating OAuth credentials first.

## Quick verification
- Confirm user can connect a Google account.
- Confirm `/api/google/health` succeeds for the connected account.
- Confirm sync endpoints do not mutate Gmail unless explicitly enabled.

