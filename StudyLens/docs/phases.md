# StudyLens — Execution Roadmap (7 Phases)

## Phase 1 — Chrome Extension Frontend & Webpage DOM Scanner
- Vite + React + TS + Tailwind + Manifest V3 scaffolding
- Content script DOM scanner (text, code, MCQs)
- Floating overlay (Shadow DOM) with health dot, streaming UI shell
- Background service worker, context menus, chrome.storage cache
- Dev mock mode

## Phase 2 — FastAPI Backend Core
- Project layout, Pydantic v2 schemas, strict CORS
- Routes: /health, /api/v1/explain, /scan, /questions, /auth, /history
- Global error handling, request ID middleware, rate limiting

## Phase 3 — Local AI Integration (Ollama)
- OllamaService with httpx async streaming
- SSE endpoint for explanations
- Prompt templates, timeout/retry, model config

## Phase 4 — Database & Infrastructure
- docker-compose: postgres, pgadmin, ollama, backend
- SQLAlchemy 2.0 async, Alembic migrations
- Models: User, Explanation, SavedQuestion, StudySession

## Phase 5 — Authentication & Security
- JWT register/login/refresh/me
- Token storage in chrome.storage, route protection
- Password hashing, rate limits, sanitization

## Phase 6 — User Dashboard
- History, saved questions, analytics views
- Endpoints + React UI, search/filter/export

## Phase 7 — Containerization & DevOps
- Backend Dockerfile, full docker-compose
- GitHub Actions CI (lint/typecheck/test/build)
- README, LICENSE, CONTRIBUTING

## Phase 8 — Floating “SL” Widget & Settings
- Replace collapsed overlay launcher with a draggable circular `SL` badge
- Snap-to-corner behavior on drag end
- Gear icon beside the close button in expanded mode
- Clicking gear toggles an inline settings view in the same popup frame
- Opacity/color/size apply to the whole popup, not just the collapsed badge
- Task checklist (`explain`, `summarize`, `quiz`, `code`) to filter visible actions
- Prefs persisted in `chrome.storage.local` with in-memory fallback
- No backend changes required

## Phase 9 — Single-Question Paginated Assessments
- Active-question parser that targets the currently visible question block
- `MutationObserver` + delegated click listeners for Next / Previous / grid navigation
- Active question number from label text or highlighted grid button
- Reactive overlay updates; quiz auto-answers subsequent questions after first run
- Graceful retry during SPA transitions (no premature "no questions found")
- Quiz fallback for open-ended (option-less) questions
- Passive read-only extraction for restricted pages
- Code-in-question detection (pre/code/textarea, editors, monospace) passed as fenced code with formatting preserved

## Phase 10 — Ordered vs Unordered Option Extraction
- Dynamic option-format detection: explicit markers (`A)`, `A.`, `1)`) vs unordered bullets / custom block lists (`<ul>`, `<li>`, generic `<div>`)
- Ordered options keep their explicit label (`A`, `B`, …) alongside the option text for clean mapping
- Unordered options capture the full item text and use a positional label only for display
- Robust fallback: when ordered labels cannot be found reliably, options are treated as unordered and the full text is captured
- Quiz request carries `option_format` + `option_labels`; the answer is shown as just `Correct option: <text>` (no explanation)

