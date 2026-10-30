import logging
from contextlib import suppress

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

logger = logging.getLogger('studylens')


def _json_safe_errors(exc: RequestValidationError) -> list:
    """Return validation errors that are safe to serialize.

    ``exc.errors()`` may include ``ctx`` entries holding exception objects
    (e.g. a ValueError raised in a validator), which break ``json.dumps``.
    """
    return [{k: v for k, v in err.items() if k != 'ctx'} for err in exc.errors()]


def register_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(HTTPException)
    async def http_exc_handler(_: Request, exc: HTTPException) -> JSONResponse:
        return JSONResponse(status_code=exc.status_code, content={'detail': exc.detail, 'error_code': 'http_error'})

    @app.exception_handler(RequestValidationError)
    async def validation_exc_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
        body = None
        with suppress(Exception):
            body = (await request.body()).decode('utf-8', errors='replace')[:4000]
        logger.warning(
            'Validation failed on %s %s: %s%s',
            request.method,
            request.url.path,
            _json_safe_errors(exc),
            f' body={body}' if body else '',
        )
        return JSONResponse(status_code=422, content={'detail': _json_safe_errors(exc), 'error_code': 'validation_error'})

    @app.exception_handler(Exception)
    async def unhandled_exc_handler(request: Request, exc: Exception) -> JSONResponse:
        logger.exception('Unhandled error on %s %s: %s', request.method, request.url.path, exc)
        return JSONResponse(status_code=500, content={'detail': 'Internal server error', 'error_code': 'internal_error'})
