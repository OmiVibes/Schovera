# Schovera — Aarohi's international demonstration handbook

**School. Home. Together.**

For Aarohi and a second presenter. This guide uses short sentences. Practise together. The planned talk is about 5–7 minutes; it has not been timed with the presenters.

**Always say:** “This is a fictional demonstration school.” Do not show passwords. Do not say that a scan proves a child is safe. Do not say that real SMS messages or calls were sent.

## Part A — Understand the idea

### What is Schovera?

Schovera is our project's name. Our tagline is **School. Home. Together.** It is a website that helps school staff and families share clear information. The name is not an official technical acronym.

### What problem do we want to solve?

A Parent may miss a school message. The message may be hard to find or read. It may use an unfamiliar language. A Teacher may not know whether a family has acknowledged an Important message. We want to make these tasks easier. We have not measured how common these problems are in a real school yet.

### Who uses it?

- **Teacher:** works with assigned classes. Sends updates and homework. Records classroom attendance.
- **Parent or guardian:** sees only linked children's records. Reads notices and can acknowledge Important updates.
- **Principal:** sees their own school's overview. Reviews translations and communication coverage.

Signing in proves which account is being used. It does not prove who is physically holding the computer. Schools still need responsible account management.

### Why languages and voice?

Some families are more comfortable with Hindi or Marathi than English. A reviewed language version can help. Listening may help someone who finds reading difficult. Speech needs a suitable browser/operating-system voice. Text always remains important.

Changing menu language does not translate a Teacher's message. A message translation is a separate draft. A Principal reviews it before it is offered as approved. Our attempted small local translation model changed an important meaning, so we did not enable automatic translation. We prefer honest limits to a misleading AI button.

### What does offline-first mean here?

Our laptop gateway can save a fictional entry event in a durable queue. It can retry after a simulated connection failure. **The whole Parent/Teacher website is not a complete offline app.** Previously displayed information may remain in memory, but fresh sign-in and records need the local/cloud service. Remote families cannot receive cloud updates during a total internet outage.

### What are School Entry Records?

They record check-in/check-out observations. In this demonstration, software creates them. No physical reader is connected. They are separate from classroom attendance. A basic card can be copied, and a recorded scan does not prove identity, presence in class or safety.

### What is attendance follow-up?

It is a clear rule about recorded classroom attendance. For example, staff can inspect repeated recorded absences. Missing records are not counted as absences. Staff must understand the context and decide whether supportive follow-up is needed. There is no dropout prediction, diagnosis, ranking or automatic disciplinary action.

### What is the demo school?

**Schovera Model School — Demo Campus** has 20 fictional students. Grade 7A and Grade 7B each have ten students. Examples include Aarav Deshmukh and Vihaan Shinde. Names are fictional personas, not actual children. Guardian/ward links are fictional too. A visible Demo Environment label reminds us of this.

The example school has homework, timetables, attendance, notices, some acknowledgements, reviewed Hindi/Marathi fixtures and simulated delivery/entry histories. A fixture's approval is evidence of a software workflow, not proof that a language expert reviewed its meaning.

## Part B — Walk through the website

Trainer preparation: follow [START_HERE](../START_HERE.md). The current isolated audit demo uses `http://127.0.0.1:3100`; the trainer must confirm the running address. Get freshly generated credentials privately. Never put them in this public handbook.

Use three separate browser sessions. Example: Teacher in Chrome, Parent in Chrome Incognito and Principal in Edge. Separate tabs normally share one account. Several Incognito windows can share a session too.

### Parent pages — the Parent/guardian uses these