## Phase 11 — Coding Assessment Problem Extraction (code mode)
- A dedicated problem-statement extractor reads the **left-hand question panel** of coding assessments (DSA problems and short open-ended coding tasks), preserving line breaks instead of collapsing whitespace.
- The problem panel is located by keywords (`Problem Statement`, `Example`, `Constraints`, `Input`/`Output`, `Difficulty`, `Tags`, `Write`) and by viewport geometry (left half), so the IDE panel on the right is not mistaken for the question.
- IDE/editor content (Monaco, CodeMirror, `cm-editor`, `textarea`, `contenteditable`) is **excluded** from the problem statement and its code snippets; only code that belongs to the problem (`pre`/`code` inside the panel) is captured.
- Code mode now prefers `problem.statement` (+ problem code) over the previous title-only extraction; the snippet-explanation behaviour is preserved as a fallback for ordinary pages.
- The language selector value is passed as a hint so the solution matches the required language.
- Statement panels are found by heading keywords (`PROBLEM STATEMENT`, `CONSTRAINTS & REQUIREMENTS`, `Write …`) and expand upward when a compact header/title block was chosen, so the full body is captured.
- Code mode now returns **only the solution code** (fenced, minimal, no explanation) for problem pages; snippet pages keep the brief explain+improve behaviour.
- A **Stop button** aborts the in-flight answer: overlay → content port disconnect → background `AbortController` → backend fetch cancelled; disconnected channels are acknowledged so `Unchecked runtime.lastError` is not logged.
- This work is strictly additive: `extractActiveQuestion`, `extractMcqs`, `extractCodeBlocks`, `extractQuestionFromPageText`, the quiz prompt and `_clean_quiz_output` are unchanged, so quiz mode is unaffected.
- Diagnostics/hardening: the overlay now shows the backend's validation `detail` on errors; empty/whitespace-only text is rejected by the overlay (all modes) and by the backend (`text` must strip non-empty); `RequestValidationError` responses are made JSON-safe (dropping non-serializable `ctx`) and the failing request body is logged.
- Fixed a 422 source: an options block with no question text (e.g. a bulleted constraint list on a coding page) produced an `ActiveQuestion` with an empty question, which the overlay sent as an `mcqs` item. `extractActiveQuestion` now skips regions with no question text, and the overlay sanitizes the `mcqs` payload (drop empty questions, trim options, respect backend limits) before sending.
- Multi-question exam pages: the answer cache key now hashes the full request payload (previously only the first 80 chars of the text, so a later question sharing that prefix returned the first question's cached answer), and `extractProblem` prefers panels that are on screen and never merges two question panels (viewport scoring + heading-marker guard in `expandProblemRoot`).

## Phase 12 — Pause/Resume, Concept-Only Explain, Follow-Up Chat
- **Stop → Resume**: the Stop button no longer aborts the backend request. It now *pauses* the stream: the overlay stops pulling from the async generator (nothing renders) while the worker/backend keep the request alive; **Resume** flushes any buffered chunk and continues pulling exactly where it stopped. The Go button re-runs from scratch and defensively aborts any abandoned in-flight request via `onCancel()`.
- **Hidden scrollbars**: overlay scroll areas stay scrollable but their scrollbars are hidden (`scrollbar-width: none` + `::-webkit-scrollbar { display: none }` in the overlay stylesheet).
- **Explain mode** is now a concept-only, at-most-5-bullet explanation: the prompt forbids preamble, examples, repetition, and unrelated content, and only covers concepts directly present in the page.
- **Follow-up chat**: a text input + **Send** below the output lets the student ask Ollama questions about the last explained content (or ask to improve the answer). It sends `mode: 'chat'` with the last focused text as `text` and the student's question as `context`, appends a `Q: …` block to the output, and supports the same pause/resume. `chat` was added to the backend `mode` Literal and to the TS request/message types; it is never a task tab (auto-tab logic skips it).
- **Single-accent theme**: the one Settings color now drives *every* brand-colored element instead of ad-hoc hardcoded colors. `themeCssVars()` (shared/theme.ts) emits `--sl-accent`/`--sl-accent-dark`, injected on the overlay panel/widget roots and the popup document root; `.sl-accent-bg`/`.sl-accent-text` classes in the overlay stylesheet apply it to the `SL` badge, panel border, health dot (OK state), active task tab, Go/Stop/Resume/Send buttons, and the popup's tabs/export links/analytics bars. Indigo/rose/emerald accents were removed (health dot keeps `rose-400`/`amber-400` only for down/unknown states).
