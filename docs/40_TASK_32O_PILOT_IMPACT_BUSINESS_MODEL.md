# Schovera — Proposed school pilot, impact measurement and sustainability

Task 32O · prepared 2026-10-20 for the Robotex International 2026 presentation.

**Status: planning package, not an approved or active pilot.** ZP School Lonikand is a **proposed pilot location only**. No school agreement, partnership, parent permission, survey response, real-user adoption, measured educational benefit or hardware purchase is evidenced by this task. No outreach, data collection, production access or deployment was performed.

Repository baseline: `b3df1b3190bfc1c97d16328ee96d235265082a7d` on `feat/task32n-attendance-insights`. Documentation branch: `docs/task32o-pilot-business-model`. Implementation statements below describe that repository and its **recorded local synthetic tests**, not independently inspected production. This document does not establish competition acceptance, eligibility, awards or endorsement.

## 1. A simple explanation

**Problem:** a family may miss an important school message when it is difficult to find, hard to read, in an unfamiliar language or unavailable during a connection problem. Teachers also need a clear way to see which messages still need attention. These are the problems we propose to investigate with a school; their prevalence and scale have not been measured here.

**Solution:** Schovera brings a child's school updates into a role-specific website. Teachers send updates, Parents see their linked children, and Principals oversee their school. A Parent can acknowledge an Important update. Reviewed language versions and user-controlled listening offer additional ways to access the text. Separate local simulations explore offline entry records and future SMS/call fallback. Classroom attendance support explains recorded patterns without predicting a child's future.

| Beneficiary | Available design or local implementation | Benefit to test, not an achieved result |
|---|---|---|
| Parents with limited time or reading confidence | Child-specific updates, Important acknowledgement, text and Listen/Pause/Resume/Stop controls. | Can a caregiver find the right message, use a preferred reading method and understand the requested action with less difficulty? Acknowledgement alone cannot answer this. |
| Hindi/Marathi-speaking families | English/Hindi/Marathi UI; separately entered, Principal-approved notice translations; View original. Matching browser voices are conditional. | Does competent translation review and a suitable device improve access and reported ease of understanding? UI localization alone does not translate a message. |
| Teachers | Assigned-class communication, correction history, classroom attendance and read-only attendance insights. | Is communication manageable, and are the explanations useful without creating excessive review work? Time savings are unmeasured. |
| Principals | School-scoped communication/acknowledgement oversight, translation approval and attendance-record review. | Can staff identify recording or communication gaps and arrange supportive human review? No attendance improvement or dropout reduction is established. |
| Schools with unreliable internet | Durable laptop SQLite gateway and offline-to-local-Supabase synchronization tested with synthetic events. | Can a future reviewed deployment recover queued observations reliably? The Parent website is not a proven offline app, the gateway is not a deployed Pi, and remote families do not receive updates during a total outage. |

Three presentation differentiators are **design priorities, not claims of market uniqueness**: (1) linked-child context and accountable communication; (2) reviewed language choices with the original preserved and honest voice fallback; (3) visible evidence boundaries—explainable attendance rules and labelled offline/notification simulation rather than safety or AI-prediction claims.

## 2. What actually exists: evidence and limits

| Capability | Repository/local status | Evidence and presentation boundary |
|---|---|---|
| Role workspaces, linked-child selection, Teacher Important updates, Parent acknowledgement and immutable corrections | Implemented; local synthetic integration evidence. | [Demo runbook](36_TASK_32K_PREP_INTERNATIONAL_DEMO.md), [Task 32L](37_TASK_32L_MULTILINGUAL_NOTICE_TRANSLATION.md), and the latest regressions in [Task 32N](39_TASK_32N_ATTENDANCE_EARLY_WARNING_INSIGHTS.md). An acknowledgement is an explicit account action, not proof of reading, understanding, parenting quality or learning. School-wide announcements do not currently have the same acknowledgement model. |
| Reviewed English/Hindi/Marathi notice versions | Implemented locally; human entry, draft/submit/Principal approval, source-change invalidation and original fallback. | [Task 32L](37_TASK_32L_MULTILINGUAL_NOTICE_TRANSLATION.md), `communication_translations` and its [migration](../supabase/migrations/20261020110000_add_reviewed_communication_translations.sql). No automatic translation API. Principal approval is not a language-accuracy guarantee or an enforced two-person review for Principal-authored announcements. |
| Parent voice accessibility | Controls and language-matching behavior implemented; automated tests use mocks. | [Task 32J](34_TASK_32J_PARENT_VOICE_ACCESSIBILITY.md) and Task 32L. Recorded headless checks reported zero installed voice locales. Audible Marathi/Hindi/English quality on the presentation/family devices is **not verified**. Browser/OS speech may use network services; do not promise offline speech. |
| School-entry visibility and refresh | RLS-scoped resolved-event panels and bounded 20-second foreground/online polling implemented locally. | [Task 32I](33_TASK_32I_AUTOMATIC_ENTRY_REFRESH.md). No raw entry-table Realtime publication; polling is not instant delivery. A recorded scan is not classroom attendance, identity proof or a safety determination. |
| Durable offline gateway, assignment-bound event v2, retries/revocation | Implemented software simulation and loopback sync acceptance, not deployed hardware. | [Task 32G](31_TASK_32G_RFID_EVENT_V2_IMPLEMENTATION.md), [Task 32H](32_TASK_32H_OFFLINE_LOCAL_SYNC.md). Stable IDs and canonical receipts suppress duplicate processing. A revoked/uncertain assignment stays unresolved, not guessed as a new owner. At-least-once transport, not exactly-once networking; v1 HTTP ingestion is retired. |
| SMS/automated-call fallback | **SIMULATED ONLY**, local consent, synthetic recipients, fake provider outcomes/receipts and retry tests. | [Task 32M](38_TASK_32M_SMS_IVR_FALLBACK_SIMULATOR.md), [pure fake provider](../src/lib/fallback-provider.ts). No real numbers, dialling, paid provider or public callback. Simulation consent is not permission for real SMS/calls. Fake delivery never acknowledges a Parent's notice. |
| Classroom attendance insights | Implemented read-only rules and local synthetic acceptance. | [Task 32N](39_TASK_32N_ATTENDANCE_EARLY_WARNING_INSIGHTS.md), [rule code](../src/lib/attendance-insights.ts). Latest five complete recorded dates: at least three absences, or latest three recorded observations absent; improvement requires two complete five-date periods. Missing is not absent; no holiday/enrollment-history calendar, risk score or validated dropout prediction. |
| Real-school impact, hardware, hosted device sync and operational readiness | **Proposed/unvalidated**. | No RC522/MCU/Pi electrical/RF tests, real-student pilot, production ingestion acceptance, verified family reach, attendance gains or cost savings are established. Do not infer them from software tests or an existing website address. |