| Section / what it does | Why it helps | What to click and what should appear | A sentence to say |
|---|---|---|---|
| **Home:** a child's summary | Important information is easier to find | Select Aarav. Open Home. Check the child/class and Important update. | “This Parent sees information for the selected linked child.” |
| **Updates:** Teacher messages | Families can find messages in one place | Open Updates. Find Library notebook reminder or the new demonstration notice. | “Teacher messages stay connected to the correct child.” |
| **Student Profile:** an overview | Attendance, communication and schoolwork have context | Open Profile. Check the selected child's heading and sections. | “This page brings the child's school information together.” |
| **Attendance:** recorded class/day statuses | Families can inspect saved attendance | Open Attendance. Look at a date the Teacher recorded. | “These are classroom attendance records, not gate scans.” |
| **Homework:** class assignments | A Parent can see what is due | Open Homework. Read subject, instructions and due date. | “Families can help a child prepare the right schoolwork.” |
| **Timetable:** class periods | The family can check the weekly schedule | Open Timetable. Show today's and weekly periods. Sunday can be empty. | “This is the selected child's class schedule.” |
| **School Notices:** official school messages | School-wide messages are distinct from personal updates | Open School notices. Show a campus announcement. | “This notice is for the school community.” |
| **Translations:** approved text plus original | The family can choose a reviewed version | On a notice, change Reading language to Hindi or Marathi. Use View original. | “The approved translation is separate, and the original is preserved.” |
| **Voice controls:** read visible text aloud | Listening offers another way to access a message | Select the correct notice language. Try Listen, Pause, Resume and Stop. If unavailable, keep the text visible. | “Listening is optional and depends on the voices on this device.” |
| **Acknowledgement:** an explicit account action | Staff can see which Important notice was acknowledged | Choose Acknowledge on the exact update. Reload and check the saved state. | “Acknowledging one notice does not acknowledge every notice.” |
| **Child selector:** changes child context | A guardian may support more than one child | Switch from Aarav to Vihaan. A's personal messages must not remain under B. | “The same guardian can switch between their linked children.” |
| **SMS/IVR preferences:** consent for fake channels | It demonstrates choice and opt-out | Open School notices. Enable a simulated channel and language, then save. | “This is consent for a simulation, not a real telephone service.” |

### Teacher pages — the assigned Teacher uses these

| Section / what it does | Why it helps | What to click and what should appear | A sentence to say |
|---|---|---|---|
| **Home:** classroom task links | A Teacher can choose the next task | Open Overview/Home and select Grade 7A. | “The Teacher starts with their assigned classroom.” |
| **Students:** the assigned roster | Messages go to the right child | Open Students. Show the ten students in 7A, then select Aarav. | “This Teacher does not get an unrestricted school roster.” |
| **Profile:** a student overview | Staff can see useful context | Select a student, then open Profile. Check the name/class. | “The profile combines authorized records for this student.” |
| **Attendance:** class register | Teachers record or correct class attendance | Open Attendance. Select a date. Change a status and save. Re-clicking the active class must not clear the roster. | “The register is saved for this class and date.” |
| **Attendance Insights:** explained patterns | Staff can inspect a reason for supportive review | Read the rule and evidence dates. After a correction, refresh insights. | “This explains recorded patterns; it does not predict a child's future.” |
| **Homework:** create and edit assignments | Instructions and due dates can be corrected | Open Homework. Create an assignment. Use Edit homework on the author's upcoming assignment, then save. | “The author can correct homework, with protection against stale edits.” |
| **Timetable:** weekly schedule | A Teacher knows their class periods | Open Timetable for the selected class. | “The Teacher can read the authorized class timetable.” |
| **Important Notice:** a child-specific update | Staff can request explicit acknowledgement | In Students, write a clear title/message, select Important and send. | “An Important update asks for an acknowledgement, not proof of understanding.” |
| **Correction history:** new corrected communication | Earlier messages are not silently replaced | Use the correction action on a synthetic message. Show original and correction. | “The original stays in the communication history.” |
| **Translation draft:** editable local-language text | Staff can review meaning before publication | Open Manage translations, choose a language, save and submit. | “This is a draft until the Principal approves it.” |
| **AI Studio:** editable teaching drafts | A Teacher can start planning with assistance | Use generic Science/simple-machines inputs. Generate locally and review the result. | “The local AI makes a first draft; a Teacher must check it.” |
| **Spreadsheet desk:** basic browser-local editing | A Teacher can make a small worksheet change | Import a tiny fictional workbook, edit a cell and download a copy. | “This basic editor keeps workbook contents in the browser; it is not full Excel.” |
| **School Notices:** official messages | Staff can read school-wide information | Open School notices. Teacher view is read-only. | “The Principal's official notices are separate from student updates.” |

