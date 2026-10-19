# Task 32I — Automatic School Entry dashboard refresh

**Status:** implementation and local synthetic verification in progress.

## Behavior

The Parent, Teacher and Principal School Entry Records panel polls its existing authenticated, RLS-filtered queries every 20 seconds while mounted, the tab is visible and the browser is online. This is bounded polling, not Realtime or a delivery guarantee. The resolved `school_entry_events` table remains unpublished to Realtime.

Each poll is a one-shot timeout scheduled after the previous read completes, so the loop does not overlap itself. The panel also guards all reads against overlap, applies an abort signal when the child/class/date/filter scope changes or the panel unmounts, and ignores stale request results. Parent child and Teacher class filters remain in each authorized query; Principal reads stay filtered to its school. Existing 40-row pages and 200-row display cap remain. Refreshes merge new recent rows by event ID with already loaded rows so polling preserves pagination without showing duplicate cards.

After an unsuccessful background refresh, the panel keeps the last successful results visible and announces that newer records could not be checked. Retry delay starts at 40 seconds after the first failed 20-second poll, doubles to a maximum of 120 seconds, and resets to 20 seconds after success. An explicit manual refresh remains available. A successful query updates the localized Last updated status. Refreshes do not replace the panel with a full loading state when the current scope already has loaded data.

Polling pauses on hidden/offline transitions and resumes with an authorized read when the page becomes visible/focused or comes online. Existing reconnect recovery remains active; the panel's shared in-flight guard coalesces coincident focus/online and polling attempts. Unmount clears timers and aborts the current scope request. No student name, ID, credential, or service-role value is sent to a polling endpoint; the browser uses its existing authenticated Supabase client and RLS.

## Query volume

At the 20-second cadence, the School Entry panel initiates at most three scheduled refresh cycles per minute per visible active user. Each Parent cycle uses one event-list query. Each Principal cycle uses one event-list query and two exact count queries. Each Teacher cycle additionally reads the active roster before the event list and two count queries (up to four reads). Manual refresh, scope changes and bounded focus/reconnect recovery can add reads. Hidden/offline tabs schedule no periodic reads. This is a modest-pilot setting, not a fleet-scale capacity claim.

## Localization and accessibility

English, Hindi and Marathi include the Last updated and recoverable-background-error labels. The timestamp is presented in the existing school timezone. The status message uses a polite live region; errors that prevent initial data are alerts, while transient refresh errors are status messages so the stale data remains available. Existing semantic headings, native controls, visible focus and responsive layout are retained.

## Local verification

To be finalized after local checks. Expected checks include deterministic scheduler tests, Task 32H's local synthetic gateway-to-Supabase/browser integration with Parent/Teacher/Principal pages open during one poll, offline/reconnect verification, RFID/gateway/attribution suites, accessibility/i18n, role navigation/visuals, typecheck, lint and the isolated build.

All API/browser integration uses only the loopback local Supabase environment and temporary synthetic data. No hosted project or Vercel endpoint is used. Polling does not make scans instant, guarantee notification delivery, or establish presence/safety/attendance. Classroom `attendance_records` are unchanged. No physical reader was tested.
