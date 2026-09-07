# Future Mobile App

## Decision

Do not build a native mobile app in Release 1. EduBridge is a responsive website first because it is faster to test, easier to demonstrate, and works on a phone browser without an app-store install.

## Keep the web design mobile-ready

- Use responsive layouts and touch-friendly controls.
- Keep product logic in small, documented server/data functions rather than UI-only code.
- Use stable IDs and an explicit data model.
- Keep browser UI separate from database access/permission rules.
- Avoid device-specific features in the core promise.

## Potential future path

1. Measure browser use and ask families whether a mobile app solves a real adoption problem.
2. Make the web app a PWA if offline/install-like behaviour is genuinely needed.
3. Only then consider React Native/Expo or another mobile client using the same authenticated data layer.
4. Add push notifications only with parent/school consent, quiet hours, preference controls, and a clear reminder policy.

## Do not promise yet

No native push, offline sync, background services, app store launch, QR attendance, or device monitoring is in the current plan. A future mobile app should remain an access improvement, not turn EduBridge into a surveillance tool.
