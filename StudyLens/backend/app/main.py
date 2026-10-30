from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from app.api.routes import analytics, auth, explain, health, history, questions, scan
from app.core.config import settings
from app.core.errors import register_exception_handlers
from app.core.middleware import RequestIDMiddleware
from app.core.rate_limit import limiter


def create_app() -> FastAPI:
    app = FastAPI(title=settings.app_name)

    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

    app.add_middleware(RequestIDMiddleware)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=['GET', 'POST', 'OPTIONS'],
        allow_headers=['Authorization', 'Content-Type', 'X-Request-ID'],
    )

    register_exception_handlers(app)

    app.include_router(health.router)
    app.include_router(explain.router)
    app.include_router(scan.router)
    app.include_router(questions.router)
    app.include_router(auth.router)
    app.include_router(history.router)
    app.include_router(analytics.router)

    return app


app = create_app()
