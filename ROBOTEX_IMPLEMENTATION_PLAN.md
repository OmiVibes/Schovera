# Robotex International School Platform — Implementation Plan

**Working repository:** `D:\Om Workspace\EduBridge`  
**Working codename:** EduBridge (public product name should be finalized separately)  
**Primary platform:** Responsive website  
**Future extension:** Mobile app only after the website is stable  
**Target users:** Teacher, Parent, Principal / School Admin  
**Student login:** Not in V1; the student is the subject of the records, not a system operator  
**Competition context:** Robotex International Entrepreneurship, U16 presentation  
**Project standard:** Real, persistent, deployed software — not a mock/demo-only website

---

## 1. Product Strategy

### 1.1 The problem

School communication is fragmented.

Teachers communicate through notebooks, verbal messages, calls, WhatsApp groups, paper notices and different digital tools. Parents often receive incomplete or delayed information. Principals have little visibility into whether important communication actually reached families.

The product should solve one clear problem:

> **Important student and school updates should move from the classroom to the parent quickly, clearly and verifiably — while giving school leadership visibility without creating extra teacher workload.**

### 1.2 Product thesis

The product connects three active users:

**Teacher → Parent → Principal**

- The teacher creates a structured update in seconds.
- The parent receives and acknowledges the update.
- The principal sees school-level communication status and can publish official announcements.

This creates a complete communication loop rather than another generic school ERP.

### 1.3 One-line product definition

> A secure school communication platform that helps teachers update parents instantly and gives principals a clear view of school-to-home communication.

### 1.4 Why this direction

The previous School Connect project already proved that trying to handle attendance, fees, exams, report cards, materials, timetables, feeds, analytics, teacher performance, AI and many other modules turns the product into a broad ERP.

For Robotex, broad is weaker than focused.

The new project must have:
- one memorable problem,
- one obvious value proposition,
- one clean demonstration loop,
- real persistence,
- real role permissions,
- polished design,
- and enough depth to answer technical/business questions.

---

# 2. Users and Responsibilities

## 2.1 Teacher

Teacher is the primary data-entry user.

The teacher must be able to:

1. Sign in.
2. See assigned classes.
3. Open a class.
4. Find/select a student.
5. Send a parent update quickly.
6. Choose a structured category:
   - Academic
   - Attendance
   - Achievement
   - Behaviour
   - Homework / Task
   - General
7. Add a short note.
8. Optionally attach a small approved resource/document.
9. See whether the parent has acknowledged the update.
10. Mark class attendance with a fast interface.
11. View recent communication history for a student.
12. Read principal/school announcements.

### Teacher UX rule

The main communication action must take **no more than 3 meaningful steps after selecting a student**.

If teachers find the product slower than writing a note or sending a message, the product fails.

---

## 2.2 Parent

Parent is the primary value receiver.

The parent must be able to:

1. Sign in securely.
2. See only linked child/children.
3. View a calm child dashboard.
4. See latest teacher updates.
5. Acknowledge an important update.
6. View attendance summary.
7. View a child timeline of teacher updates.
8. Open attached resources where permitted.
9. Read official school announcements.
10. Switch between children if multiple children are linked.

### Parent UX rule

Do not create an overloaded dashboard.

The home page should answer:

- Is there anything I need to know today?
- Is there anything I need to acknowledge?
- What happened recently?
- Is there any official school announcement?

---

## 2.3 Principal / School Admin

Principal is the school-level decision user.

The principal must be able to:

1. Sign in securely.
2. See a school overview.
3. Manage or inspect teacher accounts.
4. Manage classes and students.
5. Manage parent-child links.
6. Publish school announcements.
7. See communication coverage:
   - updates sent,
   - acknowledged,
   - awaiting acknowledgement,
   - classes with no recent activity.
8. Inspect a specific class or teacher communication history where permitted.
9. View attendance completion status.
10. Use simple school-level metrics.

### Principal UX rule

Do NOT build a surveillance-style "teacher score".

The dashboard should answer:

- Are families receiving school communication?
- Are important updates being acknowledged?
- Which classes need follow-up?
- Are teachers using the system?
- What official message needs to reach the school community?

---

# 3. The Core Product Loop

The product should be designed around one complete loop.

## 3.1 Teacher creates update

Teacher selects:

`Class → Student → Update Type → Message → Send`

Example:

**Student:** Aarav Patil  
**Category:** Achievement  
**Message:** "Aarav explained the science activity very well today."  
**Action:** Send to parent

System stores:
- sender,
- school,
- class,
- student,
- linked parent,
- category,
- message,
- timestamp,
- acknowledgement status.

