# StudyLens — Product Requirements Document (PRD)

## 1. Product Overview
StudyLens is an open-source, zero-cost, AI-powered browser extension and learning platform. It helps students understand webpage content, code, and multiple-choice questions by sending extracted text to a local FastAPI backend, which streams explanations from a local Ollama model. All data stays on the user's machine.

## 2. Target Users
- Students, self-learners, developers reading documentation or articles.
- Users who want privacy-first, offline-capable AI explanations.

## 3. Core Capabilities (v1)
- **Webpage Scanner**: Extract readable text, code blocks, and MCQs from any page.
- **Floating Overlay UI**: Draggable, collapsible React overlay with streaming explanations.
- **Local AI Engine**: Ollama inference (streaming) via FastAPI.
- **History & Saved Questions**: Persisted in local PostgreSQL.
- **Dashboard**: View history, saved questions, and basic analytics.
- **Auth**: JWT register/login, secure token storage in `chrome.storage`.
- **Customizable Floating Trigger**: Collapsible `SL` circle with drag + corner-snap and a settings panel for opacity, color, size, and which tasks are shown. Settings apply to the whole popup, the gear sits next to the close button, and the settings view is inline in the same popup frame.
- **Single-Question Pagination**: On assessment pages that show one question at a time, StudyLens tracks the active question and updates answers as the user navigates with Next/Previous or the question grid.
- **Code-Aware Extraction**: Detects code inside questions and page content (`pre`, `code`, textareas, editors, monospace blocks), preserves indentation, and includes it when explaining, quizzing, or solving.

## 4. Zero-Cost Local Architecture
- **Inference**: Local Ollama (no cloud LLM calls).
- **Backend**: Local FastAPI (uvicorn).
- **Database**: Local PostgreSQL + pgAdmin, managed via docker-compose.
- **Frontend**: Manifest V3 Chrome extension.
- **Distribution**: Open-source GitHub repo, Docker-ready.

## 5. Offline-First Capabilities
- Extension caches recent explanations in `chrome.storage.local`.
- Health indicator shows Backend / Ollama / DB status.
- Mock mode for UI development without backend.
- Graceful fallback: cached results shown when offline.

## 6. Non-Goals (v1)
- No cloud sync, no multi-user SaaS, no paid API integrations.
- No mobile app.

## 7. Success Metrics
- Explanation streaming < 2s first token on local machine.
- Zero `any` in TS, mypy/ruff clean backend.
- Extension loads in Chrome with no CSP violations.
