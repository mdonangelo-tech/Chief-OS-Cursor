# ChiefOS Assistant Experience Principles

ChiefOS should feel like a calm executive assistant that helps the user decide what to do next. It should not feel like a dashboard, admin console, telemetry layer, or analytics report.

## Product Promise

ChiefOS notices what matters, explains why, and offers a useful next move. When it is unsure, it should invite correction and learn from the user's choice.

## Experience Rules

- Lead with recommendations, preparation, tradeoffs, and next actions.
- Keep metrics as supporting evidence, not the headline.
- Use human-readable product language instead of implementation terms.
- Prefer one clear next step over many equally weighted options.
- Always make automation reversible or reviewable when user trust is at stake.
- Explain why a recommendation exists when it affects mail, calendar, or priorities.
- Treat unchanged states as real outcomes: if nothing changed, say so clearly.
- Avoid urgency theater. Calm wording should still be decisive.

## Patterns To Avoid

- Reporting passive counts without a recommendation.
- Generic diagnostics like "heavy load" without actionability.
- Exposing internal concepts such as refresh mechanics, cursors, classification internals, or confidence scores as primary UX.
- Accept-or-reject automation where the user likely wants to adjust the recommendation.
- CTAs that look like labels, metadata, or loose links.

## Acceptance Criteria

- Every user-visible insight answers at least one of: what matters, why it matters, what to do, or how to adjust ChiefOS.
- System status is phrased in user outcomes, not implementation events.
- Automation suggestions provide a clear action, explanation, and safe escape path.
