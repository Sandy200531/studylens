import json
import logging
import re

from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse

from app.core.rate_limit import limiter
from app.core.security import decode_token
from app.db.models import Explanation
from app.db.session import AsyncSessionLocal
from app.schemas.explain import ExplainRequest
from app.services.ollama import OllamaService, OllamaUnavailableError
from app.services.prompts import build_prompt

logger = logging.getLogger('studylens')

router = APIRouter(prefix='/api/v1', tags=['explain'])


def _clean_quiz_output(raw: str, mcqs: list | None = None) -> str:
    """Reduce a quiz answer to only the chosen option text(s).

    The model is asked to emit ``Correct option: <text>`` lines; if it adds
    explanations, or answers with a bare letter, we normalize to the option
    text. Falls back to the raw text when no such line is present.
    """
    def options_for(number: str | None) -> list[str]:
        if not mcqs:
            return []
        index = int(number) - 1 if number and number.isdigit() else 0
        item = mcqs[index] if 0 <= index < len(mcqs) else mcqs[0]
        opts = getattr(item, 'options', None) if not isinstance(item, dict) else item.get('options')
        return [str(o) for o in (opts or [])]

    keep: list[str] = []
    for line in raw.splitlines():
        match = re.search(r'(?:(\d+)\s*[.)]\s*)?Correct option:\s*(.+)', line, re.IGNORECASE)
        if not match:
            continue
        number = match.group(1)
        value = match.group(2).strip()

        # Strip a leading option label such as "B)", "B.", or "(b)".
        labelled = re.match(r'^\(?([A-Za-z]|\d{1,2})[.)\]:]\s*(.*)$', value)
        if labelled and labelled.group(2).strip():
            value = labelled.group(2).strip()
        else:
            # The model answered with only a label, or "B - explanation".
            label_only = re.fullmatch(r'\(?([A-Za-z]|\d{1,2})[.)\]:]?\)?', value) or re.match(
                r'^\(?([A-Za-z]|\d{1,2})\)?\s*[-–—:]\s*', value
            )
            if label_only:
                letter = re.sub(r'[^A-Za-z0-9]', '', label_only.group(1)).upper()
                if len(letter) == 1 and 'A' <= letter <= 'Z':
                    options = options_for(number)
                    position = ord(letter) - ord('A')
                    if 0 <= position < len(options):
                        value = options[position]

        keep.append(f'{number}. Correct option: {value}' if number else f'Correct option: {value}')
    return '\n'.join(keep) if keep else raw.strip()


def _extract_user_id(request: Request) -> int | None:
    auth = request.headers.get('Authorization')
    if not auth or not auth.startswith('Bearer '):
        return None
    try:
        return int(decode_token(auth.split(' ', 1)[1], 'access'))
    except Exception:
        return None


async def _ollama_stream(request: ExplainRequest, user_id: int | None):
    service = OllamaService()
    prompt = build_prompt(
        request.mode,
        request.text,
        request.context,
        request.mcqs,
        request.option_format,
        request.option_labels,
    )
    collected: list[str] = []
    # Quiz and code answers benefit from deterministic, low-variance sampling.
    gen_options = {'temperature': 0.2} if request.mode in ('quiz', 'code') else None
    try:
        if request.mode == 'quiz' and request.mcqs:
            async for token in service.stream_generate(prompt, gen_options):
                collected.append(token)
            raw = ''.join(collected)
            # For quiz mode we return only the chosen option(s); a strict format
            # parser was replacing valid answers with '?'.
            yield f'data: {json.dumps(_clean_quiz_output(raw, request.mcqs))}\n\n'
        else:
            async for token in service.stream_generate(prompt, gen_options):
                collected.append(token)
                yield f'data: {json.dumps(token)}\n\n'
        yield 'data: [DONE]\n\n'
        try:
            async with AsyncSessionLocal() as session:
                session.add(
                    Explanation(
                        user_id=user_id,
                        mode=request.mode,
                        input_text=request.text[:4000],
                        output_text=''.join(collected),
                    )
                )
                await session.commit()
        except Exception:
            pass
    except OllamaUnavailableError as exc:
        message = f'[StudyLens] {exc.reason}'
        if exc.hint:
            message = f'{message} {exc.hint}'
        yield f'data: {json.dumps(message)}\n\n'
        yield 'data: [DONE]\n\n'


@router.post('/explain')
@limiter.limit('10/minute')
async def explain(request: Request, body: ExplainRequest) -> StreamingResponse:
    return StreamingResponse(_ollama_stream(body, _extract_user_id(request)), media_type='text/event-stream')
