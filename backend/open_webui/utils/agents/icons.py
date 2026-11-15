"""Icons for agent models.

Agent models (ids `agent:<terminal>:<provider>:<model>`) come from Open Terminal discovery
and are never rows in the models table, so the profile-image endpoint had nothing to serve
for them. Each provider gets one bundled icon at static/agents/<provider>.png.
"""

from pathlib import Path

PROVIDER_CHARS = frozenset('abcdefghijklmnopqrstuvwxyz0123456789-')


def agent_icon(model_id, static_dir) -> str | None:
    """Return the /static URL of the provider icon for an agent model id, else None."""
    if not isinstance(model_id, str) or not model_id.startswith('agent:'):
        return None
    parts = model_id.split(':', 3)
    if len(parts) != 4:
        return None
    provider = parts[2]
    if not provider or not set(provider) <= PROVIDER_CHARS:
        return None
    if not (Path(static_dir) / 'agents' / f'{provider}.png').is_file():
        return None
    return f'/static/agents/{provider}.png'
