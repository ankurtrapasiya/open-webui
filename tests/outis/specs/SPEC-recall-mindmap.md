# SPEC: Recall mind map (2026-11-15)

Design: outis-owui `docs/superpowers/specs/2026-11-15-recall-mindmap-design.md`.
A mind map whose Kroki `<svg>` carries `data-outis-mindmap` (the final PlantUML source) gets a
**Recall** button in the diagram viewer. It swaps the picture for a live tree
(`RecallMindMap.svelte` + `RecallNode.svelte`, parsed by `src/lib/utils/mindmap.ts`); the
picture stays in the DOM (hidden) so export and **Picture** keep working.

- **MP-1..6** (`mindmap-parse.spec.ts`) parser: `*` and `+/-` syntax, `_` flag, `[#colour]`,
  `<<tags>>`, multi-line `:…;` nodes, `left side`/`<style>` skipped, Creole stripped, `leaves()`,
  `pathTo()`, null for no map, skipped depth attaches to the nearest ancestor.
- **RM-1** Recall button only when the source attribute is present; never in full screen.
- **RM-2** Recall shows `[data-recall-map]`, hides the `svg`; Picture restores it; < 4 branches
  all on `[data-side="right"]`, otherwise the second half on the left.
- **RM-3** Collapse/Expand per node; depth ≥ 2 nodes start collapsed.
- **RM-4** Recall mode: every `[data-leaf]` shows a `[data-chip]` ("?") and no label; non-leaf
  labels stay. Reveal → label; **Missed** → `POST /api/v1/outis/recall`
  `{root, path, label, result}`, `data-result="missed"`, counter `known n · missed m`.
- **RM-5** Knew it on a never-missed leaf → `{stored:false}` and no toast; first stored miss
  toasts `Saved to Review: My gaps` once per map.
- **RM-6** Keyboard: Enter on a chip reveals (focus moves to the label), `k`/`m` record, Escape
  leaves recall mode. A map with no leaves: counter `0 to recall`, no chips.
- **RM-7** Branch hue = `--outis-diagram-bN-border` (Spark checked), ground = `--o-page` (FT).
- **RM-8** Reveal all / Reset.
- Backend (`tests/outis/backend/test_recall.py`, also run inside the image by
  `outis-regression.sh`): Review's schema and id rule; missed = upsert + FSRS `again`; knew =
  `good` only on a scheduled card; unwritable db → `sqlite3.OperationalError` (HTTP 500).
