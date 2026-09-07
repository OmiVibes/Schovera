# Seed Data Specification

## Purpose and safeguards

Create a polished but entirely fictional international-presentation dataset. All people, email addresses, school identity, messages, and records are invented. Seed/reset runs only in development/demo environment and is never exposed as a principal UI action.

## School and accounts

**Greenfield International School**, code `GREENFIELD-DEMO`, timezone `Asia/Kolkata`.

| Role | Name | Email | Notes |
|---|---|---|---|
| Principal | Dr. Meera Sharma | meera.principal@greenfield-demo.test | School A principal |
| Teacher | Ms. Ananya Joshi | ananya.teacher@greenfield-demo.test | Assigned Grade 7A Science/General class context |
| Teacher | Mr. Karan Mehta | karan.teacher@greenfield-demo.test | Assigned Grade 7B; proves teacher isolation |
| Parent A | Rajesh Patil | rajesh.parent@greenfield-demo.test | Linked to Aarav only |
| Parent B | Priya Kulkarni | priya.parent@greenfield-demo.test | Linked to Siya only; security test account |
| Parent multi-child | Nisha Verma | nisha.parent@greenfield-demo.test | Linked to two fictional children; selector test |
| Principal B | Alex Morgan | alex.principal@riverside-demo.test | Separate School B cross-tenant test account |

Passwords are set through secure local/demo provisioning and documented offline, never in screenshots or committed data files.

## School data

- Classes: Grade 7A and Grade 7B, academic year 2026–27; optionally Grade 6A for multi-child selector.
- Grade 7A: 8–10 fictional students including **Aarav Patil** (primary demo) and **Siya Kulkarni**.
- Grade 7B: 5–8 fictional students, assigned only to Mr. Mehta.
- Each primary-demo student has exactly one relevant active parent link; Nisha Verma has two child links.
- Riverside Demo School has one principal/class/student/parent to test School A isolation. It never appears in normal demo navigation.

## Seeded communication states

Create 6–10 sent `student_updates` over realistic recent dates:

- Aarav: two historical updates, one acknowledged, one awaiting acknowledgement; one is the demo target created live/reset afterward.
- Siya: Achievement update acknowledged by Parent B.
- At least one Academic, Attendance, Achievement, Behaviour, Homework/Task, and General category across dataset.
- At least one Important and several Normal updates.
- Grade 7A has recent activity; Grade 7B has no recent activity in chosen principal period to make a truthful follow-up indicator.
- Acknowledgement timestamps occur after sent timestamps.

Attendance records and announcements may be seeded only for later deferred-module visual development; they are absent from the primary 90-second demo and cannot be claimed functional before implementation/testing.

## Reset contract

Reset must delete/recreate only demo-tenant transactional rows (`acknowledgements`, demo updates, audit events) in dependency-safe order and restore the fixed accounts/classes/students/links. It must never run against a real school database. A post-reset assertion checks expected baseline counts and no live-demo target update remains.