## 3.2 Parent receives update

Parent dashboard shows:

**New update from Ms. Sharma**
> Achievement — Aarav explained the science activity very well today.

Parent taps:

**Acknowledge**

System records:
- parent ID,
- update ID,
- acknowledgement time.

## 3.3 Teacher sees acknowledgement

Teacher sees:

`Acknowledged by parent • 7:42 PM`

## 3.4 Principal sees school-level status

Principal sees a summary such as:

- 26 important updates sent this week
- 21 acknowledged
- 5 awaiting acknowledgement
- 4 active classes today

This is the competition demo loop.

---

# 4. V1 Feature Scope

## 4.1 Must Build

### Shared
- Responsive landing/login
- Real authentication
- Role-aware routing
- Logout/session persistence
- Profile
- School branding
- Error/loading/empty states
- Authorization enforcement
- Real database persistence

### Teacher
- Dashboard
- Assigned classes
- Student list
- Student detail
- Create parent update
- Update history
- Parent acknowledgement status
- Attendance marking
- School announcements

### Parent
- Child dashboard
- Multi-child selector
- Teacher update inbox/timeline
- Acknowledge update
- Attendance summary
- School announcements
- Child basic profile

### Principal
- School dashboard
- Class overview
- Teacher list
- Student list/search
- Parent-link overview
- Announcement publishing
- Communication coverage
- Attendance completion overview
- Recent school activity

---

## 4.2 Build Only If Core Is Already Stable

- Small document/resource attachment
- Parent filters/search
- Class-level announcement targeting
- CSV import for students/teachers
- Basic multilingual UI
- Installable PWA
- Web push notifications
- Exportable communication summary

---

## 4.3 Explicitly Excluded from V1

Do not implement these before the competition core is complete:

- Student login
- Fees/payment
- Exam management
- Full marks/report cards
- Timetable management
- PTM scheduler
- Direct parent-teacher chat
- Social comments
- AI chatbot
- AI prediction
- AI-generated reports
- Teacher ranking
- Best-student AI
- Transport tracking
- Library management
- HR/payroll
- Full LMS
- Video calling
- Mobile native app
- Microservices
- Kafka/Redis/event-bus architecture
- Custom authentication server
- Anything added only to make the stack look advanced

---

# 5. Product Differentiation

The website must not present itself as "another school management system."

The pitch should emphasize three differences:

## 5.1 Structured communication

Important teacher updates are not buried in group chats.

Each update is connected to:
- a student,
- a category,
- a teacher,
- a parent,
- a timestamp,
- and an acknowledgement state.

## 5.2 Closed-loop communication

Most tools answer:

> "Was a message sent?"

This product answers:

> "Was the right parent informed, and did they acknowledge it?"

## 5.3 Leadership visibility without extra paperwork

The principal sees communication coverage using the same data teachers already create.

Teachers do not fill separate monitoring reports.

---

# 6. Technical Architecture

## 6.1 Recommended stack

### Frontend
- Next.js
- TypeScript
- React
- Tailwind CSS
- Accessible component primitives

### Backend/data
- Supabase
  - PostgreSQL
  - Authentication
  - Row Level Security
  - Realtime
  - Storage only if attachments are included

### Validation
- Zod

### Forms
- React Hook Form

### Testing
- Vitest or Jest for unit tests
- Playwright for end-to-end browser testing

### Deployment
- Vercel or equivalent managed frontend hosting
- Supabase managed backend

## 6.2 Why this architecture

This stack provides:
- real authentication,
- real persistent data,
- database constraints,
- role security,
- realtime updates,
- responsive web deployment,
- fewer infrastructure components,
- easy future API use for a mobile app.

Do not reuse the old Flask + MongoDB architecture unless a concrete blocker makes Supabase unsuitable.

The new project should be clean and standalone.

---

# 7. Security Model

Security is mandatory because the platform handles child-related information.

## 7.1 Roles

Use:
- `principal`
- `teacher`
- `parent`

Student is a domain entity, not a login role.

## 7.2 Access rules

### Principal
Can access only their own school.

### Teacher
Can access:
- their own profile,
- assigned classes,
- students in assigned classes,
- updates they are authorized to view/create,
- school announcements.

### Parent
Can access:
- their own profile,
- only children linked to them,
- only updates for those children,
- school announcements allowed for that school/class.

## 7.3 Required controls

- Row Level Security
- Server-side authorization checks where necessary
- No client-only role protection
- Never trust role values submitted by browser
- Never expose service-role credentials to frontend
- Validate all form input
- Restrict file types/sizes
- Audit important actions
- Do not store unnecessary child data
- Do not display another child through predictable URL manipulation

