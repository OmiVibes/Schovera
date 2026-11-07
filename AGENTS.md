<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## User workflow preferences

- After completing each requested set of project changes, run appropriate checks and create a local Git commit so the user can revert to a checkpoint. For a message that changes no project files, do not create an empty commit. Do not push or deploy unless separately requested.
- Stage only relevant source, tests, setup scripts and documentation. Keep private environment files, account credentials, local databases, installer downloads, logs and unrelated developer artifacts out of commits. Preserve unrelated work.
- Voice verification must distinguish real playback from pronunciation quality. Test installed language-matched voices through the production speech controller; do not claim fluent-listener acceptance from browser callbacks or an output meter alone. Keep original text separate from translation.