AI Studio needs the trainer's local model service. An online serverless demo does not automatically have that service. Its live AI is disabled until a compatible backend is separately approved. Never enter student names or private records into AI prompts.

### Principal pages — the Principal uses these

| Section / what it does | Why it helps | What to click and what should appear | A sentence to say |
|---|---|---|---|
| **Home:** the school's overview | The Principal can find school tasks and coverage | Open Overview/Home. Show the fictional school name and relevant counts. | “The Principal's overview is limited to their school.” |
| **Students:** school-authorized profiles | Staff can inspect a student's records | Open Students. Search a fictional name and open the result. | “These are school-authorized student records.” |
| **Communication:** Important-message coverage | Staff can find pending acknowledgements | Open Communication. Compare the exact notice before and after Parent acknowledgement. | “Coverage is based on persisted acknowledgements, not an animated counter.” |
| **Translations:** review before approval | A second responsible role controls publication | Open a submitted draft. Review meaning, then approve for the synthetic workflow. | “The software approval is separate from a human's language-quality check.” |
| **Attendance Insights:** explained school/class patterns | Staff can inspect records before deciding how to help | Open Attendance and examine the relevant class/evidence. | “Staff review the reason; the system does not send automatic punishment or alerts.” |
| **Homework:** school overview | Staff can check assigned work | Open Homework and find the Teacher's assignment. | “The Principal can review homework in their school.” |
| **Timetable:** manage periods | School schedules need a clear owner | Open Timetable. Select class/Teacher; add or edit a period. Conflicts should be rejected. | “The timetable checks invalid or conflicting periods.” |
| **School Notices:** publish official messages | School-wide announcements need an accountable author | Write a short fictional notice and publish it. | “This is an official school-wide message in our fictional campus.” |

### Shared feature: School Entry Records

- **Who:** linked Parent, assigned Teacher and same-school Principal.
- **What:** a read-only list of resolved check-in/check-out observations.
- **Why:** it explores how authorized entry information could be shown.
- **Click:** Home → School Entry Records. Choose dates/type or Refresh records.
- **See:** the correct child's/class's/school's fictional events. Switching to an unrelated scope must not reveal another child's record. Foreground refresh is bounded, not instant.
- **Say:** “These are recorded observations, separate from classroom attendance and safety decisions.”

### Shared feature: SMS/IVR simulator

- **Who:** Parent chooses preferences; authorized Teacher/Principal reviews or queues.
- **What:** fake delivery histories, retries and receipts.
- **Why:** it lets us test a future communication fallback without calling anyone.
- **Click:** Parent preferences, then the Important update's SMS/call simulation controls.
- **See:** SIMULATED labels, eligible recipients and fake status. Try opt-out in testing, not midway through a timed talk.
- **Say:** “No real phone number, SMS provider or call is used in this demonstration.”

### Trainer-only offline gateway demonstration

The trainer uses the isolated local terminal. The two presenters explain what happens; they do not edit secrets.

```powershell
npm run demo:entry -- queue
npm run demo:entry -- offline
npm run demo:entry -- status
npm run demo:entry -- sync
npm run demo:entry -- duplicate
```

These commands must run in the prepared local worktree. First show durable pending data. The fresh status process reopens the queue. Then show local delivery and an idempotent retry. Say: “The simulated outage is between the gateway and destination. This does not mean a remote Parent received a message without internet.” Never revoke a card just before a presentation; revocation intentionally blocks its later normal use.

