# StudyLens — Architecture

## 1. High-Level Data Flow
```
Chrome Extension (React MV3)
  ├─ Content Script: DOM scanner (text/code/MCQ extraction)
  ├─ Floating Overlay (Shadow DOM): streaming UI
  ├─ Background Service Worker: auth, messaging, context menus
  └─ chrome.storage: cache, tokens
        |
        v  HTTPS (CORS-restricted)
FastAPI Backend (Python, uvicorn)
  ├─ CORS middleware (extension origin only)
  ├─ Routes: /auth, /explain, /scan, /history, /saved, /analytics
  ├─ Services: OllamaService, AuthService, HistoryService
  └─ SQLAlchemy async sessions
        |
        ├──────────────► Local Ollama (http://localhost:11434)  [streaming]
        └──────────────► Local PostgreSQL (docker-compose, pgAdmin)
```

## 2. Manifest V3 CORS & CSP Handling
- `manifest.json` (built from `manifest.config.ts`):
  - Contains a **`key`** so the extension ID is stable on every machine: `cndlmnklkickkegohhimjbmjmhanolhp`. Do not regenerate the key — the ID is derived from it.
  - `host_permissions`: `"http://localhost:8000/*"`, `"http://localhost:11434/*"` (dev only).
  - `permissions`: `storage`, `activeTab`, `scripting`, `contextMenus`.
  - `content_security_policy.extension_pages`: `"script-src 'self'; object-src 'self';"`.
- FastAPI CORS:
  - `allow_origins=["chrome-extension://cndlmnklkickkegohhimjbmjmhanolhp", "http://localhost:5173"]` in dev.
  - `allow_credentials=True`, `allow_methods=["GET","POST","OPTIONS"]`, `allow_headers=["Authorization","Content-Type"]`.
  - Extension→localhost:8000 requests bypass CORS via `host_permissions`; the CORS list mainly covers the Vite dev web app origin.
- Never use `allow_origins=["*"]` with credentials.

## 3. Component Responsibilities
| Component | Responsibility |
|---|---|
| Content Script | Extract page text/code/MCQs, inject overlay root |
| Overlay | Render explanation UI, stream SSE, health dot |
| Background SW | JWT storage/refresh, context menus, caching |
| FastAPI | Validation, auth, orchestration, DB, Ollama proxy |
| Ollama | Local LLM inference, streaming |
| PostgreSQL | Users, explanations, saved questions, sessions |
| pgAdmin | DB inspection/management in docker-compose |

## 4. Streaming Path
`POST /api/v1/explain` → FastAPI → Ollama `/api/generate?stream=true` → SSE chunks → Extension overlay (typewriter render).

## 5. Local Dev Services (docker-compose)
- `postgres:16` (host port 5433)
- `pgadmin4` (port 5050)
- `ollama/ollama` (port 11434, optional profile)
- `backend` (port 8000, later phases)

## 6. Floating “SL” Widget & Settings (Phase 8)
- The collapsed overlay trigger is a small circular badge centered as `SL`.
- It can be dragged, then snaps to the **nearest screen edge** on release (no corner restriction).
- In expanded mode, the panel’s header bar is the drag handle for the same edge-snap behavior.
- In the expanded view, the settings gear sits **immediately left of the close (×)** button.
- Clicking settings toggles an **inline settings view** inside the same popup frame; it replaces the main task/answer view until closed.
- Settings control the **entire popup** (opacity, color, size), and visible tasks come from the checkbox list.
- Persist settings via `chrome.storage.local`, with in-memory fallback.
- No backend change is required for this UI customization.

