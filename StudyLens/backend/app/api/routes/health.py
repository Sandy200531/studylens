from fastapi import APIRouter, Request
from sqlalchemy import text

from app.db.session import AsyncSessionLocal
from app.schemas.explain import HealthResponse
from app.services.ollama import OllamaService

router = APIRouter(tags=['health'])


@router.get('/health', response_model=HealthResponse)
async def health(_: Request) -> HealthResponse:
    ollama_ok, ollama_detail = await OllamaService().diagnose()
    db_ok = False
    db_detail: str | None = None
    try:
        async with AsyncSessionLocal() as session:
            await session.execute(text('SELECT 1'))
            db_ok = True
    except Exception as exc:  # noqa: BLE001 - any failure means the DB is down
        db_ok = False
        db_detail = f'Database unreachable: {type(exc).__name__}'
    return HealthResponse(
        backend='ok',
        ollama='ok' if ollama_ok else 'down',
        db='ok' if db_ok else 'down',
        detail=None if ollama_ok and db_ok else (ollama_detail if not ollama_ok else db_detail),
    )
