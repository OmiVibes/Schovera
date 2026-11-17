# Judge questions — simple, truthful answers

Preparation sheet, 17 November 2026. These are proposed answers, not claims of customers, fluent-language acceptance or installed hardware. Use the feature-status sheet and completion report for executed evidence.

1. **What problem are you solving?** Schools need a clear record of notices, parent acknowledgements and teacher-confirmed attendance. We want fewer missed messages and less confusion. We have not yet validated demand through a school pilot.
2. **Who uses it?** Teachers record work, parents see their linked children, and principals oversee their school.
3. **Who pays?** Our proposed buyer is the school, through an annual subscription. Parents would not pay separately in this proposal.
4. **What is your price?** One example is US$3 per student per year. This is a planning assumption, not a market-tested offer.
5. **Can a school pay one fixed price?** Yes, we propose comparing a per-student plan with a school plan. We have not selected final commercial terms.
6. **What do setup and training cost?** Our hypothetical examples use $100 or $250, charged separately. Actual effort and willingness to pay still need testing.
7. **Is revenue the same as profit?** No. Revenue is what the school pays. Hosting, support and other costs come out of it.
8. **How much do you expect to earn?** In our assumed 200-student example, $600 revenue minus $537 operating costs leaves $63 before excluded costs and tax. That is not proven net profit.
9. **Why show dollars and rupees?** Judges may compare internationally. We use an illustrative ₹85 per dollar, not a live exchange rate.
10. **Do you already have customers?** We are not claiming paying customers, sales or survey results. The next step is supervised validation with schools.
11. **What about competitors?** ClassDojo, ParentSquare and MyClassboard already offer school communication features. Our comparison is preliminary and sourced; we do not claim to be the first multilingual platform.
12. **Why not just use WhatsApp?** Schools may prefer linked-child access, structured attendance revisions and school-level reporting together. Whether that is worth paying for needs real customer research.
13. **What makes this project different?** We are demonstrating a specific workflow: original messages, separate reviewed translations, parent acknowledgements, and gate evidence kept separate from teacher-confirmed attendance. It is not a claim that competitors cannot do these things.
14. **Why use both RFID and a teacher?** A gate observation and a classroom decision answer different questions. Only an authorized teacher confirms the classroom register.
15. **Does a card scan prove a child is safe?** No. It is only evidence that the system received a signed reader event. It does not prove who carried the card or that the child reached class safely.
16. **What is real in this demonstration?** The website, database writes, signed synthetic events, durable SQLite queue and authorized replay are real software operations. The reader input is simulated.
17. **Has the Raspberry Pi been tested?** No. The power supply, compatible reader, physical driver and hardware acceptance remain pending.
18. **What happens if a child forgets a card?** The teacher can still take manual attendance. A missing gate event does not automatically mark a child absent.
19. **What happens if a card is lost or revoked?** The software checks current binding and revocation rules. An unresolved event is not silently assigned to a child. School replacement procedures and hardware tests still need review.
20. **Can someone copy a card?** Signed events protect the software transport, not the physical card from cloning. Card technology and physical security have not been certified.
21. **How do you avoid duplicate scans?** A retry of the same immutable event has the same identity and is delivered once. A separate scan is a separate observation; it must not be erased just because it looks similar.
22. **What is SQLite doing?** It saves pending operations on the local school service before confirming local capture. A process restart can recover that saved queue.
23. **What is Supabase doing?** It provides the local PostgreSQL destination and authentication in this tested setup. A destination receipt confirms that a replay committed.
24. **What happens when the internet fails?** The supported local service must still be reachable. Previously authorized work can wait on disk and replay with fresh authorization. We are not promising full browser-only offline operation.
25. **Does your outage button disconnect Wi-Fi?** No. It simulates the relevant transport failure while the local database stays available for independent checks.
26. **Can work replay after the teacher logs out?** Teacher operations wait for the correct active teacher session. We do not store a password to replay as that person unattended.
27. **What if two teachers change attendance?** Revision checks reject stale changes. Finalized corrections require a reason and leave an audit history.
28. **What is held work?** It is retained work that cannot safely apply, such as an old attendance revision. The authorized teacher reviews it and either makes a new justified operation or closes it without applying it.
29. **Are Present defaults confirmed?** No. Draft or unsaved defaults are not published as teacher-confirmed attendance to parents.
30. **Can parents see other children?** Server-side role and school rules limit a parent to linked children. Our synthetic denial tests check unrelated access; that is not a complete production security certificate.
31. **Where are passwords and keys?** Authentication and privileged operations are separate from public UI code. Local private files stay out of Git and the presentation pack. Production secret management still needs deployment review.
32. **Must the principal approve every message?** No. The teacher's original can reach the parent directly. A reviewed translation is a separate version with its own approval rules.
33. **Which interface languages are available?** English, Hindi and Marathi. Korean is supported in the existing message translation and speech features, not as a complete interface.
34. **Is every translation correct?** We cannot promise that. Automatic output is labelled separately, and fluent human review is still required. An original stays available.
35. **Have you tested the sound?** We test matching voices and actual playback controls or audio progress. A person must still check the presentation speakers and pronunciation.
36. **Does AI decide attendance?** No. Optional local Ollama creates editable teaching drafts. A teacher must review educational accuracy; AI does not confirm classroom presence.
37. **What technology do you use?** Next.js and React for the website, PostgreSQL/Supabase for authorized records, Node.js and SQLite for local durable queues, and optional laptop-local Ollama.
38. **Can it support every school size today?** We have tested specific synthetic boundaries, including counts above 1,000. That is not proof of unlimited scale or hosted load capacity.
39. **Can it send SMS or phone calls?** Real SMS and calls are not implemented or enabled. Simulated receipts are not actual delivery.
40. **What is next?** Rehearse, review language and audio, test compatible hardware safely, then design a supervised pilot with consent, privacy, backups and operating procedures. Public hosting is a separate acceptance task.
41. **What remains unfinished in software?** Excused attendance policy is deferred. Public hosting and operating procedures need separate review. Dependency findings change over time; use the M6 report's dated audit results rather than repeating the historical M5 findings as current.
42. **What if the live demonstration fails?** I will explain the failure honestly and show the dated fictional screenshots as recorded evidence, not pretend they are live.
