# Competition Acceptance Tests

All tests are pass/fail and run against a deployed or production-equivalent environment using fictional seed data. A failure in any Core or Security test blocks competition freeze.

| ID | Test | Pass condition |
|---|---|---|
| C01 Core | Teacher sign-in | Teacher is routed to own dashboard; refresh retains valid session. |
| C02 Core | Assigned class | Teacher sees Grade 7A but not unassigned Grade 7B. |
| C03 Core | Send update | Teacher selects Aarav, sends an Achievement update; one persisted `student_updates` row exists after refresh. |
| C04 Core | Parent live receipt | Linked parent browser displays the new update without manual browser refresh within 10 seconds of committed send. |
| C05 Core | Parent acknowledgement | Parent acknowledgement persists after refresh; repeated tap creates no duplicate. |
| C06 Core | Teacher live status | Teacher browser changes to acknowledged within 10 seconds, and timestamp matches stored acknowledgement. |
| C07 Core | Principal coverage | Principal own-school aggregate changes according to stored update/acknowledgement values; no hard-coded counter. |
| S01 Security | Parent isolation | Parent A directly requests Parent B child/update UUIDs and gets no row/no write permission. |
| S02 Security | Teacher assignment | Teacher attempts REST/RPC/URL access and insert for unassigned class/student; all fail. |
| S03 Security | School isolation | Principal School A cannot query or mutate School B rows/metrics. |
| S04 Security | Client role tamper | Edited browser role/school ID changes no authorization outcome. |
| S05 Security | Secret scan | Client bundle/environment contains no Supabase service-role key or other privileged secret. |
| U01 UX | Form validation | Missing category/title/message or invalid length prevents send with field-specific error; text remains entered. |
| U02 UX | States | Loading, empty, error/retry, and session-expired states are legible on teacher/parent/principal paths. |
| U03 UX | Responsive | Core flow works at presentation laptop width and 375px phone width without horizontal scrolling. |
| A01 Accessibility | Keyboard | Login, class select, student select, send, and acknowledge complete by keyboard with visible focus. |
| R01 Reliability | Refresh | Send and acknowledgement remain correct after all three browsers refresh. |
| R02 Reliability | Realtime recovery | Disconnect/reconnect parent session; refetch restores missed persisted update without duplication. |
| D01 Demo | Reset | Reset restores exact pre-demo fictional state and removes test update/acknowledgement. |
| D02 Demo | Timed script | A presenter completes C01–C07 in 90 seconds or less in three consecutive rehearsals. |

## Freeze rule

No “coming soon” link, fake metric, mock-only persistence, console error in core flow, or unresolved Blocker/Major defect may be visible in the competition build. A recording is a labelled contingency only; live test C01–C07 remains the primary proof.
