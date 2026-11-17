# Software feature evidence sheet

17 November 2026. Categories describe scope, not production certification. The [M6 release freeze](../66_M6_SECURITY_STABILIZATION_AND_RELEASE_FREEZE.md) records the latest security/stability executions; the [M5 report](../65_M5_ROBOTEX_COMPETITION_RELEASE.md) and [M1](../61_M1_ATTENDANCE_INTEGRITY.md)–M4 reports retain their historical evidence. A recorded test is not human or hardware acceptance.

| Feature | Category | Defensible statement / evidence |
|---|---|---|
| Role-scoped original updates and parent acknowledgement | WORKING AND TESTED | Connected journey and competition rehearsal verify actual persisted original/acknowledgement; no Principal pre-approval of every original |
| Parent profile, homework and timetable views | WORKING AND TESTED | Current connected journey checks authorized persisted views; data completeness and every date/filter state are outside that check |
| Teacher homework editing, Principal notices/timetable authoring | WORKING WITH LIMITATIONS | Existing dedicated acceptance and prior reports; M5 does not repeat every authoring form or add publishing permissions |
| Principal local account administration | WORKING WITH LIMITATIONS | Existing separate guarded account-server mode; competition RFID mode does not enable this privileged API; account lifecycle suite not freshly rerun in M5/M6 |
| Draft/final attendance, revisions and correction reasons | WORKING AND TESTED | M1 acceptance; manual teacher confirmation is separate from gate evidence; stale writes rejected |
| Exact Principal totals and exception review | WORKING AND TESTED | Boundary regression, M2 review and current-role evidence; not a claim of unlimited load |
| Parent published attendance | WORKING AND TESTED | Draft/default values do not become confirmed parent records |
| Signed immutable v2 event and idempotent delivery | WORKING AND TESTED | Software integrations exercise synthetic signatures, binding, revocation and replay; not physical card identity proof |
| Legacy v1 gate endpoint | WORKING WITH LIMITATIONS | Reference-only legacy scope; excluded from named M3 reconciliation claims, not a substitute for immutable v2 evidence |
| SQLite queue/restart/replay | WORKING WITH LIMITATIONS | Real disk queue and local destination receipts; service must be reachable; hardware power-loss acceptance absent |
| Teacher offline attendance/Important update | WORKING WITH LIMITATIONS | Short capture lease, same-teacher fresh replay, bounded local prototype; not a full browser/PWA offline guarantee |
| Held-work resolution | WORKING WITH LIMITATIONS | Authorized new revision/reason or close-without-apply; original immutable envelope retained; separate operational policy needed |
| English/Hindi/Marathi interface | WORKING WITH LIMITATIONS | Automated language/width checks; fluent wording and all assistive-technology states need human review |
| Approved translation and automatic translation | WORKING WITH LIMITATIONS | Original preserved and approval separate; automatic local model output is not guaranteed accurate |
| Korean message translation/speech | WORKING WITH LIMITATIONS | Existing message features only; no Korean global interface; human semantics/pronunciation review required |
| Audio controls/native voices | WORKING WITH LIMITATIONS | Actual media progress or voice callbacks can be measured; speaker audibility is a presentation-device check |
| Local Ollama teaching drafts/workbooks | WORKING WITH LIMITATIONS | Prior local generation and workbook evidence; optional service/model must be running; teacher review mandatory |
| Mock reader and adapter outage | SIMULATED | Synthetic event input and transport failure; real queue/RPC writes, not a physical tap or Wi-Fi cut |
| SMS/IVR fallback receipts | SIMULATED | No actual recipient delivery or provider adapter enabled |
| B2B annual pricing and optional hardware service | PLANNED | Explicit financial assumptions, no customers or validated demand claimed |
| Physical RFID reader/Pi driver | NOT IMPLEMENTED | Physical driver remains unconfigured; electrical/reader/site tests pending |
| Public production hosting and separate cloud replica acceptance | NOT IMPLEMENTED | This release does not provide a reviewed public operating environment |
| Real SMS/calls | NOT IMPLEMENTED | Needs provider, consent, verified recipients, limits and separate authorization |
| Excused attendance | PLANNED | Policy/versioned compatibility unresolved; existing Present/Absent/Late retained |

“Working” means the specified software path within its executed scope. It never means every data size, device, language sentence, outage, school or future hosted environment was tested. See the final report for any current failures or blockers.
