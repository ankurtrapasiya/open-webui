"""CB-30, CB-31: a model is not offered the create_tool built-in, or the other creators, unless its own settings opt in.

Saving a tool executes the Python it was given on the server. Upstream offers create_tool to every model when
the chat user is an admin; a model (qf-lab, 2026-11-15) used that to create two tools nobody asked for.

Run inside an Open WebUI container: docker exec -i -w /app/backend <container> python3 - < this file
scripts/outis-regression.sh runs it against the image under test.
"""
import asyncio
from types import SimpleNamespace

from open_webui.utils.tools import get_builtin_tools


def offered(meta, note_chat=False):
    request = SimpleNamespace(state=SimpleNamespace(internal=False))
    model = {'id': 'm', 'info': {'meta': meta}}
    user = {'id': 'u1', 'role': 'admin', 'email': 'u1@example.invalid', 'name': 'U1', 'last_active_at': 0, 'updated_at': 0, 'created_at': 0}
    extra = {'__user__': user, '__metadata__': {}}
    return set(asyncio.run(get_builtin_tools(request, extra, {}, model, note_chat)))


assert 'create_tool' not in offered({}), 'default must be off'
assert 'create_tool' not in offered({'builtinTools': {'tools': False}})
assert 'create_tool' in offered({'builtinTools': {'tools': True}}), 'an explicit opt-in still works'
assert offered({}), 'the other built-ins are still offered'
print('CB-30 pass')

# CB-31: the other creators (create_skill is the one a default install always has for an admin; notes, automations and
# calendar depend on config that may be off, so they are only checked for absence)
CREATORS = {'write_note', 'create_skill', 'create_automation', 'create_calendar_event'}
assert not CREATORS & offered({}), CREATORS & offered({})
assert not CREATORS & offered({'builtinTools': {'create': False}})
assert 'create_skill' in offered({'builtinTools': {'create': True}}), 'an explicit opt-in still works'
assert 'write_note' in offered({}, note_chat=True), 'a note chat can still write its note'
assert 'create_tool' not in offered({'builtinTools': {'create': True}}), 'create_tool has its own switch'
print('CB-31 pass')
