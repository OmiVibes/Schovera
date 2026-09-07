# Core User Flows

## Teacher sends an update

1. Teacher signs in and sees only assigned classes.
2. Teacher opens a class, selects an active student, chooses category/importance, and writes title/message.
3. System validates assignment and persists the sent update with server-derived teacher/school identity.
4. Teacher sees successful send and acknowledgement state.

## Parent receives and acknowledges

1. Parent signs in and sees only active linked child/children.
2. A new authorized update appears live in the child timeline.
3. Parent reads it and presses Acknowledge.
4. System persists one acknowledgement for that parent/update; the UI confirms it.

## Principal sees coverage

1. Principal signs in and sees only own-school aggregate coverage.
2. The dashboard derives sent, acknowledged, awaiting, and no-recent-class activity from stored rows.
3. Principal can inspect an own-school class summary without a teacher score or cross-school access.

## Rules

- Student has no V1 account or acknowledgement action.
- Teachers only act for assigned classes/students.
- Parents only see explicitly linked children.
- Principal access remains within own school.
- Acknowledgement is a communication receipt, not a learning/completion claim.