---

# 8. Database Model

Keep the schema understandable enough for the Grade 7 presenter to explain conceptually.

## 8.1 Core tables

### schools
- id
- name
- code
- logo_url
- created_at

### profiles
- id
- school_id
- auth_user_id
- role
- full_name
- email
- active
- created_at

### classes
- id
- school_id
- grade
- division
- academic_year

### teacher_class_assignments
- id
- teacher_id
- class_id

### students
- id
- school_id
- class_id
- roll_number
- full_name
- active

### parent_student_links
- id
- parent_id
- student_id
- status
- created_at

### student_updates
- id
- school_id
- student_id
- teacher_id
- category
- title
- message
- importance
- resource_url nullable
- created_at

### acknowledgements
- id
- update_id
- parent_id
- acknowledged_at

### attendance_records
- id
- school_id
- student_id
- class_id
- marked_by
- attendance_date
- status
- created_at

### announcements
- id
- school_id
- created_by
- title
- body
- importance
- audience_type
- class_id nullable
- published_at

### audit_events
- id
- school_id
- actor_id
- event_type
- target_type
- target_id
- created_at

---

# 9. Website Information Architecture

## 9.1 Public

- `/`
- `/login`
- `/about`
- `/privacy`

The landing page should be short and product-focused, not a huge marketing site.

---

## 9.2 Teacher

- `/teacher`
- `/teacher/classes`
- `/teacher/classes/[classId]`
- `/teacher/students/[studentId]`
- `/teacher/students/[studentId]/new-update`
- `/teacher/attendance`
- `/teacher/updates`
- `/teacher/announcements`
- `/teacher/profile`

### Teacher dashboard priority

1. Today
2. Quick parent update
3. Assigned classes
4. Updates awaiting acknowledgement
5. Recent school announcements

---

## 9.3 Parent

- `/parent`
- `/parent/children/[studentId]`
- `/parent/updates`
- `/parent/attendance`
- `/parent/announcements`
- `/parent/profile`

### Parent dashboard priority

1. Unread / important updates
2. Acknowledgement required
3. Child snapshot
4. Recent timeline
5. Attendance
6. School announcements

---

## 9.4 Principal

- `/principal`
- `/principal/classes`
- `/principal/teachers`
- `/principal/students`
- `/principal/parents`
- `/principal/communication`
- `/principal/attendance`
- `/principal/announcements`
- `/principal/settings`
- `/principal/profile`

### Principal dashboard priority

1. Communication coverage
2. Important updates awaiting acknowledgement
3. Class activity
4. Attendance completion
5. Latest school announcements
6. Setup/admin shortcuts

---

# 10. UI/UX Direction

The old project became visually dense in places. The new website should be calmer.

## 10.1 Design principles

- Modern but not flashy
- School-safe, trustworthy visual language
- Strong information hierarchy
- Large readable typography
- Clear action buttons
- Minimal dashboard clutter
- Useful icons only
- No excessive glassmorphism
- No random gradients on every card
- No meaningless animations
- No giant statistics without purpose
- No dead/coming-soon buttons in competition build

## 10.2 Responsive behavior

The same website must look intentional on:
- laptop/desktop,
- tablet,
- mobile browser.

Principal experience can be desktop-first.
Parent experience must be mobile-first.
Teacher experience must work well on both.

## 10.3 Animation

Use restrained motion:
- route transition,
- card appearance,
- success state,
- acknowledgement state.

Never let animation slow down the competition flow.

---

# 11. Realtime Behaviour

The product should feel live.

For the competition flow:

1. Teacher sends update.
2. Parent browser receives it without manual refresh.
3. Parent acknowledges it.
4. Teacher/principal view updates without manual refresh.

Use Supabase Realtime or an equivalent simple realtime mechanism.

This provides a genuine "wow" moment while remaining technically understandable:

> "When the database receives a new update, connected users receive the change immediately."

Do not call this AI.

---

# 12. Demo Data

Use realistic fictional data.

Example school:
**Greenfield International School**

Roles:
- Principal: Dr. Meera Sharma
- Teacher: Ananya Joshi
- Parent: Rajesh Patil
- Student: Aarav Patil — Grade 7A

Seed:
- 2–3 classes
- 3 teachers
- 12–20 students
- 5 parents
- a few attendance records
- 6–10 teacher updates
- 3 school announcements

Do not put "Demo User" everywhere in the real UI.

Create a developer-only seed/reset script.

---

# 13. Implementation Roadmap

## Phase 1 — Repository Foundation

