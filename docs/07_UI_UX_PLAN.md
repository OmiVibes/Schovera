# UI/UX Plan

## Experience goal

Make the next school action obvious at a glance. The interface should feel like a calm, trustworthy school noticeboard—not a corporate ERP or social feed.

## Visual direction

- Desktop-first responsive layout: comfortable demo width at 1280px and one-column mobile layout.
- Warm navy/indigo for trust, bright teal for action, amber only for due-soon, red only for true errors/overdue state.
- System font or Inter; minimum 16px body text; generous whitespace; consistent 8px spacing scale.
- One primary action per page; use clear labels (“Publish update”, “I understand this”) rather than icons alone.
- Never use fake counters, decorative charts, or arbitrary percentages.

## Key screens

| Screen | Essential content/action |
|---|---|
| Sign in | Role-neutral login, privacy note, demo-account signposts only in demo mode. |
| Teacher home | Assigned classes, “Create update”, recent updates, acknowledgement status. |
| Create update | Short structured form, live preview, clear validation. |
| Student home | Today, Catch Up, empty state when clear. |
| Parent home | Child selector if needed; active child updates; “seen” action. |
| Update detail | Summary, task, due date, optional resource, acknowledgement state. |
| Teacher status | A plain list/count of who has/has not acknowledged—not a ranking. |

## States that must be designed

- First-use: no updates yet / no class assignment.
- Loading: skeleton or concise “Loading updates…” state.
- Empty: explain why there is nothing and the next action.
- Error: human message plus retry; preserve user-entered form text where possible.
- Success: quiet confirmation and updated data.
- Permission denied: simple explanation without exposing private records.
- Mobile: no horizontal scroll; fields and actions remain tappable.

## Accessibility baseline

- Semantic headings, form labels, keyboard focus, visible focus style.
- Sufficient contrast; color never conveys state alone.
- Buttons have descriptive accessible names.
- Form errors identify field and correction.
- Do a keyboard-only pass and screen-reader spot check before release.

## Demo realism

Use a named fictional school, plausible subjects/tasks, dates relative to the demo, and recognisable user names. Clearly label the environment “Demo school data” where appropriate. Do not use real student photos or sensitive personal information.