## Part C — Two-presenter live script

Call the second presenter **Presenter B** until the team chooses a name. The following timings are a practice target, not a measured result. Prepare the three signed-in browser sessions first. Use a short fictional notice; keep sample text ready outside password screenshots. Check the current demo data, voices and local services before the judges arrive.

| Target time | Speaker / screen | Action and words |
|---|---|---|
| 0:00–0:35 | Aarohi / Principal Home | “Hello. We are presenting Schovera: School. Home. Together. We want to make school messages easier for families to find and understand. This is a fictional demonstration school, with 20 students in two classes.” |
| 0:35–1:15 | B / Teacher Students and Attendance | Show 7A's ten students. Save one prepared attendance change. “Teachers work in assigned classes. They record classroom attendance here.” |
| 1:15–1:45 | Aarohi / Insights | Show a prepared pattern and its dates. “This rule explains why staff may review these recorded absences. Missing records are not absences. It is not dropout prediction.” |
| 1:45–2:30 | B / Teacher Students | Send a short Important notice. Open the prepared translation draft and submit. “A Teacher can edit a local-language draft. We currently use human drafts. Our tested small automatic model was not reliable enough.” |
| 2:30–3:10 | Aarohi / Principal Communication | Review the synthetic draft and approve. “The original remains. A Principal controls approval. This demonstrates the workflow; real language quality still needs a fluent reviewer.” |
| 3:10–4:05 | B / Parent Updates | Select the correct child and approved language. Show View original. Try a short Listen only if a matching voice was checked. Acknowledge. “The Parent has a choice of reading and, when available, listening.” |
| 4:05–4:40 | Aarohi / staff coverage, then fake delivery | Show the same notice's acknowledgement and SIMULATED receipt. “Listening or fake delivery is not acknowledgement. Our SMS/call layer is a simulator, not a real telephone service.” |
| 4:40–5:15 | B / Entry panel | Show a fictional check-in and correct role scope. “This is a software-generated observation. We have not connected physical hardware. It is not proof of safety or classroom attendance.” |
| 5:15–6:10 | Trainer terminal; Aarohi explains | Trainer queues an event, injects offline transport, reopens status and syncs. “The queue survives process restart. A repeated delivery returns the original receipt. Remote families cannot get cloud updates during a total outage.” |
| 6:10–6:45 | B / overview or planning slide | “A school pilot needs permission, training, privacy review and a manual fallback. Our business plan is proposed, not measured. We must test costs and usefulness with an authorized school.” |
| 6:45–7:00 | Both | “Our aim is accessible, accountable communication. We have tested local software and clearly labelled simulations. Our next steps are approved language quality, operational security and a consented pilot. Thank you.” |

### Short backup — about two minutes, to rehearse

1. Aarohi: explain the problem, three roles and fictional school.
2. B: show one Important message, approved translation and original.
3. Aarohi: Parent acknowledges; show staff coverage.
4. B: show the entry panel and the words SIMULATED / Demo Environment.
5. Aarohi: “The offline queue is tested local software. The website is not a complete offline app. Hardware and real telephony remain future work.”
6. Both: state the permission-first pilot plan and conclude.

Do not type long paragraphs live. Do not read passwords aloud. Do not pretend a screenshot or recorded clip is a live event. If using backup evidence, label it with its actual date/build and say it is recorded evidence.

## Part D — Questions judges may ask

