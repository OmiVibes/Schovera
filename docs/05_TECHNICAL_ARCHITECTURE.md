# Technical Architecture

## Recommendation

Use a single responsive web application built with **Next.js + TypeScript**, backed by **Supabase (PostgreSQL, authentication, and optional file storage)**. Deploy the application to Vercel or another managed Next.js host. Do not build a separate mobile app, microservices system, cache cluster, message queue, or AI service.

## Simple architecture

`Browser → EduBridge Next.js app/server routes → Supabase Auth + PostgreSQL (+ Storage only for approved files)`

The browser displays screens. The application checks the signed-in user and role before requesting data. PostgreSQL permanently stores the school, users, updates, and acknowledgements. Database access rules protect data even if a client request is manipulated.

## Why each technology is necessary

| Technology | Necessity | Student-friendly explanation |
|---|---|---|
| Next.js | Builds a fast responsive website and its small secure server layer in one project. | “It makes the pages and handles safe requests.” |
| TypeScript | Catches data-shape mistakes before release. | “It helps us use the right kind of information.” |
| Supabase Auth | Provides secure sign-in/session handling without inventing password security. | “It verifies who is using the website.” |
| PostgreSQL | Reliably persists structured school data and relationships. | “It is the organised digital record book.” |
| Row Level Security | Ensures each role only sees its permitted records. | “The database has locked sections for different users.” |
| Supabase Storage (optional) | Stores a small, approved set of learning files outside database rows. | “It safely holds the teacher’s attachment.” |
| Vercel/managed hosting | Makes the website reachable and repeatably deployable. | “It puts our site online.” |

## Security baseline

- Use real auth; never role-switch with a front-end-only toggle.
- Store no passwords, service keys, or secrets in browser code or source control.
- Use HTTPS through managed hosting.
- Enforce role/class/parent-child access in database policies and server routes.
- Validate inputs on server; escape/render user content as text; limit title/instruction lengths.
- Restrict uploads by type/size, and scan/avoid uploads entirely until necessary.
- Use fictional data for competition. Obtain written school approval and parent consent before a real pilot.
- Keep audit fields: created/updated time and author. Do not collect sensitive marks, health, discipline, or location data.

## Explicit non-architecture

No MongoDB, Flask API, React Native, Firebase push, Redis, Cloudinary, background jobs, microservices, realtime subscriptions, analytics warehouse, or LLM is required in Release 1. These add failure modes without improving the central demo.

## Reliability/presentation

Seed a local/demo environment with predictable data and a reset command restricted to the demo environment. On presentation day, test teacher/parent/principal sign-in, publish, parent acknowledgement, principal aggregate, refresh persistence, realtime, and offline fallback (screenshots/video only as a backup, never misrepresented as live).
