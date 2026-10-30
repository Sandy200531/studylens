# StudyLens — Design System & Overlay UX

## 1. Styling
- Tailwind CSS utility-first; no inline styles in JSX.
- Design tokens:
  - Primary: single configurable **accent** color, default `#6366F1`, exposed as `--sl-accent` CSS variable injected on the overlay and popup roots.
  - Surface: `slate-900/90` dark translucent for overlay
  - Text: `slate-100` primary, `slate-400` secondary
  - Status dot: accent when OK, `amber-400` warning, `rose-400` error
- Fonts: Inter (UI), JetBrains Mono (code).

## 2. Floating Extension Overlay UX
- **Trigger**: Content script injects a small floating action button (bottom-right).
- **Expanded State**: Draggable panel (max ~420px wide), collapsible to a bar.
- **Shadow DOM**: Overlay rendered inside `attachShadow({mode:'open'})` so page CSS never leaks in.
- **Streaming Explanation**: SSE chunks append to a scrollable answer pane with typewriter effect.
- **Health Indicator**: Colored dot top-right (Backend/Ollama/DB).
- **Actions**: Copy, export Markdown, save question, regenerate.
- **Accessibility**: Focusable buttons, `aria-live="polite"` for streaming output, keyboard close (Esc).

### 2b. Floating “SL” Circular Widget
- The collapsed trigger is a **round circle** centered with `SL`.
- It can be dragged freely, and on release it snaps smoothly to the **nearest screen edge** (any point along the border, not just four corners).
- The expanded panel is also draggable via its top header bar, and snaps the same way.
- When expanded, the settings button sits **immediately left of the close (×) button** in the panel header.
- Clicking settings toggles an **inline settings view inside the same popup frame**, replacing the main task/answer area.
- The same opacity/color/size values are applied to the **whole popup widget**, not only the `SL` circle.
- Settings items:
  - background/element **opacity** slider,
  - **Theme color** picker (applies to the whole extension),
  - **size** slider,
  - checkboxes for `explain`, `summarize`, `quiz`, `code`.
- One Theme color drives every brand-colored element: the `SL` badge, panel border, health dot (OK), active task tab, Go/Stop/Resume/Send buttons in the overlay, and the tabs, export links and analytics bars in the popup — via `.sl-accent-bg` / `.sl-accent-text` classes backed by the injected `--sl-accent` / `--sl-accent-dark` variables.
- Default: all four tasks enabled.
- Prefs persist via `chrome.storage.local` with an in-memory fallback.

### 2c. Reactive Single-Question Mode
- On paginated assessment UIs only one question is in the DOM; the scanner targets that **active block**.
- If inactive questions remain in the DOM, only on-screen question blocks are considered.
- Next / Previous / grid clicks and DOM mutations re-run extraction automatically.
- The active question number comes from the label (`1) Question:`) or the highlighted grid button.
- The quiz panel shows the detected question and its options; when no options exist it answers the open-ended prompt.
- If the option list is in a separate container from the question, it is located on screen and merged, so the quiz is answered as multiple-choice rather than guessed.
- A question's code snippet is passed along with the question so the model can reason about it.
- During SPA transitions an empty DOM is retried rather than reported as an error.
- Embedded code in a question is shown in a monospace block and sent to the model fenced, so indentation is preserved.
- Options are format-aware: explicit markers (`A)`, `A.`, `1)`) are kept as labels, while unordered bullets/block items keep their full text with a positional label only for display.
- Extraction is passive (read-only) so restricted/anti-copy pages keep working.

### 2d. Coding Assessment Code Mode
- Coding assessments (DSA problems and short open-ended tasks) put the statement in a left panel and an IDE in a right panel.
- A dedicated `problem` extractor reads the statement panel, keeping paragraph/example/constraint line breaks.
- The IDE/editor is excluded, so the model gets the actual question instead of the editor's boilerplate code.
- Code mode prefers `problem.statement` + problem code; if no statement panel exists (ordinary docs pages) it falls back to the previous snippet-explanation behaviour.
- The language selector value is passed as a hint so solutions are written in the required language.
- Code answers contain only the fenced solution (no explanation) for problem pages.
- A red **Stop** button appears while an answer is streaming; it disconnects the worker port and aborts the backend request.
- Purely additive: quiz mode keeps using the existing active-question/option extraction and quiz prompt.

## 3. Popup / Side Panel Dashboard
- Routes: History, Saved Questions, Analytics, Settings.
- Tailwind cards + simple bar charts for analytics.
- Dark mode default; respects system preference.

## 4. Component Conventions
- Presentational components in `components/ui/`.
- Feature components in `features/overlay/`, `features/dashboard/`.
- All components typed props, no `any`.
