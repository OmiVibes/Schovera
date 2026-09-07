# Testing Strategy

## Quality target

The demo must be truthful: each visible result comes from stored data and permitted user actions. Test the core loop more deeply than optional polish.

## Automated tests

- Unit tests: required fields, dates, state labels, acknowledgement uniqueness.
- Data/permission tests: teacher assigned/unassigned class, parent unrelated-child access, principal cross-school access, draft visibility.
- Integration tests: teacher publish → parent receives/acknowledges → teacher and principal status update.
- End-to-end browser test: teacher, parent, and principal happy path; refresh persistence.

## Manual test checklist

- Desktop widths and common phone width.
- Keyboard-only navigation and visible focus.
- Form validation: blank title/task/class; invalid dates/resource URL.
- Loading/error/retry and session-expired behavior.
- Empty class/update/acknowledgement views.
- Teacher cannot publish to another class.
- Parent cannot inspect another child/class by editing URL.
- Data remains after refresh; actions cannot be double-submitted.
- Demo reset restores the exact starting state.

## Test data

Use fictional accounts for one school, two classes, a few different update states, an absent/catch-up scenario, and some acknowledged/unacknowledged records. Never include personal data in screenshots, test fixtures, or source control.

## Presentation-day smoke test

Within 15 minutes of demo: open site, sign in all three roles, publish one disposable test update, acknowledge it, refresh each account, remove/reset test update, and verify display/network/power backup. If network reliability is uncertain, prepare an honest recorded fallback.

## Defect severity

- **Blocker:** unauthorized data access, sign-in failure, publish/acknowledgement does not persist, broken core demo.
- **Major:** incorrect counts/data, inaccessible primary action, mobile unusable.
- **Minor:** cosmetic spacing/text issue with no flow impact.

Blockers and major defects must be fixed or their path removed before competition freeze.
