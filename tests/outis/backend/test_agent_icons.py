"""CB-28: an agent model id resolves to its bundled provider icon; anything else gets none.

Run: /usr/bin/python3 tests/outis/backend/test_agent_icons.py  (no Open WebUI install needed)
scripts/outis-regression.sh also runs it inside the image under test.
"""
import importlib.util
import os
import pathlib
import tempfile

# AGENT_ICONS_PY / AGENT_ICONS_STATIC let the regression script check the copies inside the image,
# where this file arrives on stdin and has no path of its own.
def root():
    return pathlib.Path(__file__).resolve().parents[3]
path = os.environ.get('AGENT_ICONS_PY') or root() / 'backend/open_webui/utils/agents/icons.py'
static = pathlib.Path(os.environ.get('AGENT_ICONS_STATIC') or root() / 'backend/open_webui/static')
spec = importlib.util.spec_from_file_location('agent_icons', path)
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)

# The shipped icon for the Claude Code agent exists and is a PNG.
assert (static / 'agents/claude-code.png').read_bytes()[:8] == b'\x89PNG\r\n\x1a\n'
assert m.agent_icon('agent:claude-terminal:claude-code:claude-sonnet-5-5', static) == '/static/agents/claude-code.png'
assert m.agent_icon('agent:wb%2Dx:claude-code:model%3Awith%3Acolons', static) == '/static/agents/claude-code.png'
# No icon for an unknown provider, a malformed id, a non-agent id, or a path-escaping provider.
with tempfile.TemporaryDirectory() as empty:
    assert m.agent_icon('agent:t:claude-code:m', empty) is None
assert m.agent_icon('agent:t:no-such-agent:m', static) is None
assert m.agent_icon('agent:t:claude-code', static) is None
assert m.agent_icon('claude-sonnet-5-5', static) is None
assert m.agent_icon('agent:t:../favicon:m', static) is None
assert m.agent_icon(None, static) is None
print('CB-28 pass')