1. **What makes Schovera different?** Our design priorities are linked-child context, accountable Important messages, reviewed language choices and honest offline/simulation boundaries. We have not proved market uniqueness.
2. **Why Hindi and Marathi?** These are important languages for the families we hope to consult. A real pilot must ask families which language and reading method they prefer.
3. **What if a Parent cannot read comfortably?** Listening may help when a matching voice is available. Staff-assisted and approved alternative communication are still needed. We have not measured family comprehension yet.
4. **What if there is no internet?** The local gateway can queue observations and retry later. Remote web updates need connectivity. The whole Parent website is not fully offline.
5. **How does SMS work?** Here it is fake. We test consent, queueing and simulated outcomes. A real provider needs separate approval, verified numbers, privacy review and cost controls.
6. **What is IVR?** An automated telephone voice interaction. Ours is a simulation; no telephone call is made.
7. **Are you really using AI?** Teacher planning drafts can use an installed local language model on the trainer's laptop. Attendance Insights are clear rules, not an AI prediction model.
8. **Does it automatically translate notices?** Not currently. The tested small model made a serious meaning error and the larger installed model could not run in available memory. We kept editable human drafts and approval instead.
9. **Who approves a translation?** The Principal account approves a submitted version tied to the original source. Real accuracy must still be checked by a fluent responsible reviewer.
10. **Can the original message change silently?** A correction is separate communication. The original stays in history. A stale translation must not silently become the approved text of a new source.
11. **How does attendance analysis work?** It explains patterns in recorded dates, such as repeated recorded absences. It does not invent missing absences or predict a child's future.
12. **Does a scan prove a child is safe?** No. A basic card may be copied. A scan is an observation, not identity proof, classroom attendance or a safeguarding guarantee.
13. **Who can see a child's records?** Linked Parents, assigned Teachers and the school's Principal, under database policies. Anonymous or other-school accounts must not get those records.
14. **What does acknowledgement prove?** That the signed-in account performed that action for that notice. It does not prove reading, understanding, parenting quality or learning.
15. **What happens to duplicate scans or retries?** Transport retries preserve the event ID and return the canonical receipt. Separate physical/simulated taps are separate observations; they are not automatically proof of a second arrival.
16. **What if a credential is revoked before offline sync?** The exact old assignment becomes unresolved. The server must not silently attribute it to the card's next owner.
17. **What has been tested?** Local automated unit, database, browser, authorization, layout and gateway scenarios. The technical report lists exact runs and failures. Real audio must not be claimed unless actually heard.
18. **What is simulated?** Reader events, SMS/IVR delivery, fictional school people and the demonstration outage. Local signed ingestion and SQLite persistence are real software operations on synthetic data.
19. **How much does it cost?** We do not have a validated price. The plan must account for hosting, staff review, support, training and any future hardware/telephony. Planning examples are not supplier quotations or measured school costs.
20. **How could it be financially sustainable?** A proposed school subscription or supported/sponsored pilot could fund maintenance and support. Willingness to pay and operating costs are not validated yet. We do not propose selling child data.
21. **How would a school start?** First approve scope, responsible staff, privacy/consent, retention, training and alternatives. Demonstrate with fictional records before any authorized real-student use.
22. **Have schools adopted it or attendance improved?** No adoption or measured improvement is established by this work. A proposed location is not a confirmed partner.
23. **Why not just use a group chat?** We are exploring child-specific context, role restrictions, review and acknowledgement history. Whether this improves a school's current process needs a pilot, not an assumption.
24. **What is still pending?** Reliable automatic translation, actual voice-device acceptance, full legacy localization, operational hosted acceptance, real telephony, hardware and school permissions.
25. **Can it run online?** The core website architecture can use separate hosted projects, but no Task 32R deployment is authorized or accepted. Laptop Ollama, local ingestion and local fake-provider adapters must not be advertised as hosted services.
26. **What about a shared family device?** Signing out must remove visible personal data. We deliberately avoid an uncontrolled persistent cache of private notices. Families still need safe account/device practices.
27. **What will the next version do?** Only separately approved work: improve language quality and operational security, validate accessibility with families and plan a consented pilot. Hardware is not automatically the next step.

## Part E — Small technical dictionary

