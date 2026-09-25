# Spec: notes-navigation

Fork commit: 160763526 (step to the previous and next note from the editor).

## Behaviour

The note editor header shows `‹ n / total ›` when there is more than one note. It steps
through notes in the same order the Notes page lists them. Alt+Up / Alt+Down do the same,
except while typing in an input, textarea or the editor. The Notes page remembers its sort
(`localStorage.noteSortKey`, `noteSortDirection`); the editor also reads `noteFolder`.

## API

`GET /api/v1/notes/{id}/neighbors?order_by=&direction=&folder=` →
`{prev: {id,title}|null, next: {id,title}|null, index (0-based), total}`.
`order_by` ∈ `name | created_at | updated_at` (anything else → `updated_at desc`);
`direction == 'asc'` → ascending, else descending. No note content in the response. A note
that is missing, unreadable, or outside `folder` → 404.

## Acceptance criteria

API:

- **NN-1** For `order_by=name&direction=asc` over notes `NN1-a`, `NN1-b`, `NN1-c`: `NN1-b` has
  prev `NN1-a`, next `NN1-c`, `index` 1, `total` 3.
- **NN-2** First note has `prev: null`; last note has `next: null`.
- **NN-3** The neighbour order for each of the three sort keys and both directions equals the
  order `GET /notes/search` returns for the same sort.
- **NN-4** With `folder=NN4`, `total` counts only notes in `NN4` and below; a note outside the
  folder → 404.
- **NN-5** The response contains no `content` or `data` field.

Browser:

- **NN-6** Opening the middle of three notes shows `2 / 3`; clicking "Next note" opens the
  third and shows `3 / 3` with "Next note" disabled.
- **NN-7** With focus on the page (not the editor), Alt+Down opens the next note; with focus
  in the editor, Alt+Down does not navigate.
- **NN-8** Sorting the Notes list by Title survives a reload (`noteSortKey=name`), and the
  editor's stepper follows that order.
- **NN-9** With only one note, no stepper is shown.

## Test hooks

`aria-label="Previous note"` / `"Next note"`; position text matches `/^\d+ \/ \d+$/`.

## Notes for the test author

No tie-breaker in the sort: always use unique titles and wait for `updated_at` to differ
when sorting by time. The stepper uses read permission while the list uses write
permission, so keep every test note owned by the test user.
