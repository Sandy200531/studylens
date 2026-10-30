from typing import Literal

from pydantic import BaseModel, Field, field_validator

from app.schemas.content import McqItem


class ExplainRequest(BaseModel):
    text: str = Field(min_length=1, max_length=8000)
    mode: Literal['explain', 'summarize', 'quiz', 'code', 'chat'] = 'explain'
    context: str | None = Field(default=None, max_length=1000)
    mcqs: list[McqItem] = Field(default_factory=list)
    option_format: Literal['ordered', 'unordered'] = 'ordered'
    option_labels: list[str] = Field(default_factory=list, max_length=12)

    @field_validator('text')
    @classmethod
    def sanitize_text(cls, v: str) -> str:
        stripped = v.strip()
        if not stripped:
            raise ValueError('text must not be empty or whitespace')
        return stripped


class HealthResponse(BaseModel):
    backend: Literal['ok', 'down', 'unknown'] = 'ok'
    ollama: Literal['ok', 'down', 'unknown'] = 'unknown'
    db: Literal['ok', 'down', 'unknown'] = 'unknown'
    # Human-readable reason when ollama/db is not ok (e.g. "model 'x' is not pulled").
    detail: str | None = None
