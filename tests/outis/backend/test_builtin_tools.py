"""CB-30: a model is not offered the create_tool built-in unless its own settings opt in.

Saving a tool executes the Python it was given on the server. Upstream offers create_tool to every model when
the chat user is an admin; a model (qf-lab, 2026-11-15) used that to create two tools nobody asked for.

Run inside an Open WebUI container: docker exec -i -w /app/backend <container> python3 - < this file
scripts/outis-regression.sh runs it against the image under test.
"""
import asyncio
from types import SimpleNamespace

from open_webui.utils.tools import get_builtin_tools


def offered(meta):
    request = SimpleNamespace(state=SimpleNamespace(internal=False))
    model = {'id': 'm', 'info': {'meta': meta}}
    user = {'id': 'u1', 'role': 'admin', 'email': 'u1@example.invalid', 'name': 'U1', 'last_active_at': 0, 'updated_at': 0, 'created_at': 0}
    extra = {'__user__': user, '__metadata__': {}}
    return set(asyncio.run(get_builtin_tools(request, extra, {}, model)))


assert 'create_tool' not in offered({}), 'default must be off'
assert 'create_tool' not in offered({'builtinTools': {'tools': False}})
assert 'create_tool' in offered({'builtinTools': {'tools': True}}), 'an explicit opt-in still works'
assert offered({}), 'the other built-ins are still offered'
print('CB-30 pass')