Create:
- Next.js TypeScript project
- linting
- formatting
- environment template
- route structure
- shared layout
- initial design tokens
- project documentation

### Acceptance
- project installs cleanly,
- builds with zero errors,
- lint passes,
- no placeholder feature code.

---

## Phase 2 — Database + Authentication

Implement:
- Supabase project wiring
- migrations
- tables
- indexes
- constraints
- seed data
- auth
- profiles
- role routing
- protected routes
- RLS policies

### Acceptance
- principal cannot open teacher/parent data outside permissions,
- parent cannot inspect another student,
- teacher cannot access unassigned classes,
- session persists after reload.

---

## Phase 3 — Teacher Core

Implement:
- teacher dashboard
- class cards
- class roster
- student page
- create update
- update history
- acknowledgement state

### Acceptance
Teacher can complete:

`Login → Class → Student → Send Update`

with no broken page and persisted data.

---

## Phase 4 — Parent Core

Implement:
- parent dashboard
- child selector
- update inbox/timeline
- update detail
- acknowledgement
- realtime incoming update

### Acceptance
Teacher sends an update and linked parent receives it live.

Parent acknowledges it and state is persisted.

---

## Phase 5 — Principal Core

Implement:
- principal dashboard
- teachers/classes/students overview
- communication coverage
- pending acknowledgement summary
- announcement creation
- class activity overview

### Acceptance
Principal can see aggregate communication state without accessing another school's data.

---

## Phase 6 — Attendance

Implement:
- teacher class attendance
- Present / Absent / Late
- date guard
- save/update
- parent attendance summary
- principal class completion overview

### Acceptance
Teacher can mark a class quickly and parent sees only their child's history.

---

## Phase 7 — Announcements

Implement:
- principal creates announcement
- school-wide or selected class audience
- normal/important/urgent level
- teacher/parent view
- realtime refresh if practical

### Acceptance
Only authorized principal can create/edit announcements.

---

## Phase 8 — Product Polish

Complete:
- loading states
- empty states
- errors
- confirmation states
- mobile responsiveness
- accessibility
- keyboard navigation
- form validation
- realistic timestamps
- consistent copy
- profile menu
- school logo
- favicon
- metadata
- no placeholder text

---

## Phase 9 — Testing

### Unit/integration
Test:
- validation
- permission helpers
- acknowledgement state
- attendance rules
- update category logic

### E2E
Automate:
1. Teacher login
2. Teacher sends update
3. Parent login
4. Parent sees update
5. Parent acknowledges
6. Teacher sees acknowledgement
7. Principal sees communication summary
8. Teacher marks attendance
9. Parent sees attendance
10. Principal posts announcement
11. Parent sees announcement

### Security tests
- parent tries another student's URL
- teacher tries unassigned class
- cross-school IDs
- unauthenticated protected page
- principal from School A tries School B data

---

# 14. Competition Reliability Plan

Presentation-day reliability matters more than another feature.

Before competition:

- production deployment must be tested
- test on presentation laptop
- test on mobile hotspot
- keep login credentials documented offline
- prepare a seeded school state
- prepare reset script
- verify database permissions
- verify realtime
- disable development/debug UI
- remove unfinished navigation
- no console errors
- no network calls to unnecessary services
- no dependency on AI APIs

Have an emergency backup:
- short screen recording of the full working flow,
- screenshots of each critical page,
- but demonstrate the live product first.

---

# 15. 90-Second Live Demo Script

### 0–15 sec — Problem
"Parents often receive school information late or through scattered messages. Our platform creates one trusted communication loop."

### 15–35 sec — Teacher
Teacher logs in, opens Grade 7A, selects Aarav and sends an Achievement update.

### 35–55 sec — Parent
Parent dashboard receives the update live and acknowledges it.

### 55–70 sec — Teacher
Teacher sees that the parent acknowledged the update.

### 70–90 sec — Principal
Principal dashboard shows school communication coverage and publishes/points to an official announcement.

End line:

> "The teacher communicates, the parent stays informed, and the principal knows the connection is working."

---

# 16. Business Model

## Customer
School / school management.

## Users
Teachers, parents and principals.

## Model
- free or assisted pilot for one school,
- annual school subscription after pilot,
- pricing eventually based on school size / active students,
- parents do not pay for basic access.

Do not invent revenue numbers for the pitch.

The strongest business claim is:

> Schools pay for a structured, accountable communication system that reduces fragmented school-to-home communication.

---

# 17. Evidence We Should Collect Before Final Pitch

The website alone will not win an Entrepreneurship competition.

Collect real evidence.

Minimum:

