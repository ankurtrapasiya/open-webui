# Spec: memory

Memory is a learner model for tutoring, not a profile. The background reviewer
(`backend/open_webui/utils/memory.py`, `_review_memory`) runs every
`memories.review_interval_turns` user turns and may only keep study state: what the user
understands, where they get stuck, the example that worked, and study preferences. The
prompt says so; `backend/open_webui/utils/study_memory.py` enforces the part code can check.

## Acceptance criteria

- **MEM-1** Of the reviewer's operations, only those that write under `study/` and (for
  replace/move/remove) target a memory already under `study/` are applied. Memories the user
  saved elsewhere are never shown to the reviewer and never changed by it.
  Check: `tests/outis/backend/test_study_memory.py`, run inside the image by
  `scripts/outis-regression.sh`.

Not checked by code: whether a `study/` memory's text contains identifying details. The
prompt forbids it; read `study/` memories now and then (Settings → Personalization → Memory).
