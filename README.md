# StudyLens

Open-source, zero-cost, AI-powered browser extension and learning platform. Chrome Extension → local FastAPI → local Ollama (streaming explanations) + local PostgreSQL (pgAdmin). Everything runs on your machine.

## Architecture
```
Chrome Extension (React MV3)
  └─ FastAPI (app/main.py)
       ├─► Ollama (localhost:11434)   [AI explanations, streaming SSE]
       └─► PostgreSQL (docker, :5433) [history, saved Q&A, analytics]
```
See `docs/architecture.md` for CORS/CSP details and `docs/design.md` for the overlay UX. For a complete first-run checklist (ports, migrations, model pull, other-PC setup, troubleshooting), see **[docs/SETUP.md](docs/SETUP.md)**.

## Quickstart

**1. Services**
```bash
docker compose up -d postgres pgadmin
```
- Postgres: `localhost:5433` (user/pass/db: `studylens`)
- pgAdmin: `http://localhost:5050` (`admin@studylens.dev` / `admin`)
- Optional Ollama container: `docker compose --profile ai up -d`

**2. Backend**
```bash
cd backend
python -m venv .venv
.venv\Scripts\activate          # or: source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
alembic upgrade head
uvicorn app.main:app --reload
```

**3. AI engine (Ollama in Docker — no local install needed)**
```bash
docker compose --profile ai up -d ollama     # start studylens-ollama
docker compose --profile ai exec ollama ollama pull qwen2.5:3b   # pull model into the container's volume
```
The container maps `11434:11434`, so the backend on `localhost:11434` reaches it either way (native or in-Docker backend).

**4. Extension**
```bash
cd extension
npm install
npm run build
```
Load `extension/dist` as an unpacked extension at `chrome://extensions` (Developer mode).

## Sharing & running on another PC

Push the repo to GitHub (public or private), then your friend clones it — or send them a ZIP of the folder. No secrets are committed: `.env`, `dist/`, `.venv/`, `node_modules/` are gitignored, and only `backend/.env.example` is tracked.

Fresh machine, from scratch:

```bash
git clone <repo-url> && cd <repo>
docker compose up -d postgres pgadmin        # local DB + pgAdmin (:5433 / :5050)

docker compose --profile ai up -d ollama     # AI engine in Docker (no local Ollama)
docker compose --profile ai exec ollama ollama pull qwen2.5:3b

cd backend
python -m venv .venv
.venv\Scripts\activate                       # Mac/Linux: source .venv/bin/activate
pip install -r requirements.txt
copy .env.example .env                       # Mac/Linux: cp .env.example .env
alembic upgrade head
uvicorn app.main:app --reload                # backend on :8000

cd ..\extension
npm install
npm run build
```
Then open `chrome://extensions`, enable **Developer mode**, click **Load unpacked**, and select the `extension/dist` folder.

**The extension ID is stable on every machine.** The manifest carries a `key`, so the ID is always `cndlmnklkickkegohhimjbmjmhanolhp`; `backend/.env.example` and `docker-compose.yml` already allow that origin. (The extension already bypasses CORS for `http://localhost:8000` via `host_permissions`, so extension→backend works even without editing CORS.) To double-check the ID on any machine: `chrome://extensions` → **Details** on StudyLens → copy the ID block and compare.

Full first-run checklist and troubleshooting: **[docs/SETUP.md](docs/SETUP.md)**.

## API highlights
- `GET /health` — backend/ollama/db status
- `POST /api/v1/explain` — SSE-streamed explanation (optional `Authorization: Bearer`)
- `POST /api/v1/auth/register|login|refresh`, `GET /api/v1/auth/me`
- `GET /api/v1/history?mode=&q=`, `GET /api/v1/questions?q=`, `GET /api/v1/analytics/summary`

## Development
- Extension: `cd extension && npm run dev` (CRXJS hot reload)
- Backend: `uvicorn app.main:app --reload`
- Tests/lint: see `.github/workflows/ci.yml`

## Roadmap
See `docs/phases.md` — Phases 1–7 complete (extension scanner + overlay, FastAPI, Ollama, DB, auth, dashboard, DevOps).

## License
MIT — see `LICENSE`.
"# rehs" 
"# lol" 
"# lol" 
"# Studylens" 
