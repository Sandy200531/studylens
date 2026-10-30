import asyncio, traceback
from sqlalchemy import select
from app.db.models import User
from app.db.session import AsyncSessionLocal
from app.api.routes.history import get_history

async def main():
    # mimic get_current_user exactly: fetch then close session
    async with AsyncSessionLocal() as session:
        user = (await session.execute(select(User).where(User.id == 2))).scalar_one_or_none()
    print("detached user id:", user.id)
    try:
        res = await get_history(user=user)
        print("RESULT:", res)
    except Exception:
        traceback.print_exc()
    # now the real underlying query on a detached instance
    try:
        async with AsyncSessionLocal() as session:
            stmt = select(__import__("app.db.models", fromlist=["Explanation"]).Explanation).where(
                __import__("app.db.models", fromlist=["Explanation"]).Explanation.user_id == user.id)
            rows = (await session.execute(stmt)).scalars().all()
            print("detached-attr query rows:", len(rows))
    except Exception:
        traceback.print_exc()

asyncio.run(main())
