# Screen Specification

## Shared screens

### Login

- **Purpose:** authenticate teacher, parent, or principal and route by server-stored role.
- **Data required:** email/identifier and password; session result/profile role.
- **Primary/secondary actions:** Sign in / password-support link and sign out from profile.
- **Empty/loading/error:** no account details displayed; disabled button with “Signing in”; generic invalid-credentials/error message without account enumeration.
- **Mobile/desktop:** single-column card on mobile; centred, calm panel on desktop.
- **Permissions:** public only; redirect authenticated user to their allowed home.

### Profile/session

- **Purpose:** display own name, role, school, and logout.
- **Data required:** own profile/school.
- **Primary/secondary actions:** Sign out / return to dashboard.
- **Empty/loading/error:** profile-unavailable support message; skeleton; retry/session-expired sign-in.
- **Mobile/desktop:** simple full-width mobile card; compact account menu/page on desktop.
- **Permissions:** own profile only.

## Teacher screens

### Teacher dashboard

- **Purpose:** fastest route to an assigned class, student, recent updates, and acknowledgement state.
- **Data required:** own assignments, recent authored sent updates, school announcements only after deferred module approval.
- **Primary/secondary actions:** Open class / view update history, profile.
- **Empty/loading/error:** “No class assigned—contact school admin”; skeleton cards; retry without losing session.
- **Mobile/desktop:** one-column action-first list; desktop two-column recent-status layout.
- **Permissions:** authenticated teacher; own assigned data only.

### Class roster

- **Purpose:** select a student in one assigned class.
- **Data required:** authorized class and active students, sorted by name/roll number.
- **Primary/secondary actions:** Select student / search/filter local authorized roster, back.
- **Empty/loading/error:** “No active students in this class”; skeleton rows; permission-safe unavailable screen.
- **Mobile/desktop:** searchable list with large tap rows; desktop table/list with persistent class context.
- **Permissions:** teacher assignment for class required.

### Student communication detail

- **Purpose:** show one authorized student’s update history and acknowledgement state.
- **Data required:** student basic name/class and teacher-authorized update list/acknowledgement status.
- **Primary/secondary actions:** Create update / open a prior update, return to roster.
- **Empty/loading/error:** “No updates sent yet”; timeline skeleton; retry/error without private detail leakage.
- **Mobile/desktop:** vertical timeline; desktop side panel for student summary and action.
- **Permissions:** teacher must be assigned to student’s class.

### Create/send student update

- **Purpose:** send a structured parent update in no more than three meaningful steps after student selection.
- **Data required:** selected authorized student/class; category, title, message, importance; resource remains deferred.
- **Primary/secondary actions:** Send update / save draft only if later approved, cancel.
- **Empty/loading/error:** unavailable if student context missing; submit spinner/double-submit guard; field-level errors and retry preserving draft text.
- **Mobile/desktop:** single-column labelled form; desktop constrained readable width with update preview.
- **Permissions:** assigned teacher only; server derives author and validates student/class.

### Teacher update status

- **Purpose:** show whether each linked parent has acknowledged a teacher’s update.
- **Data required:** authorized update, acknowledgement records, only minimal parent display labels approved for teacher view.
- **Primary/secondary actions:** Return to student history / filter own recent updates.
- **Empty/loading/error:** “Awaiting acknowledgement” is a valid state; loading skeleton; retry state.
- **Mobile/desktop:** stacked status cards; desktop timeline/table.
- **Permissions:** author/assigned teacher only; no access to unrelated parent information.

## Parent screens

### Parent dashboard

- **Purpose:** answer “What do I need to know or acknowledge for my child today?”
- **Data required:** active parent-child links, latest sent updates, acknowledgement state.
- **Primary/secondary actions:** Open important/latest update; switch child / view full timeline, profile.
- **Empty/loading/error:** “No updates right now”; skeleton cards; retry with no child details from another family.
- **Mobile/desktop:** mobile-first priority cards and child selector; desktop timeline plus child panel.
- **Permissions:** active linked children only.

### Child update timeline/detail

- **Purpose:** read a selected linked child’s teacher updates and acknowledge an important update.
- **Data required:** authorized child, sent update, teacher display name/category/time, acknowledgement state.
- **Primary/secondary actions:** Acknowledge / return, switch child.
- **Empty/loading/error:** “No teacher updates yet”; detail skeleton; acknowledgement failure retry, no duplicate result.
- **Mobile/desktop:** readable single-column detail; desktop list/detail split if useful.
- **Permissions:** active parent-student link required; parent can only create own acknowledgement.

### Child selector

- **Purpose:** switch among a parent’s linked children without mixing their data.
- **Data required:** parent’s active linked student names/classes only.
- **Primary/secondary actions:** Select child / return to current dashboard.
- **Empty/loading/error:** “No child link is active—contact school”; skeleton; safe error.
- **Mobile/desktop:** bottom sheet/select on mobile; compact switcher/sidebar on desktop.
- **Permissions:** own active links only.

## Principal screens

### Principal dashboard / communication coverage

- **Purpose:** show whether school-to-home communication is occurring without surveillance-style teacher scoring.
- **Data required:** own-school derived sent, acknowledged, awaiting, active-class/no-recent-update totals for chosen period.
- **Primary/secondary actions:** Open class communication summary / change date range or view school setup after authorization.
- **Empty/loading/error:** “No sent updates in this period”; metric skeleton; retry with no cross-school totals.
- **Mobile/desktop:** mobile summary cards then class list; desktop overview grid and class table.
- **Permissions:** principal in own school only; aggregate is derived from authorized rows.

### Principal class communication detail

- **Purpose:** inspect a class’s communication activity for follow-up, not rank teachers.
- **Data required:** own-school class, aggregate/update timestamps, approved minimal teacher/student references.
- **Primary/secondary actions:** Return to coverage / select another own-school class.
- **Empty/loading/error:** “No communication activity for period”; skeleton; safe retry.
- **Mobile/desktop:** chronological list; desktop filters/sidebar.
- **Permissions:** principal’s stored school must match class; no edit in first slice.

### Announcement management — deferred

- **Purpose:** principal creates official school/class announcement after core loop approval.
- **Data required:** own-school classes, announcement fields/audience.
- **Primary/secondary actions:** Publish / save draft, archive.
- **Empty/loading/error:** “No announcements”; loading skeleton; preserved form error.
- **Mobile/desktop:** simplified form/list mobile; split list/editor desktop.
- **Permissions:** principal in own school only. This screen is intentionally not implemented in the first vertical slice.
