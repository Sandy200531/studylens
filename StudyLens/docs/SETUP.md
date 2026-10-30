# StudyLens — Complete Setup Guide

Everything you need to run StudyLens from scratch on your own machine — or on a
friend's PC. This covers the four parts of the stack, the ports they use, the
first-run steps, and troubleshooting.

## 1. What StudyLens is made of

| Part | What it does | Default address |
|---|---|---|
| Chrome extension (`extension/`) | Floatabble overlay + scanner on any page | loaded unpacked in Chrome |
| Backend (`backend/`) | FastAPI + SQLAlchemy; streams AI answers (SSE) | `http://localhost:8000` |
| Ollama (Docker) | Local AI engine (model `qwen2.5:3b`) | `http://localhost:11434` |
| PostgreSQL (Docker) | Stores history, saved questions, analytics | `localhost:5433` |
| pgAdmin (Docker) | Visual DB browser | `http://localhost:5050` |

The plugin talks to the backend, the backend talks to Ollama and PostgreSQL.
Everything runs **locally** — no cloud accounts, no API keys.

## 2. Prerequisites (install once)

- **Git** — to clone the repository.
- **Docker Desktop** — for PostgreSQL, pgAdmin, and the Ollama AI engine. Must be running (`docker ps` works).
- **Python 3.11+** — for the backend.
- **Node.js 18+** — to build the extension (npm included).
- **Chrome (or Edge/Chromium)** — to run the unpacked extension.

> No local Ollama install needed — Ollama runs in its own container
> (`studylens-ollama`), so Docker Desktop is the only extra requirement.

These are the same on Windows, macOS and Linux; only the shell commands differ
(shown for both below).

## 3. Get the code

```bash
git clone <repo-url> && cd <repo>
```
…or download the ZIP from GitHub (Code → **Download ZIP**) and extract it.

> What's in the repo: everything needed. Secrets are **not** committed —
> `.gitignore` excludes `.env`, `dist/`, `.venv/`, `node_modules/`. The only env
> template tracked is `backend/.env.example`, which you copy to `.env`.

## 4. Start the databases (Docker)

```bash
docker compose up -d postgres pgadmin
```

- Postgres becomes available on **`localhost:5433`** (user/pass/db all `studylens`).
- pgAdmin on **`http://localhost:5050`** (login `admin@studylens.dev` / `admin`).

Verify: `docker compose ps` should show both containers `running` (or `healthy`).

> Ollama runs in its own container too (no local install). Start it with:
> `docker compose --profile ai up -d ollama` — see **section 6**. When the
> backend runs natively, point it at `OLLAMA_BASE_URL=http://localhost:11434`
> (the container maps that port); when the backend runs in Docker too, it uses
> `host.docker.internal:11434` instead (already set in `docker-compose.yml`).

## 5. Backend (FastAPI)

```bash
cd backend
python -m venv .venv

# Windows (PowerShell):
.venv\Scripts\activate
# macOS / Linux:
source .venv/bin/activate

pip install -r requirements.txt
```

Create the local env file (it is gitignored, so your settings stay yours):

```bash
# Windows:
copy .env.example .env
# macOS / Linux:
cp .env.example .env
```

The template already points at the docker Postgres and `qwen2.5:3b`; key variables:

| Variable | Meaning |
|---|---|
| `OLLAMA_BASE_URL` | Ollama endpoint (default `http://localhost:11434`) |
| `OLLAMA_MODEL` | Model name (default `qwen2.5:3b`; change freely, e.g. `qwen3:4b` or `llama3.2`) |
| `DATABASE_URL` | Postgres connection (default matches docker compose) |
| `CORS_ORIGINS` | Browsers allowed to call the API. Includes the stable extension ID + Vite dev server |
| `SECRET_KEY` | Auth token signing key — change for anything beyond local testing |

Apply the database schema, then start the API:

```bash
alembic upgrade head
uvicorn app.main:app --reload
```

Check `http://localhost:8000/health` — you should see:

```json
{"backend":"ok","ollama":"ok","db":"ok"}
```

If any value is not `ok`, see **Troubleshooting** below.

## 6. AI engine (Ollama in Docker)

Ollama runs in its own container — you do **not** install Ollama locally.

