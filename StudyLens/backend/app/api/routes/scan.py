from fastapi import APIRouter

from app.schemas.content import ScanRequest, ScanResponse

router = APIRouter(prefix='/api/v1', tags=['scan'])


@router.post('/scan', response_model=ScanResponse)
async def scan(body: ScanRequest) -> ScanResponse:
    return ScanResponse(
        title=body.title,
        text_length=len(body.text),
        code_block_count=len(body.code_blocks),
        mcq_count=len(body.mcqs),
        url=body.url,
    )
