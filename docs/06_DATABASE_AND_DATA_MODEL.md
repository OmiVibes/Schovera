# Database and Data Model

## Model philosophy

Use a small relational model because users and permissions are related: a parent is linked to a student, a teacher is assigned to a class, and an update belongs to one class. Avoid storing whole application objects as unstructured blobs.

## Core tables

| Table | Key fields | Purpose |
|---|---|---|
| `profiles` | `id`, `school_id`, `role`, `display_name` | Extends auth account with role and school membership. |
| `schools` | `id`, `name`, `timezone` | Separates future school tenants. |
| `classes` | `id`, `school_id`, `name`, `academic_year` | A teacher’s teaching group. |
| `teacher_classes` | `teacher_id`, `class_id` | Controls publishing permission. |
| `student_classes` | `student_id`, `class_id` | Controls student visibility. |
| `parent_students` | `parent_id`, `student_id` | Controls parent visibility. |
| `learning_updates` | `id`, `class_id`, `author_id`, `subject`, `title`, `summary`, `task`, `due_at`, `resource_url`, `status`, timestamps | The central product record. |
| `acknowledgements` | `id`, `update_id`, `actor_id`, `actor_role`, `acknowledged_at` | Records that a particular student or parent saw an update. |

## Rules and constraints

- A profile belongs to exactly one school for MVP.
- An update belongs to one class and one teacher author.
- `status` is `draft` or `published`; only published updates appear outside the teacher/coordinator view.
- At most one acknowledgement per `update_id + actor_id`.
- Parent/student/teacher links must be same-school.
- Timestamps are stored in UTC and formatted in the school timezone.
- Store file metadata/approved URL only; do not store binary files in PostgreSQL rows.

## Access policy summary

| Actor | May read | May write |
|---|---|---|
| Teacher | Their assigned-class updates and their acknowledgement summaries | Their own drafts/published updates; no acknowledgements for others |
| Student | Published updates for their enrolled class | Their own acknowledgement |
| Parent | Published updates for linked child’s classes | Their own acknowledgement |
| Coordinator | School setup data in a limited onboarding area | Setup only, not a broad ERP dashboard |

## Example output

Input: teacher selects “Grade 7A,” Science, a task and Friday deadline. Process: the app creates one published `learning_updates` row linked to Grade 7A. Output: Grade 7A students and their linked parents see that record; their acknowledgements create separate `acknowledgements` rows; the teacher sees counts derived from those rows.

## Data minimisation

Use only name, role, school/class link, and sign-in information initially. Do not store marks, attendance, medical information, address, telephone number, behaviour notes, or payment data in MVP.
