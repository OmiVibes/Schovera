# Task 32C — School Entry Dashboards

**Status:** Implemented and verified against local Supabase with temporary synthetic records only. No physical RFID reader, hosted ingestion, Vercel deployment, or production database change is involved.

## What was built

The existing Parent, Teacher, and Principal home workspaces now include a responsive School Entry Records panel backed by the Task 32B-2 event table. Reads use the authenticated browser Supabase client and remain subject to the existing `school_entry_events` SELECT RLS policy. There is no privileged dashboard reader, new RPC, RLS policy, migration, dependency, or Realtime publication.

The panel supports a school-timezone-aware date range, event-type filtering, explicit refresh, 40-row pagination with a 200-row display ceiling, honest empty/error/loading/offline states, and delayed/uncertain timestamp and sequence warnings. The Teacher selector shares the workspace's existing active-class selection. Principal totals are exact counts of recorded check-in/check-out events in the chosen date range; they are explicitly not attendance totals.

## Role behavior and privacy

- **Parent:** Sees the selected linked child's recent recorded scans. Changing children remounts the scoped panel, drops the prior child's visible data, and queries again for the selected child. The selected child's name remains in the Parent workspace context; scan cards do not repeat it.
- **Teacher:** Sees scan records for the currently selected actively assigned class, with student name, grade/roll when available, scan type, timestamp, and delay/sequence indicators. RLS remains authoritative if client filters are changed.
- **Principal:** Sees same-school records, exact check-in/check-out totals for the selected period, and class identity where authorized. No student ranking or safety score is shown.
- **All roles:** Labels say “Check-in recorded” / “Check-out recorded.” A recorded scan is not safety confirmation, physical-presence proof, or classroom attendance. RFID does not mutate `attendance_records`.

No credential reference, card UID, event UUID, device public-key record, service-role value, or receipt internals are selected for display. Browser roles cannot read `student_credentials`, `school_devices`, or `device_event_receipts`. The current database intentionally does not grant dashboard roles access to checkpoint labels, so the UI says “School checkpoint” rather than bypassing that boundary.

## Localization, accessibility, and responsive behavior

All new visible strings, filter labels, warnings, loading/error/empty copy, and controls have English, Hindi, and Marathi translations. This is interface localization only; scan data and teacher-authored text are not translated.

The panel uses a semantic section heading, labelled native controls, visible keyboard focus, decorative scan arrows, and textual event/status labels. Controls remain at least 42px high. Desktop and 390px browser captures were inspected; the 390px role views have no horizontal overflow. The first full role-visual pass caught a Teacher home layout overflow at 768px because the two-column class panel left insufficient width for the new panel header. Teacher home now stacks at the tablet breakpoint; the complete 22-destination × 4-width role visual audit passed on rerun.

## Refresh behavior and limitations

The event table remains unpublished to Supabase Realtime. On panel open, selected child/class changes, date/type filter changes, explicit refresh, browser focus/visibility, and browser reconnect, the component refetches authorized persisted truth. Requests are versioned to discard stale responses; load-more requests are bounded and cannot overlap. This is not instantaneous push delivery: users should use the refresh control or return focus to get a fresh view. No periodic polling is enabled.

School timezone is read through the existing same-school `schools` SELECT policy and used for date boundaries and display. When a device-reported time differs materially from server receipt time or is marked `clock_uncertain`, both observed and received times are shown. Sequence gaps and out-of-order receipts are presented as data-quality indicators, not student judgments.

## Local synthetic demonstration

Do not use `.env.local` or a hosted Supabase project. Follow [Safe Supabase Development](25_SAFE_SUPABASE_DEVELOPMENT.md) and the local-only setup in [Task 32B-2](26_TASK_32B2_RFID_LOCAL_INGESTION.md). From PowerShell at the repository root:

```powershell
npx supabase status # keep the output private; it contains local keys
npm run dev:rfid-local
```

In a second PowerShell window:

```powershell
npm run test:rfid:integration
```

The integration harness creates two temporary synthetic schools, Parent/Teacher/Principal accounts, linked and unlinked children, an assigned and unassigned class, a local-simulator device, credentials, and signed events. It opens all three local roles, creates another check-in while the sessions are already open, verifies a persisted single row, retries that same event, and uses each role's explicit refresh to confirm that the new observation appears once. It also exercises Parent child switching, date and event-type filtering, Hindi/Marathi UI, browser offline/reconnect, 390px overflow, cross-school and unlinked/unassigned RLS denial, anonymous denial, credential/device confidentiality, and unchanged classroom attendance. Cleanup runs in `finally` and verifies controlled rows are removed. No natural demo-school data is changed.

The browser test blocks non-loopback destinations and checks that the local service-role credential is absent from browser JavaScript. The Task 32A simulator's production-target refusal remains covered by `npm run test:rfid` and the backend integration tests. Test accounts are temporary; this task creates no persistent demo login.

## Verification record (2026-10-19)

- `npm run test:rfid`: passed, 19 tests.
- `npm run test:rfid:integration`: passed, including temporary-record cleanup and live-in-session refresh verification for all three roles.
- `npm run verify:student-profile`: passed.
- `npm run verify:phase1`: passed.
- `npm run verify:reconnect`: first run failed at the final Teacher timetable transition while the weekly section was still rendering. The independent rerun passed all Parent/Teacher/Principal recovery, profile, attendance, homework, timetable, multi-child/context isolation, and duplicate-refresh scenarios.
- `npm run verify:accessibility-i18n`: passed.
- `npm run verify:role-navigation`: passed.
- `npm run verify:role-visuals`: initial run exposed the 768px Teacher home overflow described above; after the responsive stack correction, rerun passed all 22 destinations at 1440, 1024, 768, and 390px.
- `npm run typecheck`: passed.
- `npm run lint`: passed with no warnings on the final source and test script.
- `npm run build:local-check`: passed; optimized build completed, TypeScript passed, and all app routes generated. The wrapper forced local-only public Supabase values and removed service-role/AI secrets from the build process.

Screenshots from the synthetic browser run were written to the operating system temporary directory for visual review and are not repository artifacts. Parent mobile, Teacher mobile, and Principal desktop captures were inspected. The content remains labelled synthetic; no physical reader was tested.

## Known limitations and Task 32D recommendations

- This is a read-only school-entry feed, not an RFID device-management interface, attendance system, safety system, or physical reader integration.
- Device labels are intentionally not available to browser roles under the present security model; use a generic checkpoint label until a narrowly scoped, reviewed projection is justified.
- There is no event-table Realtime publication. Consider a minimized opaque change signal only after security review and per-role RLS/refetch testing; retain persisted RLS reads as truth.
- Local ingestion is loopback-only and not a hosted API. Do not expose or tunnel it.
- Before any hardware pilot, separately approve device enrollment/key rotation/revocation, credential lifecycle, time-quality policy, retention, audit/privacy operations, offline gateway behavior, consent, accessibility testing with families, and production threat-model/rollback controls.
- Task 32D should begin with pilot workflow and consent decisions plus a threat-model and local acceptance plan. Do not claim hardware, family notification, immediate Realtime, physical safety, or production readiness based on this UI-only integration.