| Word | Simple explanation |
|---|---|
| AI | Software that performs tasks associated with intelligent behavior. It can be wrong. |
| LLM | A large language model. It generates text from learned patterns, not guaranteed facts. |
| Translation | Expressing a message's meaning in another language. Changing a menu is not message translation. |
| Text-to-speech | A device voice reads text aloud. It does not prove that a person heard it. |
| Offline | A particular connection is unavailable. Always say which connection. |
| Sync | Sending saved information to another service and recording its result. |
| Database | An organized place for records and rules about access. |
| RFID | Radio-frequency identification. A reader can observe a compatible card; that alone is not strong identity proof. |
| Supabase | The platform used for authentication and the PostgreSQL database. Our tests use an isolated local instance. |
| Next.js | The web framework used to build Schovera's pages and server routes. |
| Attendance Insights | Explained rules applied to recorded class attendance, not a diagnosis or risk score. |
| SMS | A telephone text message. This demo sends none. |
| IVR | Interactive voice response, an automated telephone interaction. This demo makes no calls. |
| Authentication | Checking which account signed in. |
| Authorization | Checking what that account may read or do. |
| Privacy | Protecting information and using it only for an approved purpose. |
| RLS | Row-level security: database rules deciding which records an account can access. |
| Queue | A list of saved work waiting to be processed. |
| Idempotent retry | Repeating the same operation does not create a second result. |
| Synthetic / fictional | Made-up demonstration data, not actual school people or measured outcomes. |

## Part F — Practice and quick recovery

### Rehearsal checklist

- [ ] Both presenters can explain the problem in one short sentence.
- [ ] Both know which role to open next and which browser holds it.
- [ ] Demo Environment is visible; no password or private key is visible.
- [ ] Trainer confirmed local Supabase, website and optional model are running.
- [ ] Fictional 7A/7B rosters each have ten students.
- [ ] A prepared Important notice, reviewed fixtures, pending/acknowledged examples and entry records are available.
- [ ] The exact child and class are checked before each action.
- [ ] Actual laptop volume, output device and voices are checked by a person. If not, say AUDIO NOT VERIFIED.
- [ ] A fluent reviewer checked any translation being presented as accurate. Otherwise call it a workflow fixture.
- [ ] Both can say “simulated” naturally and explain no remote-alert promise during outage.
- [ ] The 5–7 minute version is timed in rehearsal; the two-minute backup is ready.
- [ ] Trainer handles queue commands and cleanup; students do not change secrets or database policy.
- [ ] Nobody claims a real-school partnership, measured benefits, hardware validation or production acceptance without evidence.

### Troubleshooting

| Problem | What to do | What to say |
|---|---|---|
| Internet drops | Ask trainer which link failed. Do not promise fresh remote web records. Demonstrate the local queue only if the required local services still work. | “The gateway retains observations; remote updates wait for connectivity.” |
| A page is slow | Wait once for its honest loading state. Check the role/route. Ask trainer to inspect, rather than repeatedly submit. | “We are checking the connection; repeated clicks should not create duplicate records.” |
| Voice unavailable or silent | Check actual volume/output and matching voice. Use visible text. Do not call a mock test audible proof. | “This device may not have the required voice. The text stays available.” |
| Account logged out | Trainer signs in privately in the correct browser session. Do not read passwords aloud. | “We will restore the demonstration account securely.” |
| SMS/IVR says simulated | This is expected. Do not wait for a real phone notification. | “We test the workflow without calling anyone.” |
| Local gateway unavailable | Show the labelled pre-seeded records and recorded technical evidence. Do not claim a fresh sync. | “These are prepared fictional observations; live queue demonstration is unavailable.” |
| Translation model fails | Use the editable human-reviewed workflow, not an invented automatic output. | “Accuracy matters more than pretending the model worked.” |
| A test genuinely fails | Note exact role/page/action and ask the trainer. Do not hide it or reset production. | “We found a limitation and will investigate it.” |

The technical report is the source for actual test counts, timings, failures and final readiness. This handbook is a practice guide, not proof that the presenters or families have completed these human checks.
