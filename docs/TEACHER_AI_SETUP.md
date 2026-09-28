# Teacher AI Studio setup and safe-use notes

Teacher AI Studio is at `/teacher/ai`. It contains two separate tools:

- AI-assisted syllabus outlines, exam papers, worksheets, and lesson plans. Drafts are editable and are not saved or published by Schovera.
- A browser-local spreadsheet editor for the first sheet of `.xlsx`, `.xls`, and `.csv` files. Workbook contents are not sent to the AI endpoint. The simple editor exports cell values and does not preserve styles, formulas, macros, or additional sheets; teachers should work on a copy.

## Local model (recommended for the laptop demo)

Install Ollama, start the Ollama service, and download the lightweight demo model:

```powershell
ollama pull gemma3:1b
```

The server uses Ollama at `http://127.0.0.1:11434` by default. The default model is `gemma3:1b`, selected to fit the demo laptop more comfortably than larger models. Set `OLLAMA_BASE_URL` or `OLLAMA_MODEL` in the server environment only when using a different local Ollama setup/model. No OpenAI key is required. Generation stays on the computer when this provider is used; drafts remain editable and require teacher review.

## Optional hosted provider

Set `OPENAI_API_KEY` in the local server environment (`.env.local`) and in the hosting provider's server-only environment settings. Do not use a `NEXT_PUBLIC_` prefix, commit the key, or paste it into chat. Optionally set `OPENAI_MODEL`; the default is `gpt-4.1-mini`. Restart the local server or create a new deployment after changing environment variables.

The API verifies the Supabase access token and requires an active `teacher` profile on every request. It uses the Supabase publishable key only—never the service-role key. Requests are bounded and the model call has a 45-second timeout. Generated text is not written to Schovera's database. OpenAI receives the teacher's grade/level, subject, topic and optional notes; teachers must not include student names, contact details, marks tied to identifiable students, or other personal data.

Before classroom use, a teacher must review the draft against the school's current curriculum, assessment rules, age suitability, answer keys, accessibility needs, and local language. The draft is assistance, not official curriculum or professional judgment. Set usage/spend limits for the OpenAI project before enabling generation for a wider group.

OpenAI is used only when `TEACHER_AI_PROVIDER=openai` is explicitly configured. Local workbook editing does not require an AI key or Ollama.

## Verify

Run `npm run verify:teacher-ai` for the responsive browser flow, local spreadsheet edit/export, unauthenticated request denial, Teacher request validation, and non-Teacher role denial. To test generation, ensure Ollama is running and `gemma3:1b` is installed, then submit a non-sensitive sample in Teacher AI Studio. Review all generated material before classroom use.
