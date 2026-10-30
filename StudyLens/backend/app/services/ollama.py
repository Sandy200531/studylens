from collections.abc import AsyncIterator

import httpx

from app.core.config import settings


class OllamaUnavailableError(RuntimeError):
    """The Ollama server is unreachable, or the configured model is missing.

    ``reason`` is what went wrong and ``hint`` is the command that fixes it;
    the explain stream shows both to the user.
    """

    def __init__(self, reason: str, hint: str | None = None) -> None:
        super().__init__(reason)
        self.reason = reason
        self.hint = hint


def _canonical(name: str) -> str:
    """Normalize a model name the way Ollama does (bare name == ``:latest``)."""
    return name if ':' in name else f'{name}:latest'


class OllamaService:
    def __init__(self, base_url: str | None = None, model: str | None = None, timeout: float = 120.0) -> None:
        self.base_url = base_url or settings.ollama_base_url
        self.model = model or settings.ollama_model
        self.timeout = timeout

    async def diagnose(self) -> tuple[bool, str]:
        """Check the server *and* the configured model.

        A running server with an empty model list still fails every generate
        call, so reachability alone must not count as healthy.
        """
        try:
            async with httpx.AsyncClient(timeout=3.0) as client:
                res = await client.get(f'{self.base_url}/api/tags')
        except httpx.HTTPError as exc:
            return False, f'Cannot reach the Ollama server at {self.base_url} ({type(exc).__name__})'
        if res.status_code != 200:
            return False, f'Ollama at {self.base_url} answered HTTP {res.status_code}'
        try:
            payload = res.json()
            names = {_canonical(str(m.get('name', ''))) for m in payload.get('models', [])}
        except (ValueError, AttributeError, TypeError):
            return False, f'Ollama at {self.base_url} returned an unreadable model list'
        if _canonical(self.model) not in names:
            return False, f"Ollama is running but the configured model '{self.model}' is not pulled"
        return True, 'ok'

    async def is_available(self) -> bool:
        ok, _ = await self.diagnose()
        return ok

    def _unreachable(self, exc: BaseException) -> OllamaUnavailableError:
        """Build the error for a dead/slow server; callers must ``raise ... from exc``."""
        if isinstance(exc, httpx.TimeoutException):
            reason = f'The Ollama server at {self.base_url} timed out after {self.timeout:.0f}s.'
            hint = 'The model may still be loading — retry, or check the container with: docker logs studylens-ollama'
        else:
            reason = f'Cannot reach the Ollama server at {self.base_url}.'
            hint = 'Start it with: docker compose --profile ai up -d ollama'
        return OllamaUnavailableError(reason, hint)

    def _model_missing(self, detail: str | None = None) -> OllamaUnavailableError:
        suffix = f' ({detail})' if detail else ''
        return OllamaUnavailableError(
            f"Ollama is running but the configured model '{self.model}' is not pulled{suffix}.",
            f'Pull it with: docker compose --profile ai exec ollama ollama pull {self.model}',
        )

    async def stream_generate(self, prompt: str, options: dict | None = None) -> AsyncIterator[str]:
        url = f'{self.base_url}/api/generate'
        payload: dict = {'model': self.model, 'prompt': prompt, 'stream': True}
        if options:
            payload['options'] = options
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client, client.stream('POST', url, json=payload) as res:
                if res.status_code != 200:
                    body = ''
                    try:
                        body = (await res.aread()).decode('utf-8', 'replace')[:400]
                    except Exception:  # noqa: BLE001 - the status code is enough to diagnose
                        body = ''
                    if res.status_code in (400, 404) and (
                        'not found' in body.lower() or 'model' in body.lower()
                    ):
                        raise self._model_missing(body.strip() or None)
                    raise OllamaUnavailableError(f'Ollama returned {res.status_code} for {url}. {body.strip()}'.strip())
                async for line in res.aiter_lines():
                    if not line:
                        continue
                    try:
                        import json

                        data = json.loads(line)
                    except ValueError:
                        continue
                    token = data.get('response')
                    if token:
                        yield token
                    if data.get('done'):
                        return
        except OllamaUnavailableError:
            raise
        except httpx.HTTPError as exc:
            raise self._unreachable(exc) from exc