```bash
# 1. Start the container (the `ai` profile adds studylens-ollama)
docker compose --profile ai up -d ollama

# 2. Pull the model once — it is stored in the container's `ollama` volume
#    and survives container restarts
docker compose --profile ai exec ollama ollama pull qwen2.5:3b
```

Verify it's reachable: `curl http://localhost:11434/api/tags` should list `qwen2.5:3b`.

The first generation on a question will be a bit slower while the model loads.
To use a different model, set `OLLAMA_MODEL` in `backend/.env`, then
`docker compose --profile ai exec ollama ollama pull <model>`.

## 7. Chrome extension

```bash
cd extension
npm install
npm run build
```

This writes the ready-to-load extension into `extension/dist`.

1. Open `chrome://extensions`.
2. Turn on **Developer mode** (top-right toggle).
3. Click **Load unpacked** and select the **`extension/dist`** folder.

You should see the floating **SL** badge bottom-right of any page. Give it a
question to explain, or open the popup (dashboard).

**Stable extension ID.** The manifest ships a `key`, so the extension ID is the
same on every machine: `cndlmnklkickkegohhimjbmjmhanolhp`. You can verify it at
`chrome://extensions` → **Details** on StudyLens → copy the ID. If it ever
differs from the one in `backend/.env.example`, update `.env`'s `CORS_ORIGINS`
and restart the backend. (Note: extension→`localhost:8000` requests already
work regardless of CORS because the manifest's `host_permissions` covers that
origin.)

**After code changes:** rebuild with `npm run build`, then on
`chrome://extensions` click the **↻** reload button on StudyLens.

## 8. Running on another PC (friend machine)

Everything above is exactly what your friend does. Nothing is machine-specific:

1. Clone (or unpack the ZIP).
2. `docker compose up -d postgres pgadmin`.
3. Backend: venv → `pip install -r requirements.txt` → `copy .env.example .env`
   (or `cp`) → `alembic upgrade head` → `uvicorn app.main:app --reload`.
4. Ollama: the docker flow from section 6 — `docker compose --profile ai up -d ollama`
   then `docker compose --profile ai exec ollama ollama pull qwen2.5:3b`.
5. Extension: `npm install` → `npm run build` → **Load unpacked** `extension/dist`.

What's already handled on their side:

- **Extension ID** is identical (manifest `key`) → no per-machine CORS editing.
- **Env template** ships with working defaults matching docker compose.
- **Ports** are hardcoded consistently (`5433`, `5050`, `11434`, `8000`).

Common things that DO differ per machine and how to fix:

- **Ollama container not started / model missing** → `docker compose --profile ai up -d ollama`
  + `docker compose --profile ai exec ollama ollama pull qwen3:4b`.
- **Docker not running** → start Docker Desktop first; `docker compose ps` to verify.
- **Port 8000 busy** → stop the old backend, or change the port in `uvicorn` and
  update `CORS_ORIGINS`/`host_permissions` accordingly (not recommended).
- **Backend shows `db: down`** → postgres container not healthy yet; wait and retry `/health`.

## 9. Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `/health` → `{"backend":"...","db":"down"}` | Postgres not up | `docker compose up -d postgres pgadmin`, wait for healthy, retry |
| `/health` → `ollama: down` | Ollama container stopped / model missing | `docker compose --profile ai up -d ollama`; `docker compose --profile ai exec ollama ollama pull qwen2.5:3b`; retry |
| Overlay shows *backend down* | Backend not running on :8000 | start `uvicorn`; check `http://localhost:8000/health` |
| Overlay errors with a validation message | Old extension build | rebuild (`npm run build`) and reload the extension |
| Requests blocked by CORS (rare) | Extension ID mismatch | see *Stable extension ID* above |
| `alembic upgrade head` fails | DB not reachable / wrong URL | check `docker compose ps`; `DATABASE_URL` in `.env` |
| Port already in use (`8000`, `5433`, …) | another service on that port | stop it, or change `docker-compose.yml` port mapping + `.env` |
| Extension not appearing | Developer mode off / wrong folder | reload `extension/dist`; enable Developer mode |

## 10. Day-to-day update flow

- Backend: the `--reload` flag auto-restarts on file changes.
- Extension: `npm run build` → reload the extension at `chrome://extensions`.
- New migrations from teammates: `git pull` → `alembic upgrade head`.
- Ollama: new model → `docker compose --profile ai exec ollama ollama pull <model>` and set `OLLAMA_MODEL` in `.env`.