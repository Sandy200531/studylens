from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import distinct, func, select

from app.api.deps import get_current_user
from app.db.models import Explanation, SavedQuestion, StudySession, User
from app.db.session import AsyncSessionLocal

router = APIRouter(prefix='/api/v1', tags=['analytics'])


class AnalyticsSummary(BaseModel):
    total_explanations: int
    total_saved_questions: int
    total_sessions: int
    explanations_by_mode: dict[str, int]
    distinct_sources: int


@router.get('/analytics/summary', response_model=AnalyticsSummary)
async def analytics_summary(user: User = Depends(get_current_user)) -> AnalyticsSummary:
    async with AsyncSessionLocal() as session:
        total_explanations = int(
            (await session.execute(select(func.count()).select_from(Explanation).where(Explanation.user_id == user.id))).scalar_one()
        )
        total_saved = int(
            (await session.execute(select(func.count()).select_from(SavedQuestion).where(SavedQuestion.user_id == user.id))).scalar_one()
        )
        total_sessions = int(
            (await session.execute(select(func.count()).select_from(StudySession).where(StudySession.user_id == user.id))).scalar_one()
        )
        rows = (
            await session.execute(
                select(Explanation.mode, func.count())
                .where(Explanation.user_id == user.id)
                .group_by(Explanation.mode)
            )
        ).all()
        explanations_by_mode = {mode: int(count) for mode, count in rows}
        distinct_sources = int(
            (
                await session.execute(
                    select(func.count(distinct(Explanation.source_url))).where(Explanation.user_id == user.id)
                )
            ).scalar_one()
        )
        return AnalyticsSummary(
            total_explanations=total_explanations,
            total_saved_questions=total_saved,
            total_sessions=total_sessions,
            explanations_by_mode=explanations_by_mode,
            distinct_sources=distinct_sources,
        )
