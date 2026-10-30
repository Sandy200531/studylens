from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy import select

from app.api.deps import get_current_user
from app.db.models import SavedQuestion, User
from app.db.session import AsyncSessionLocal

router = APIRouter(prefix='/api/v1', tags=['questions'])


class SavedQuestionCreate(BaseModel):
    question: str = Field(min_length=1, max_length=4000)
    answer: str | None = Field(default=None, max_length=8000)
    source_url: str | None = Field(default=None, max_length=2000)


@router.get('/questions')
async def list_questions(user: User = Depends(get_current_user), q: str | None = None) -> dict:
    try:
        async with AsyncSessionLocal() as session:
            stmt = select(SavedQuestion).where(SavedQuestion.user_id == user.id)
            if q:
                stmt = stmt.where(SavedQuestion.question.ilike(f'%{q}%'))
            rows = (await session.execute(stmt.order_by(SavedQuestion.created_at.desc()).limit(50))).scalars().all()
            return {'items': [{'id': r.id, 'question': r.question, 'answer': r.answer, 'source_url': r.source_url} for r in rows]}
    except Exception:
        return {'items': []}


@router.post('/questions')
async def save_question(body: SavedQuestionCreate, user: User = Depends(get_current_user)) -> dict:
    async with AsyncSessionLocal() as session:
        row = SavedQuestion(question=body.question, answer=body.answer, source_url=body.source_url, user_id=user.id)
        session.add(row)
        await session.commit()
        await session.refresh(row)
        return {'id': row.id, 'question': row.question}
