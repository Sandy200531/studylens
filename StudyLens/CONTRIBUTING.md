# Contributing to StudyLens

## Setup
1. Clone the repo and read `docs/architecture.md`.
2. Backend: `cd backend && python -m venv .venv && .venv\Scripts\activate && pip install -r requirements.txt`
3. Extension: `cd extension && npm install`
4. Local services: `docker compose up -d postgres pgadmin`

## Standards
- TypeScript: **zero `any`**, strict mode on. Run `npm run build` before pushing.
- Python: Pydantic v2 validation everywhere; run `ruff check app`.
- No secrets in code — use `.env`.
- See `.opencoderules` for the full ruleset.

## PRs
- One feature per PR, small and reviewable.
- Ensure CI (lint + build) passes.