The latest Task 32N record documents **135 passing focused unit/control/rule checks**, additional local DB/browser acceptance, a 22-destination × four-width visual audit, and isolated builds. Those are historical software checks at identified commits—not a new Task 32O test run, an accessibility certification, a school survey or impact evidence.

**Reading older plans correctly:** [Task 32D's threat model](28_TASK_32D_PILOT_SECURITY_AND_OFFLINE_PLAN.md) remains the pilot-risk reference, but its original v1 attribution, in-memory queue and no-polling descriptions are historical. Later G/H/I work addresses those **local software** gaps; it does not close physical-device or hosted-operation gates. [Task 32J-SEC](35_TASK_32JSEC_DEPENDENCY_SECURITY.md) records dependency patches and an unresolved development-tool advisory at its audit date. Task 32O does not re-audit dependencies or claim production is vulnerability-free. The older [business sketch](08_BUSINESS_MODEL.md) uses legacy branding and unvalidated benefit statements; this Schovera package is the scoped, explicitly hypothetical planning version.

## 3. Proposed pilot: permission first, communication first

**Draft size, not recruitment:** one school-selected class, at most 20 voluntarily participating Parent accounts, two willing Teachers and one Principal/coordinator. Account count is not household or student count. Do not select or label children by predicted risk. Participation, schedule, grades and actual cohort remain unconfirmed. Essential school communication must continue through the school's existing process for everyone.

| Phase | Proposed activity and duration | Accountable roles and exit gate |
|---|---|---|
| A — consultation and permissions | Future leadership consultation; timing unknown. Confirm the problem, local languages, accountable data owner, spending authority, support capacity and whether a pilot is wanted. No family data needed to discuss the idea. | School head/management and designated project/support adult. Written scope and permission to proceed to preparation—not an assumed partnership or authorization to collect child data. **No consultation has occurred in Task 32O.** |
| B — privacy, consent, training and synthetic demonstration | After A, preparation time set by the school plus one proposed synthetic training session; no promise that approvals take only a week. Approve notice wording, opt-outs, purpose, access, retention, deletion, processor/hosting arrangements, incident response and evaluation protocol. Rehearse paper and assisted alternatives. Test actual devices/languages. | School data/privacy lead, qualified adviser as needed, trained Teachers, bilingual reviewer and technical support. Required permissions and appropriate child notice/assent arrangements; approved infrastructure/security/deployment acceptance; no unresolved critical authorization failure. Synthetic demonstration alone does not unlock real accounts. |
| C — optional supervised communication-only pilot | Only after all applicable gates, proposed two baseline weeks using the existing workflow and two intervention weeks of ordinary, low-sensitivity communications mirrored through Schovera. Use approved real accounts only in a separately authorized deployment. Do not create new notices just to inflate activity. No hardware, SMS/IVR, automated attendance warning or emergency-only use. | School coordinator owns eligibility and enrolment; Teachers author; Principal reviews translations; Parents choose whether/how to participate; adult support resolves access problems. Consent and safe operations remain valid each week. The existing manual process remains authoritative. These weeks are a proposed timetable, not collected baseline/follow-up data. |
| D — evaluation and closure | Weekly usability/workload/reliability review during C; proposed one final closure week. Use the pre-agreed measures below, record nonresponse and harm/incident reports, discuss stop/adapt/continue, and perform approved data cleanup. Attendance-insight exercises remain synthetic unless classroom-data evaluation receives separate approval. | Principal and privacy reviewer approve only minimum aggregated findings for presenters. Staff and Parents may recommend stopping. Any continuation needs a new agreed scope; no automatic rollout. |
| E — separate hardware decision | No date or purchase commitment. Consider a supervised single-entrance synthetic bench/pilot only after electrical, credential, secure provisioning, durable storage, key custody, power/network, retention and reviewed hosted-ingestion gates. | School head, privacy/security lead and competent hardware technician. Apply the Task 32D threat model with current G/H/I contracts. A tap cannot replace classroom attendance, identity checks, authorized pickup or safeguarding procedures. |

**Roles:** the school—not student presenters—chooses the data owner and authorized operators. Teachers access their assigned classes; Principals their school; Parents their linked children. A competent bilingual reviewer supports Principal review; no new reviewer role is implemented by this plan. Technical maintainers use approved least-privilege operations, not shared service-role keys or shared family logins. An evaluator receives reviewed aggregates, not a new schoolwide browser permission. Presenters use synthetic material and aggregate reports only.

**Choice and alternatives:** participation and feedback are voluntary, with a verbal explanation in the preferred language and an option not to answer. Offer paper notices and an authorized staff member's spoken explanation without penalty. No smartphone, reading-confidence disclosure or subscription payment is required from a Parent. Opt-out stops new optional pilot contact/processing under the approved withdrawal procedure; necessary official records and legally required retention must be handled separately. Preserve the child's access to school information. Do not reuse fake SMS/IVR preferences as real contact consent.

**Stop immediately:** suspected cross-child/cross-school disclosure, credential compromise, a misleading safety claim, coercion, missing essential notices without a working manual alternative, unapproved processing/provider use, or workload/support failure the school cannot safely manage. Pause the pilot, use the established school process, notify the accountable adult/privacy contact, preserve only approved incident evidence and obtain a reviewed restart decision. No student presenter investigates a real family's private account.

## 4. Measurement protocol — definitions before results

All metrics below are **future instruments**, not observed results. No impact measurement/export tool is added. Most access, comprehension, elapsed-work and historical-cohort measures need a separately approved minimal observation log. Existing UI counters are not substitutes for these definitions.

Before Phase C, the school must freeze: cohort/unit, notice types and versions, observation dates/timezone, deadlines, permitted assistance, exclusions, reviewer, privacy controls and success/stop criteria. Report actual `n` and denominator, missingness, withdrawals and context for every rate; if denominator is zero or cannot be reconstructed, report **not calculable**, not 0% or 100%. Record timestamps consistently in UTC and display school-local time. Distinguish elapsed hours from school days.

Maintain an approved, restricted pseudonymous eligibility/notice-version manifest only if permission covers it. Current parent links do not reconstruct who was eligible months ago; current translation rows do not provide full historical cycles; there is no household entity or notice-open analytics guaranteeing family reach. Never invent those histories. Report original and correction identities explicitly; withdraw/censor a superseded notice according to a pre-agreed rule, report the count/reason, and do not silently transfer acknowledgement to a correction or discard unacknowledged notices to raise a rate.

The existing paper/spoken baseline may have **no equivalent acknowledgement timestamp or approval-cycle evidence**. In that case M1/M2/M4/M5 are follow-up-only descriptions, with baseline marked unavailable; do not manufacture an app-like baseline or compare a returned paper slip directly with an in-app action. Only compare separately collected manual confirmations if their definition, eligibility and observation window were explicitly agreed and genuinely comparable. Access/ease/workload tasks may offer more defensible baseline comparisons, still subject to selection and observer effects.

### M1 — Important-update acknowledgement coverage

- **Definition:** `100 × acknowledged eligible Parent–update pairs by 72 elapsed hours / all eligible Parent–update pairs with a complete 72-hour follow-up`. A Parent linked to two children is one target per relevant child-specific update, not two targets for the same update. Freeze the eligible consenting account/link snapshot at publication; keep withdrawn/not-mature/censored cases separately visible. School-wide announcements are excluded because their current model has no equivalent acknowledgement action.
- **Source/frequency/owner:** `student_updates.sent_at`, `acknowledgements(update_id,parent_id,acknowledged_at)` and the approved eligibility/version manifest; weekly, reviewed by the school coordinator/Principal. These fields exist in the [base schema](../supabase/migrations/20260907180000_vertical_slice.sql). Do not calculate historical denominators from today's links alone.
- **Privacy/limits:** restricted joins internally, aggregate counts externally with small-cell rules. Acknowledgement is an account action, not comprehension or proof of delivery to a person. Weekends, shared accounts, connectivity and staff reminders affect the result; 72 hours is a proposed measurement convention, not a validated response deadline.

### M2 — Time to acknowledgement

- **Definition:** median of `acknowledged_at − sent_at` in hours for eligible pairs acknowledged within a complete seven-day observation window. Report number acknowledged, total eligible pairs and still-unacknowledged/censored cases alongside it; never assign zero hours to missing acknowledgements. The median describes responders, not all families.
- **Source/frequency/owner:** the same timestamp/eligibility sources as M1; weekly after windows mature, coordinator review.
- **Privacy/limits:** do not publish individual times or rank Parents. Easy notices, reminders, school closures, account sharing and selective response confound comparisons; a quicker responder-only median can coexist with worse coverage.

### M3 — Access to the correct notice

- **Definition:** distinct eligible Parent accounts successfully opening the correct linked-child notice during a voluntary observed task / all eligible accounts offered the same task and a reasonable opportunity to try. Report independent completion, human-assisted completion, failed/not-attempted, and nonresponse separately. Normal accessibility aids are allowed; define human assistance consistently. This is an account-access measure, **not a verified count of households reached**.
- **Source/frequency/owner:** future consented task checklist (yes/no/not attempted and assistance category), not pageview/login/acknowledgement inference; once at baseline and once at follow-up, trained facilitator under coordinator supervision.
- **Privacy/limits:** use synthetic task text where possible and record no notice content, passwords or screenshots of personal accounts. Household structure, device sharing, selection bias and observer assistance matter; do not add invasive tracking just to fill a metric.

### M4 — Approved translation availability

- **Definition:** `100 × requested notice–target-language pairs with a current approved source-bound version by the agreed publishing deadline / all requested notice–target-language pairs in the plan`. Count a language version once, not once per viewer. Keep missing, draft, withdrawn and late approvals in the report; the original is a fallback, not a successful translation. A competent reviewer must determine whether an original already satisfies a requested language because original-language metadata is not reliable.
- **Source/frequency/owner:** `communication_translations.language,status,source_hash,approved_at` checked against the exact original, plus the approved request/deadline log; weekly, Principal and competent bilingual reviewer.
- **Privacy/limits:** share only language-level totals after small-cell review; never export private text. Approval does not establish correctness. Notice complexity, reviewer availability and corrections affect coverage.

### M5 — Translation approval turnaround

- **Definition:** median hours from submission to approval in the **same review cycle**, plus counts awaiting/rejected/withdrawn at cutoff. Rejected is a future manual-review category, not a current translation-table status. Denominator for the duration summary is completed paired cycles; separately report all submitted cycles. Do not use current `updated_at` as a fabricated submission timestamp.
- **Source/frequency/owner:** current approval metadata and `translation_submit` / `translation_approve` audit actions where a cycle can be unambiguously paired, otherwise a future approved minimal cycle log; weekly, Principal. [Translation RPC](../supabase/migrations/20261020110000_add_reviewed_communication_translations.sql) records actions, but current rows are not a complete text-version archive. Ambiguous history is not calculable.
- **Privacy/limits:** log cycle code, language and times only, not message bodies. Resubmissions, self-review of Principal notices and reviewer workload must be disclosed; turnaround is not translation-quality validation.

### M6 — Parent-reported ease of understanding

- **Definition:** responses 4 or 5 on a clearly explained five-point ease scale / valid responses to the same optional question. Report full response distribution, valid `n`, invited `n` and skipped count. No response is not a negative score; an easy rating is not an objective comprehension result.
- **Source/frequency/owner:** future instrument in section 5, offered orally or on paper without pressure; baseline/follow-up only if approved, independent facilitator where feasible.
- **Privacy/limits:** no literacy, health, income or family-circumstance fields; no attribution to individual families. Language choice, courtesy bias, assisted completion, message difficulty and nonresponse limit inference. Do not generalize from volunteers to all families.

### M7 — Voice availability and usable playback on actual devices

- **Definition:** successful device–language trials / attempted device–language trials, counted once per tested browser/OS/version and selected language. Report matching voice discovered, sound actually heard, meaning/pronunciation accepted by a competent listener, and pause/resume/stop outcomes **separately**. Missing voice is a recorded failure/unavailable outcome, not a substituted-language success; no-device/not-attempted cases are separate.
- **Source/frequency/owner:** future manual checklist using the synthetic phrases in the [demo runbook](36_TASK_32K_PREP_INTERNATIONAL_DEMO.md); preflight and whenever device/browser/voice changes, facilitator plus Hindi/Marathi-competent listener. There is no completed manual-audio result in this package.
- **Privacy/limits:** synthetic text only; no recordings of children or private messages. Review browser/OS speech processing before any private text is used. Installed voices, network policy, volume/hearing environment and pronunciation vary; mocked tests and voice inventory alone do not prove usable audible speech.

### M8 — Teacher communication workload

- **Definition:** total person-minutes for drafting, checking/translation work, sending, corrections and follow-up per comparable notice; report median and range, notice count and contributing staff count. Log other staff's work separately so moving work to a Principal/reviewer does not masquerade as a Teacher saving. No rate denominator beyond the comparable task/notice count is implied.
- **Source/frequency/owner:** short voluntary staff task-time log, not a difference between publish timestamps; sample agreed comparable tasks in baseline/follow-up weeks, coordinator review with Teachers.
- **Privacy/limits:** staff codes, task category and duration only; no family narratives. Never use as staff performance ranking. Exam periods, learning curve, duplicate paper work and changing notice volume confound before/after comparisons. Cost-model hours below are hypothetical, not workload observations.

### M9 — Controlled offline-to-local synchronization

- **Definition:** unique durably queued synthetic events with a canonical server receipt persisted locally within a pre-agreed recovery window / all unique events durably committed before the controlled connection restore. Suggested test window: five elapsed minutes, declared before the run—not a service guarantee. Report accepted, unresolved, pending, rejected and attention-required separately. A stored unresolved receipt can prove reconciliation occurred; it is **not a successful named entry or family delivery**. Transport retries do not add denominator events.
- **Source/frequency/owner:** isolated temporary SQLite outbox plus local v2 receipts and controlled harness timestamps; each scripted acceptance run, technical maintainer with independent observer. Existing [gateway acceptance](../scripts/verify-gateway-v2.integration.test.ts) is local synthetic evidence; this task adds no benchmark run or new success percentage.
- **Privacy/limits:** synthetic identities only; aggregate results and exact build/test conditions. Loopback outage/reopen is not a physical power-loss, Pi, school-network, total-internet or hosted-cloud test. Remote Parent alerts cannot arrive while the required network is unavailable.

### M10 — Unresolved RFID observations

- **Definition:** count of distinct `(device_id,device_event_id)` receipts whose outcome is `unresolved`; optional proportion is that count / all distinct processed accepted-or-unresolved receipts from the same controlled run. Report invalid/rejected requests and pending events separately, not as silently missing observations. Absence from a Parent dashboard is not a way to infer this count.
- **Source/frequency/owner:** private receipt data, currently inaccessible to normal browser roles; local test harness now, a separately approved narrowly scoped aggregate operational report if ever required later. Review each test; any real-pilot cadence/authority must be approved separately. No review UI/report role is invented here.
- **Privacy/limits:** maintainers must not share service-role keys with Teachers; publish no card, student, assignment or receipt identifiers. Unknown/revoked/expired assignments are safety-conscious unresolved outcomes, not proof that a child is absent, unsafe or associated with a new card owner. No real-student collection is authorized.

### M11 — Classroom attendance recording completeness

- **Definition:** product-supported descriptive coverage is exactly-one valid attendance entry / current active roster on each **recorded class date**, not scheduled-day completeness. An `absent` entry is still a completed register entry. To measure full expected student-day completeness, numerator is expected eligible student-date pairs with exactly one valid status, denominator is all expected eligible student-date pairs from an independently verified open-school calendar **and date-specific enrollment roster**. If either source is unavailable, do not publish that broader rate.
- **Source/frequency/owner:** `attendance_records`, current roster and [Task 32N rules](../src/lib/attendance-insights.ts) for the limited descriptive view; approved official calendars/historical rosters only for a separately authorized broader measure. Weekly, class Teacher and Principal; synthetic evaluation until real attendance-data use is separately approved.
- **Privacy/limits:** aggregate data-quality counts only; no student ranking, reason inference or medical/family narratives. Missing dates are not absences. Transfers, holidays, class moves, corrections and incomplete recording confound attendance trends. Neither a rise in recorded completeness nor an insight flag proves attendance improved or dropout reduced. Do not use gate scans as the numerator.

### Scorecard, comparison and privacy rules

For every review use: `metric ID | protocol/window | eligible n | observed n | baseline | follow-up | exclusions/missingness | reviewer | uncertainty/decision`. **Every school baseline/follow-up result is currently “not collected.”** Synthetic test evidence belongs in a separate software-evidence column. Do not fill this scorecard with illustrative costs, automated test counts or made-up impact figures.

Use matched types/complexity of notice and comparable opportunities only after approved observations exist. Report descriptive differences, not causal claims: no control/randomization is proposed, the cohort is small and self-selected, and exam/holiday/connectivity/reminder effects remain. Do not withhold essential information from a comparison group. Agree acceptable workload/access targets with school staff before collecting results; none is a proven benchmark here.

School-approved reviewers work within existing authorization; presenters receive only reviewed aggregates. Proposed public-report rule: suppress cells below five observations and any combinations that identify someone, or combine/withhold categories. This is a precaution, **not an anonymity guarantee**, and may mean the small pilot cannot publish subgroup results. Keep pseudonym re-identification keys at the school separately; no credential sharing, raw message exports, medical/family explanations or individual activity timelines in presentation material.

Before collection, approve retention by category, access and deletion verification, including backups. A **draft proposal**, not a legal rule, is to delete optional identifiable evaluation logs within 30 days after closure and keep only reviewed non-identifying summaries for the presentation; exact consent/audit/official-record and backup retention must be decided by the responsible school/privacy adviser. Do not erase required school records to meet a demo schedule. If retention/deletion cannot be implemented and verified, Phase C is blocked. No retention job is added here.

## 5. Future feedback instruments — not administered

Offer one question at a time, orally or in writing, in a comfortable language. Explain: “This is optional. You can skip a question or stop. This will not affect your child's school services.” Adults answer these forms; direct child feedback would need a separate age-appropriate protocol and permissions. Do not collect names, phone numbers, diagnoses, caste/religion/income or private family stories. “Prefer not to answer” is always available. Do not request real notice screenshots.

### Parent questions (future pilot instrument)

1. Which language would you prefer for this notice: Marathi, Hindi, English, another language, or no preference? No promise is made for languages not supported.
2. Using this **synthetic** example, can you find the right child's notice and the date of the activity? Facilitator records independent / human-assisted / not completed / not attempted, not the account password or personal message.
3. How easy was this notice to understand? 1 very difficult, 2 difficult, 3 neither easy nor difficult, 4 easy, 5 very easy, or skip.
4. Which way would you prefer to receive this information: read the text, listen where a suitable voice is available, a staff explanation, paper, or another method? Multiple choices allowed.
5. What was difficult: finding the message, words/language, text size, listening, connection, nothing, or prefer not to say? Optional suggestions should describe the interface, not a child's/family's situation.

**Optional Marathi draft — future instrument, not a validated translation.** A competent Marathi-speaking school reviewer must approve wording and read-aloud clarity before use.

- प्रस्तावना: “हे प्रश्न ऐच्छिक आहेत. तुम्ही कोणताही प्रश्न वगळू शकता किंवा थांबू शकता. याचा तुमच्या मुलाला मिळणाऱ्या शालेय सेवांवर परिणाम होणार नाही.”
- १. ही सूचना कोणत्या भाषेत हवी आहे—मराठी, हिंदी, इंग्रजी, दुसरी भाषा, की काही पसंती नाही?
- २. या **नमुना** सूचनेत योग्य मुलाची सूचना आणि कार्यक्रमाची तारीख शोधता येते का? मदत हवी असल्यास सांगा; हा परीक्षेचा प्रश्न नाही.
- ३. सूचना समजणे किती सोपे होते? १ खूप अवघड, २ अवघड, ३ ना सोपे ना अवघड, ४ सोपे, ५ खूप सोपे; किंवा उत्तर द्यायचे नाही.
- ४. माहिती कशी हवी—मजकूर वाचून, योग्य आवाज उपलब्ध असल्यास ऐकून, कर्मचाऱ्यांच्या स्पष्टीकरणातून, कागदावर, की दुसऱ्या मार्गाने? एकापेक्षा जास्त पर्याय चालतील.
- ५. काय अवघड वाटले—सूचना शोधणे, शब्द किंवा भाषा, अक्षरांचा आकार, ऐकणे, इंटरनेट, काहीच नाही, की सांगायचे नाही? कृपया मुलाची किंवा कुटुंबाची खासगी माहिती देऊ नका.

### Teacher questions (future pilot instrument)

1. Could you send the intended synthetic update, correct it and find acknowledgement status? Which step needed help?
2. For the agreed comparable task, how many minutes went to drafting, checking/translation, sending, corrections and follow-up? Record other staff involvement separately.
3. Was the workload manageable compared with the existing process: less, similar, more, or not enough experience to tell? What interface change would help?
4. Can you explain why an attendance indicator appeared, distinguish missing data from absence, and correct the register through the usual process? Use synthetic records; do not describe a child's reason for absence.

### Principal questions (future pilot instrument)

1. Could authorized staff review Important communication and a translation without seeing another school's or an unassigned class's data? Any suspected access problem stops the session.
2. Was there enough competent review/support capacity, including paper and spoken alternatives? Which tasks lacked an owner?
3. Are acknowledgement and data-quality summaries understandable without treating them as comprehension, attendance or safety proof?
4. Would you stop, adapt or consider continuing, and why? What actual approved budget/procurement route and staff capacity would be needed? No willingness to pay or agreement is assumed.

## 6. Sustainability: hypotheses to test, not sales commitments

Parents and children are users, **not assumed subscription payers**. No advertising, sale of child data, paid access to essential notices or outcome-based family penalties is proposed. No school has agreed to buy. Government-school authority, sponsor eligibility and procurement must be checked, not assumed from a Principal's interest.

| Option | Possible payer/value | Constraints and validation needed |
|---|---|---|
| School-funded subscription | Authorized school budget funds software/support after a voluntary pilot and cost review. | Confirm actual authority, purchasing cycle, support needs and affordability; essential alternatives continue if funding stops. Not a current price offer or signed contract. |
| NGO / CSR sponsorship | A willing, approved sponsor funds government-school access/training. | No sponsor or grant is secured. Verify conditions, independence, continuity, reporting burden and privacy; funding must not buy access to children's data. |
| District-level agreement | A properly authorized body funds shared support across schools. | Proposed later, only after school-level evidence and procurement/security review; no district partnership or scale-readiness claim. |
| Shared support pool | Several consenting schools share training/helpdesk/maintenance costs. | May reduce some fixed costs but adds travel, coordination and tenant/security complexity. Cost savings are unmeasured; preserve per-school authorization. |
| Optional hardware service | Separately approved installation/maintenance budget, not compulsory for communication. | Requires the hardware/security gates, written scope and real quotations. No hardware service is being sold or purchased here. |

### Illustrative communication-only cost worksheet

**All rupee values, hourly rates, staffing hours, quantities, prices and contingency percentages below are hypothetical planning assumptions—not vendor quotations, observed costs, commitments or recommended purchases.** No vendor was contacted and no current price research was performed. Replace these cells with dated quotations and observed staff effort before any funding or spending decision. Even internal/volunteer time must be costed; a free hosting tier is not assumed sufficient for real-school operations.

Illustrative one-school scenario: **200 eligible enrolled students**, independent of the much smaller proposed pilot-account cohort. Costs are INR; taxes, actual tariffs and adequate security/legal review effort remain unquoted and must be added. These placeholder hours may be insufficient; affordability is not established by the worksheet.

| Recurring category | Hypothetical quantity/rate | Illustrative annual cost |
|---|---|---:|
| Hosting/database allowance, including operational backups within the chosen package | ₹600/month × 12; not a named provider plan | ₹7,200 |
| Engineering maintenance allowance | 1.5 hours/month × ₹1,000/hour × 12 | ₹18,000 |
| User support allowance | 1 hour/month × ₹500/hour × 12 | ₹6,000 |
| Competent translation review allowance | 2 hours/month × ₹250/hour × 12 | ₹6,000 |
| Access/privacy operations and restore-check allowance | 1 hour/month × ₹400/hour × 12; not a complete legal/security audit | ₹4,800 |
| Recurring subtotal | Sum above | ₹42,000 |
| Hypothetical operating contingency | 10% × ₹42,000 | ₹4,200 |
| **Recurring cost scenario total** | Subtotal + contingency | **₹46,200/year** |

One-time illustrative preparation: configuration 4h × ₹1,000 = ₹4,000; initial staff training 6h × ₹500 = ₹3,000; accessible materials/permission preparation 4h × ₹500 = ₹2,000; baseline/closure facilitation 6h × ₹500 = ₹3,000. **One-time total ₹12,000.** These are role-hours; do not double-count the same hour in recurring support. Independent security/privacy advice, procurement, taxes, travel, connectivity or training overruns are not covered by these placeholders merely because a row exists.

Cost calculations, not family fees:

- Recurring cost per school: `₹46,200/year = ₹3,850/month`.
- Recurring cost per hypothetical enrolled student: `₹46,200 / 200 = ₹231/year = ₹19.25/month`.
- First-year communication-only cost: `₹46,200 + ₹12,000 = ₹58,200/school`; `₹58,200 / 200 = ₹291/student/year = ₹24.25/month`.
- If only 20 students actively use it, the same recurring cost is `₹46,200 / 20 = ₹2,310 per active student/year`, not ₹231. Report the actual denominator; do not equate a Parent account with a student or hide low uptake in a large enrollment figure.

**Illustrative recovery model, not a published price:** a school/sponsor might budget ₹60,000/year plus ₹12,000 one-time setup funding. The hypothetical annual difference `₹60,000 − ₹46,200 = ₹13,800` is a provision for unpriced overhead/reserve—not proven profit. First-year funding would be ₹72,000 against the illustrative ₹58,200 cost. Adequate security/legal work, taxes, payment fees and actual support may consume or exceed that difference. A recurring funding arrangement below the verified total cost needs an explicit, time-limited subsidy and a continuity/exit plan; do not promise indefinite free service.

### Optional channels and hardware — separate, unapproved scenarios

Real SMS/IVR is **not included** in the communication-only figures or implemented provider service. Future annual cost formula: `SMS billable segments × approved segment tariff + IVR billable minutes × approved minute tariff + provider setup/fixed/template/registration fees + taxes`. Obtain actual written terms for language encoding, segment length, failed/retried calls, billing units, delivery reconciliation and cost ceilings; a notice is not necessarily one billable SMS. No tariff, free quota, eligibility/compliance conclusion or provider approval is assumed. Do not substitute fake delivery counts as real billable traffic.

Hardware-only **hypothetical budgeting example**, not specifications or supplier quotes: reader kits ₹6,000; gateway ₹16,000; storage/power protection/enclosure/connectivity equipment ₹8,000; opaque credential materials ₹4,000; competent installation/testing labour ₹6,000: **₹40,000 one-time allowance**. Annual device-maintenance/replacement reserve ₹6,000 plus power/connectivity allowance ₹6,000: **₹12,000 recurring allowance**. No exact board, secure-element, electrical design, UPS adequacy or suitable storage is guaranteed by those allowances; quotes and the Task 32D technical gates may change them substantially.

If combined purely for planning: recurring subtotal `₹42,000 + ₹12,000 = ₹54,000`; illustrative 10% operating contingency `₹5,400`; recurring total `₹59,400`. First-year cash cost `₹59,400 + ₹12,000 preparation + ₹40,000 hardware = ₹1,11,400`, or `₹557 per hypothetical enrolled student/year` for 200 students, **before unquoted provider fees/taxes/security work**. Do not count capital purchases and depreciation twice; depreciation is excluded from this cash worksheet. The communication-only ₹60,000 funding example does not establish adequate funding for this optional service. No purchase or installation is authorized.

Before proposing an actual price, replace every allowance, validate maintenance/support and translation hours, obtain dated quotations, verify procurement/tax requirements with responsible advisers, test willingness to fund without coercion, and publish inclusion/exclusion and exit terms. No revenue, market size, number of customers, return on investment or break-even adoption is claimed measured.

## 7. Competition-ready explanation

**Problem statement:** “An important school message is useful only if a family can find it and understand it. We want to test whether clearer child-specific communication can help.”

**Solution statement:** “Schovera gives Teachers, Parents and Principals their own workspace, preserves original notices, supports reviewed language versions, and keeps acknowledgement separate from understanding. Our offline and telephone parts are labelled simulations.”

**Pilot roadmap in one sentence:** “We propose asking ZP School Lonikand whether it wants a small, voluntary communication-only pilot; permissions, privacy, training and safe operations come first, evaluation comes next, and hardware is a separate later decision.”

**Sustainability in one sentence:** “A school, sponsor or approved shared-support arrangement could fund hosting, competent language review and support; Parents are not assumed to pay, and our example budget is not a supplier quote.”

### Five challenging judge questions

1. **Have you proved attendance improved or dropout fell?** “No. We have local software tests, not school impact results. The attendance panel explains recorded patterns for staff review; it does not predict dropout or contact families.”
2. **What does your RFID demonstration prove?** “A software simulator can retain a queued event, restart and synchronize safely to a local database. It does not prove a physical card read, a child's identity or safety, or a production Pi installation.”
3. **Does it work for a Marathi-speaking Parent without reliable internet?** “The interface and reviewed text can be Marathi. Listening needs a suitable voice, which we still must test audibly on actual devices. During an outage we cannot promise remote updates; paper and staff explanations remain available.”
4. **Who pays, and is that price real?** “We would explore school, NGO/CSR or authorized district funding. Our worksheet is hypothetical and includes support and review effort. Real quotations, permission and measured workload must come before a price or purchase.”
5. **How will you know it helped without invading privacy?** “With permission, we would measure access, acknowledgement, optional ease-of-understanding feedback and staff workload using clear denominators. We would disclose missing responses, protect small groups and report no private family stories. An acknowledgement or fake SMS receipt is not proof of understanding.”

### Two-presenter business-impact segment (about 90 seconds; rehearse)

**Presenter 1:** “Important messages help only when families can find and understand them. Schovera gives families child-specific updates and a way to acknowledge an Important notice. We have local synthetic software tests, not measured school impact.”

**Presenter 2:** “Parents can choose reviewed Hindi or Marathi text and keep the original. Listening requires a suitable device voice; audible testing is still needed. SMS and calls use a fake provider—no real messages or calls are sent.”

**Presenter 1:** “ZP School Lonikand is a proposed location, not an approved partner. We would start with permission, privacy and training, then a small voluntary communication-only pilot. We would measure access, acknowledgement, optional understanding feedback and staff workload.”

**Presenter 2:** “Schools or sponsors, not Parents, could fund the service. Our hypothetical 200-student worksheet gives ₹231 per student per year in recurring cost, before unquoted items. That is a calculation, not a quotation. Actual quotes, support needs and security review come first.”

**Together:** “Our next goal is supervised evidence—not dropout predictions or safety guarantees.”

Keep the fuller technical walkthrough, synthetic labels, cleanup and actual-device voice checklist in the [international demo runbook](36_TASK_32K_PREP_INTERNATIONAL_DEMO.md). No actual audience rehearsal or survey is claimed by this script.

## 8. Readiness and decision register

All real-pilot gates below remain **unconfirmed/not approved in this task**. A documented local pass is necessary evidence, not operational permission.

| Gate | Owner to be appointed | Evidence required before the relevant stage |
|---|---|---|
| School management approval and spending authority | School head/authorized management | Written purpose, cohort, dates, responsibilities, permission limits and manual alternative; no assumed authority/partnership. |
| Family permission and child privacy | School privacy lead and qualified adviser | Clear language notice, voluntary participation/withdrawal, appropriate child information/assent arrangements, purpose limits and no coercion. Verify applicable requirements; this plan is not legal advice or compliance certification. |
| Retention, deletion and incident response | School data owner and operations lead | Approved category-specific schedule, backup treatment, deletion verification, access/export rules and incident contacts; official records separated from optional evaluation logs. |
| Hosted security, operations and release | Technical/security lead with school approval | Current dependency review, production Auth/RLS/configuration/secret checks, backup/restore, HTTPS, monitoring, capacity/support, rollback and explicit migration/deployment approval. Do not expose the local-only ingestion/simulator routes as a shortcut. |
| Supervised user testing | Coordinator and accessible-design facilitator | Consented tasks and feedback, preferred languages, small-cell handling, correction route, manual alternative and stop conditions. No forms have been administered. |
| Staff training and continuity | Principal and support owner | Named competent reviewers, register/acknowledgement distinctions, escalation and funding/exit arrangements; no shared accounts or keys. |
| Actual-device language audio | Bilingual reviewer and facilitator | Audible English/Hindi/Marathi trials, device/voice inventory, meaning/pronunciation and unavailable-state checks using synthetic text; platform privacy review. |
| Real SMS/IVR provider | School data owner, procurement/privacy advisers | Separate channel/purpose consent and verified contact process; approved provider/templates/terms and applicable compliance review; opt-out, authenticated callbacks, idempotency/reconciliation, retry/cost limits and retention. Current fake consent/receipts are insufficient. |
| Hardware procurement/electrical safety | Competent technician and school owner | Exact hardware specifications, quotations, voltage/power/storage/enclosure review and supervised synthetic bench/RF/power-loss tests. No equipment was bought or connected. |
| Reader/gateway provisioning and operations | Security maintainer and trained operator | Unique reader and cloud credentials with separate scopes, secure custody, rotation/revocation, disk-full/restart recovery, clock-quality review and no Supabase service key on hardware. |
| Hardware pilot and incident process | School head and privacy/security lead | All preceding relevant gates, single-entrance supervised scope, non-RFID alternative, reviewed unresolved-record operations and current Task 32D threat-model sign-off. No attendance/identity/safety inference from taps. |

**Local software readiness:** recorded synthetic tests support the specific implemented paths in section 2, subject to a fresh run before a presentation. **Real-school operational readiness: BLOCKED** pending the relevant written approvals and technical acceptance above. **Task 32O documentation package: complete after the documentation checks recorded below.** No next task, outreach, pilot, purchase, survey or production change is authorized by this document.

## 9. Documentation verification record

Task 32O checks are limited to repository/document review, local relative-link and example-arithmetic checks, scope checks and `git diff --check`. Historical Task 31–32N test records were reviewed, not rerun or relabelled as new field evidence. No application build, database operation, environment-file read, dependency installation, vendor search or external/production-service request is required or performed for this docs-only task.

Completed local checks on 2026-10-20:

- Verified the exact starting branch/SHA above and a clean tracked baseline; only the pre-existing protected untracked files were present before this document was created.
- Reviewed the Task 32D threat model, international demo runbook and relevant Task 31–32N implementation/evidence documents; cross-checked acknowledgement fields, translation audit/status behavior, attendance rules, fake-provider boundary and current script names against source. The historical 135-test reference matches the Task 32N record and is not represented as a new run.
- Relative-link validation passed: **22 reference occurrences, 16 unique local targets**; no external link fetching or vendor contact.
- All **11 metric definitions** include definition, source/cadence/reviewer and privacy/limitations. Manual content review checked denominators, missingness, unavailable baseline data, simulation labels and lack of claimed school results.
- Cost arithmetic passed for recurring, setup, per-student, funding-difference and optional hardware scenarios. An initial verification assertion used binary floating-point `1.1` and failed an exact-equality check; the verifier was corrected to whole-rupee `110/100` arithmetic. The document's cost amounts did not need changing.
- Parent/Teacher/Principal future instruments and the explicitly unapproved Marathi draft are present. The student-friendly presenter segment is approximately **167 whitespace-delimited words**, to be rehearsed rather than claimed timed with presenters.
- `git diff --check` and staged-document whitespace/scope checks passed before commit. Only `docs/40_TASK_32O_PILOT_IMPACT_BUSINESS_MODEL.md` is included; no application, package, migration or historical-plan changes.
- Application tests/build, DB checks/migrations and fresh dependency audits were **not run**: this task changes no application/schema/dependency and must not relabel prior tests or access production. No environment file was opened/loaded/copied/modified, no services were started, and no real school/Parent contact or survey occurred.

Protected pre-existing untracked `AGENTS.md`, `CLAUDE.md`, `local-dev.err`, `local-dev.out` and `review/` are preserved. No push, merge, deployment, purchase or production change is part of Task 32O. The final documentation commit is recorded in Git history and the handoff report. Stop after Task 32O for review.
