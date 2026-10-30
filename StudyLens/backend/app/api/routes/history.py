from fastapi import APIRouter, Depends
from sqlalchemy import select

from app.api.deps import get_current_user
from app.db.models import Explanation, User
from app.db.session import AsyncSessionLocal

router = APIRouter(prefix='/api/v1', tags=['history'])


@router.get('/history')
async def get_history(user: User = Depends(get_current_user), mode: str | None = None, q: str | None = None) -> dict:
    try:
        async with AsyncSessionLocal() as session:
            stmt = select(Explanation).where(Explanation.user_id == user.id)
            if mode:
                stmt = stmt.where(Explanation.mode == mode)
            if q:
                like = f'%{q}%'
                stmt = stmt.where((Explanation.input_text.ilike(like)) | (Explanation.output_text.ilike(like)))
            rows = (await session.execute(stmt.order_by(Explanation.created_at.desc()).limit(50))).scalars().all()
            return {
                'items': [
                    {'id': r.id, 'mode': r.mode, 'input_text': r.input_text[:200], 'output_text': r.output_text[:200], 'created_at': r.created_at.isoformat()}
                    for r in rows
                ]
            }
    except Exception:
        import logging
        logging.getLogger(__name__).exception('history query failed')
        return {'items': []}
