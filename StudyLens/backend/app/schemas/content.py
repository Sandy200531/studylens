from pydantic import BaseModel, Field


class McqItem(BaseModel):
    question: str = Field(min_length=1, max_length=2000)
    options: list[str] = Field(min_length=2, max_length=10)


class ScanRequest(BaseModel):
    title: str = Field(default='', max_length=500)
    text: str = Field(min_length=1, max_length=20000)
    code_blocks: list[str] = Field(default_factory=list, max_length=50)
    mcqs: list[McqItem] = Field(default_factory=list)
    url: str = Field(max_length=2000)


class ScanResponse(BaseModel):
    title: str
    text_length: int
    code_block_count: int
    mcq_count: int
    url: str
