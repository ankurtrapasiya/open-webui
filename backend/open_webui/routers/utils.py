from __future__ import annotations

import asyncio
import logging
import re

import black
from fastapi import APIRouter, Depends, HTTPException, Request, status
from open_webui.config import DATA_DIR, ENABLE_ADMIN_EXPORT
from open_webui.constants import ERROR_MESSAGES
from open_webui.models.config import Config
from open_webui.models.functions import Functions
from open_webui.utils.auth import get_admin_user, get_verified_user
from open_webui.utils.code_interpreter import execute_code_jupyter
from open_webui.utils.misc import get_gravatar_url
from open_webui.utils.plugin import get_function_module_from_cache
from pydantic import BaseModel
from starlette.responses import FileResponse

log = logging.getLogger(__name__)

router = APIRouter()


@router.get('/gravatar')
async def get_gravatar(email: str, user=Depends(get_verified_user)):
    return get_gravatar_url(email)


class CodeForm(BaseModel):
    code: str


@router.post('/code/format')
async def format_code(form_data: CodeForm, user=Depends(get_admin_user)):
    try:
        formatted_code = black.format_str(form_data.code, mode=black.Mode())
        return {'code': formatted_code}
    except black.NothingChanged:
        return {'code': form_data.code}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


class DiagramForm(BaseModel):
    lang: str
    code: str


# Notes draw plantuml / dot (and a mermaid mindmap, converted to the PlantUML mindmap) with the
# same installed Kroki filter the chat uses, so a note shows the same themed drawing. The filter
# lives in the database (outis-mneme installs it), so a missing filter is a 404, not an error.
@router.post('/diagram')
async def render_diagram(request: Request, form_data: DiagramForm, user=Depends(get_verified_user)):
    try:
        renderer, _, _ = await get_function_module_from_cache(request, 'kroki_diagram_renderer')
    except Exception:
        raise HTTPException(status_code=404, detail='Diagram renderer is not installed')
    renderer.valves = renderer.Valves(**(await Functions.get_function_valves_by_id('kroki_diagram_renderer') or {}))
    fence = f'```{form_data.lang}\n{form_data.code.rstrip()}\n```'
    body = {'messages': [{'role': 'assistant', 'content': fence}]}
    out = (await asyncio.to_thread(renderer.outlet, body))['messages'][0]['content']
    diagram = re.search(r'<div class="outis-diagram">[^\n]*', out)
    if not diagram:
        raise HTTPException(status_code=400, detail=out.split('\n', 1)[0][:300])
    return {'html': diagram.group(0)}


@router.post('/code/execute')
async def execute_code(request: Request, form_data: CodeForm, user=Depends(get_verified_user)):
    if not await Config.get('code_execution.enable'):
        raise HTTPException(
            status_code=403,
            detail=ERROR_MESSAGES.FEATURE_DISABLED('Code execution'),
        )

    if await Config.get('code_execution.engine') == 'jupyter':
        output = await execute_code_jupyter(
            await Config.get('code_execution.jupyter.url'),
            form_data.code,
            (
                await Config.get('code_execution.jupyter.auth_token')
                if await Config.get('code_execution.jupyter.auth') == 'token'
                else None
            ),
            (
                await Config.get('code_execution.jupyter.auth_password')
                if await Config.get('code_execution.jupyter.auth') == 'password'
                else None
            ),
            await Config.get('code_execution.jupyter.timeout'),
        )

        return output
    else:
        raise HTTPException(
            status_code=400,
            detail=ERROR_MESSAGES.DEFAULT('Code execution engine not supported'),
        )


@router.get('/db/download')
async def download_db(user=Depends(get_admin_user)):
    """Download the raw SQLite database file (admin-only, SQLite deployments only)."""
    if not ENABLE_ADMIN_EXPORT:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail=ERROR_MESSAGES.ACCESS_PROHIBITED)

    # Lazy import avoids circular dependency at module load time
    from open_webui.internal.db import engine

    if engine.name != 'sqlite':
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=ERROR_MESSAGES.DB_NOT_SQLITE)

    return FileResponse(
        str(engine.url.database),
        media_type='application/octet-stream',
        filename='webui.db',
    )
