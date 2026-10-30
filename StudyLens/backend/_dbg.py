import asyncio, traceback
from sqlalchemy import select
from app.db.models import Explanation, User
from app.db.session import AsyncSessionLocal

async def main():
    async with AsyncSessionLocal() as session:
        u = (await session.execute(select(User).where(User.id == 2))).scalar_one_or_none()
        print("user:", u.id if u else None)
        stmt = select(Explanation).where(Explanation.user_id == u.id)
        rows = (await session.execute(stmt.order_by(Explanation.created_at.desc()).limit(50))).scalars().all()
        print("rows:", len(rows))
        for r in rows:
            print(" ->", r.id, r.mode, r.input_text[:40])

asyncio.run(main())
