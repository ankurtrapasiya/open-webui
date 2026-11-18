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

# CB-33: open checklist items are put back in front of the model each turn
from open_webui.tools.builtin import open_tasks_note

assert open_tasks_note(None) is None and open_tasks_note([]) is None
assert open_tasks_note([{'id': 'a', 'content': 'x', 'status': 'completed'}, {'id': 'b', 'content': 'y', 'status': 'cancelled'}]) is None
note = open_tasks_note([{'id': 'b1', 'content': 'done one', 'status': 'completed'},
                        {'id': 'b2', 'content': 'Diagnose overfit', 'status': 'in_progress'},
                        {'id': 'b3', 'content': 'Implement', 'status': 'pending'}])
assert '- b2 [in_progress] Diagnose overfit' in note and '- b3 [pending] Implement' in note, note
assert 'done one' not in note and 'update_task' in note, note
print('CB-33 pass')