## 7. Single-Question Paginated Assessments (Phase 9)
- The scanner resolves the **currently visible** question block instead of looking for a list of all questions.
- When more than one question block is in the DOM (paginated exams), only blocks that intersect the viewport are considered, so inactive off-screen questions are ignored.
- When the question body and the option list live in separate containers (e.g. CodeChef MCQs), the on-screen option list is found elsewhere and merged into the active question.
- A question's embedded code is attached to the question when answering a quiz, because the quiz prompt reads the structured questions rather than the raw page text.
- A `MutationObserver` plus delegated click listeners detect Next / Previous / grid navigation and SPA updates.
- The active question number is read from the label (`1) ...`) or the highlighted grid button in the right panel.
- The overlay updates instantly; once quiz has run manually, new questions are auto-answered in quiz mode.
- Transient empty DOM states during transitions are debounced and retried instead of raising "no questions found".
- Quiz mode falls back to answering open-ended (option-less) prompts from the page text.
- Code inside a question or page is detected from `pre`/`code`/`textarea`, editors (CodeMirror/Monaco), and monospace blocks, preserved with formatting, and passed to the model inside fenced blocks.
- The backend quiz prompt handles both option lists and single open-ended questions.
- Option extraction detects ordered markers (`A)`, `A.`, `1)`) vs unordered bullet/block lists; `option_format` + `option_labels` travel with the quiz request. The quiz answer is reduced to only `Correct option: <option text>`, stripping model explanations and mapping bare option letters back to their text.
- Extraction stays passive: no text selection, clipboard, or focus interception.

## 8. Coding Assessment Problem Extraction (Phase 11)
- Coding assessments split the screen: the problem statement is on the left, the IDE/editor on the right. `extractProblem()` selects the on-screen **left/statement** panel by keyword score (`Problem Statement`, `Example`, `Constraints`, `Input`/`Output`, `Difficulty`, `Tags`, `Write`) plus viewport geometry.
- The statement is read with a block-aware DOM walk that inserts line breaks (the previous global extractor collapsed whitespace and capped at 5000 chars), so examples, inputs, outputs and constraints survive.
- Editor subtrees (`monaco`, `CodeMirror`, `cm-editor`, `[class*=editor]`, `contenteditable`, `textarea`) and UI chrome (`nav`, `header`, `toolbar`, `timer`) are skipped, so the user's editor/boilerplate is never sent as the question.
- `extractProblemCode()` captures code snippets that are part of the problem (e.g. example code in `<pre>`/`<code>`), ignoring editor nodes.
- The active language from the page's language selector is attached as a hint.
- Panel selection scores by statement headings (`PROBLEM STATEMENT`, `CONSTRAINTS & REQUIREMENTS`, `Write …`) and expands the chosen container upward when only a compact title/header block was selected.
- In code mode the model returns only the fenced solution (no explanation); a **Stop** button cancels a running answer by disconnecting the content-script port, which aborts the worker's `AbortController` and the backend fetch. Disconnect errors (`runtime.lastError`) are acknowledged on both sides.
- `scanPage()` returns this as a new `problem` field on `ExtractedContent`. It is read **only** by code mode; quiz mode's fields and functions are untouched.

## 9. Pause/Resume, Concept-Only Explain, Follow-Up Chat (Phase 12)
- The **Stop** button now pauses instead of aborting: the overlay stops pulling chunks from its async generator (rendering freezes) while the content-script port, worker fetch and backend generation stay alive. **Resume** flushes buffered chunks and continues the same request; chunk–pause races are absorbed by a small buffer so nothing is lost. Abort (`onCancel`) is still used defensively at the start of every Go, so abandoned paused streams are cleaned up and the Go button stays disabled while loading/paused.
- Overlay scroll areas keep scrolling but hide their scrollbars via `scrollbar-width: none` / `::-webkit-scrollbar { display: none }`.
- **Explain** mode is concept-only: the backend prompt asks for at most 5 short bullet points covering only the concepts present in the extracted content (no preamble, examples, repetition, or unrelated material).
- A follow-up **chat input** (Send, or Enter) sends `mode: 'chat'` with `text` = the last content the model explained and `context` = the student's question; the answer is appended under a `Q: …` heading with the same pause/resume support. `chat` is part of the backend `mode` Literal and the shared TS request/message types, and is excluded from the task-tab auto-switch.
- **Uniform accent theme**: `shared/theme.ts` turns the Settings color into `--sl-accent`/`--sl-accent-dark` CSS variables, injected on the overlay widget/panel roots and the popup `<html>` root; `.sl-accent-bg`/`.sl-accent-text` classes (overlay stylesheet, shared by the popup) color every brand element — SL badge, panel border, health dot (OK), active tabs, Go/Stop/Resume/Send, and popup tabs/export links/analytics bars. Only the down/unknown health states keep `rose-400`/`amber-400`.