### Teacher interviews
Ask 3–5 teachers:
- How do you currently update parents?
- What takes the most time?
- What messages are frequently missed?
- Would acknowledgement status help?
- How fast must the workflow be?

### Parent interviews
Ask 3–5 parents:
- Where do you receive school updates?
- Which updates get missed?
- Would one child timeline be useful?
- Would you acknowledge important teacher updates?

### Principal interview
Ask at least 1 principal/admin:
- How do you know whether communication reached parents?
- What school-wide communication problem matters most?
- What information should a principal see without monitoring every teacher manually?

Record only consented, non-sensitive summary findings.

Use results to refine the pitch.

---

# 18. Metrics for a Real Pilot

Do not claim fake impact.

If the product is piloted, measure:

- teacher update creation time
- update acknowledgement rate
- median acknowledgement time
- active teachers
- active parents
- number of missed/unacknowledged important updates
- teacher feedback
- parent feedback

A real result such as:

"8 of 10 important updates were acknowledged within one day"

is more credible than fabricated percentage claims.

---

# 19. Grade 7 Explainability Rule

Every major feature must pass this question:

> Can the student explain what goes in, what happens, what comes out, and why it matters?

Example:

### Realtime updates
Input: Teacher sends message.  
Process: Website saves it in the online database and connected parent screen receives the change.  
Output: Parent sees the update.  
Value: Parent knows immediately.

### Role security
Input: User signs in.  
Process: System checks whether the person is a teacher, parent or principal.  
Output: They see only the information allowed for their role.  
Value: Student information stays private.

If a feature cannot be explained at this level, simplify it.

---

# 20. What to Reuse From the Old School Connect

Reuse ideas, not architecture blindly.

### Keep
- single login with role routing
- role-specific interfaces
- parent-child linking
- teacher-first workflow speed
- class/student organization
- parent dashboard concept
- school announcements/feed concept
- persistent sessions
- validation mindset
- multi-child parent design
- strong school data isolation
- realistic seed data
- responsive admin thinking
- multilingual roadmap

### Do not copy blindly
- Flask/MongoDB architecture
- legacy deepfake history
- giant module grids
- broad ERP scope
- fee system
- exam/report-card system
- AI features
- teacher scoring
- rule chatbot
- complex internal telemetry
- React Native constraints
- old native package workarounds

---

# 21. Codex Engineering Rules

Codex must follow these rules during implementation:

1. Read `PROJECT_MASTER_PLAN.md` and this file before every major phase.
2. Do not expand scope without approval.
3. Do not silently add mock/fake features.
4. No dead buttons.
5. No placeholder analytics.
6. No fake AI.
7. Keep commits small and phase-based.
8. Run build/lint/tests after each phase.
9. Update implementation status documentation after each phase.
10. Maintain migrations in source control.
11. Never expose secrets.
12. Enforce access in the database/server, not just UI.
13. Keep seeded demo data clearly fictional.
14. Preserve a reliable competition seed/reset path.
15. Stop and report blockers rather than hiding them.
16. Do not start mobile-app work before web sign-off.
17. Do not import old School Connect code unless there is an explicit reviewed reason.
18. Prefer understandable code over clever abstractions.
19. Remove unused code before final release.
20. All critical competition flows must have E2E tests.

---

# 22. Definition of Competition-Ready

The product is competition-ready only when all are true:

- real authentication works
- real persistence works
- role permissions are verified
- teacher → parent update works
- parent acknowledgement works
- teacher acknowledgement status works
- principal communication overview works
- attendance works
- principal announcement works
- responsive on presentation laptop/mobile
- seeded data is polished
- all critical E2E tests pass
- production build passes
- no dead controls
- no visible development errors
- live deployment works
- backup presentation assets exist
- Grade 7 student can explain every major flow
- 3-minute pitch has been rehearsed
- judge Q&A has been rehearsed
- business model is understandable
- no fake adoption/revenue/impact claims

---

# 23. Immediate Next Step

Do **not** begin random UI development.

Next engineering task:

1. Freeze the public product name.
2. Update `PROJECT_MASTER_PLAN.md` so active users are:
   - Teacher
   - Parent
   - Principal/Admin
   and remove Student login from V1.
3. Create the database/RLS specification.
4. Create screen-by-screen wireframe specification.
5. Create competition acceptance-test checklist.
6. Only then scaffold the Next.js application.

The first implementation milestone should prove one vertical slice:

> **Teacher sends a real persisted update → linked parent receives it → parent acknowledges it → teacher sees acknowledgement.**

Once that works end-to-end, expand to principal visibility, attendance and announcements.
