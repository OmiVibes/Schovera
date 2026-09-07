# Existing Project Audit: `school-connect-app`

## What was inspected

The repository was recursively inventoried excluding generated dependencies/build files. I read the root README and project/context/hardening documents, package manifests, Flask bootstrap/settings/authentication code, React Native API layer/navigation, module routes, test inventory, and searched for incomplete/placeholder/mock work. This was a code and documentation audit, not a live production/security penetration test.

## What it was trying to solve

School Connect evolved from a deepfake-detection project into a multi-role mobile school-management platform. It targets administrators, teachers, and parents (not students) with authentication, attendance, notices, parent links, feeds, materials, report cards, fees, exams, timetable, certificates, imports, promotions, analytics, uploads, push notifications, multilingual UI, and a web-admin portal. The core ambition is a broad ERP plus school communication app.

## Strengths worth retaining as ideas

- Role-based views and backend authorization are real, not merely visual role switches.
- Teacher-to-parent notification and class-material workflows match genuine school pain.
- Its route organization (module/routes/services/repository/models) is clearer than one giant backend file.
- JWT sessions, password hashing migration, rate limits, typed client API calls, upload validation, tests, and demo data/reset reports show good delivery instincts.
- The “teacher workflow speed is critical” principle and a clean, mobile-oriented visual hierarchy should carry forward.
- English/Hindi/Marathi localization is a useful later lesson, but must not be inherited automatically.

## Why it is unsuitable to copy

The active product has at least 20 backend domains and a React Native Android build with a long dependency list, native linking constraints, Firebase/Cloudinary/Redis/MongoDB/Render concerns, background services, and an internal name (`echoproof`) inherited from its former purpose. It is too broad for a first web release and too difficult for a Grade 7 presenter to explain end-to-end in an entrepreneurship interview.

The existing MVP also lacks the most important role for a “students falling behind” story: the student. Retrofitting a student role into this architecture would expand identity, permissions, navigation, parent linkage, and data design.

## Specific risks/problems observed

- **Scope creep:** fees, report cards, ranking, certificates, promotion, exam generation, timetable, teacher performance, and feeds create many unrelated value propositions.
- **Reliability debt:** documentation says MongoDB dependencies/Atlas first-run verification and Android verification were unfinished at one stage; current truth must be confirmed before relying on it.
- **Misleading product surface:** timetable code explicitly uses `generate_mock_timetable`; multiple navigator placeholder/“Not Available Yet” states remain. A competition product cannot expose such routes.
- **Operational burden:** the Flask app requires MongoDB and environmental secrets even in development, while caching, monitoring, storage, push, and scheduling broaden failure modes.
- **Security configuration risk:** a default development JWT secret and wildcard CORS are permitted by configuration; both must never be accepted for a real school deployment. The audit did not inspect secrets.
- **User trust risk:** attendance, fees, report cards, rankings, and certificates are sensitive school records. They require policy, auditability, correctness, and support beyond competition scope.
- **UX risk:** deeply nested admin/teacher navigation and a dense module grid make it hard to convey one benefit in a short demo.
- **Technical debt:** legacy web/prototype folders, a previous deepfake lineage, mixed mobile/web remnants, and native package manual-linking instructions increase maintenance risk.

## Reuse recommendation

Do **not** reuse old source code, database data, credentials, branding, or infrastructure. It would import technical debt and make the new product dependent on a system too complex to explain. Reuse only the learning: role-aware permissions, a teacher-first workflow, realistic seeded data, clear validation, and the habit of testing. Build EduBridge cleanly and separately.

## Verdict

School Connect is a serious experimental school platform, not a sound base for this focused U16 competition website. EduBridge should be a small, independently built web product with one measurable promise: create a shared, trusted record of what a class needs to do next.
