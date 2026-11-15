# SPEC: Live graph (2026-11-15, user-approved)

Design: outis-owui `docs/superpowers/specs/2026-11-15-live-graph-design.md`. A Graphviz chart's Kroki
`<svg>` carries its cleaned DOT (`data-outis-dot-b64`); `DiagramViewer` offers **Graph / Picture**;
`LiveGraph.svelte` draws chips + an SVG edge layer from `dot.ts` (parser) and `graph-layout.ts`.

- **DP-1..6** (`dot-parse.spec.ts`) parser: attributes, `\n` labels, chains with a shared label,
  implicit nodes, `{group} -> target`, nested clusters, comments and attribute statements, quoted
  ids, `unsupported` flags (record, html-label, ports, too-many-nodes > 60, no-edges), null, `--`.
- **GL-1..5** (`graph-layout.spec.ts`) layout: ranks and rows, no overlap on a random DAG, fold
  hides only solely-reachable descendants with a badge count, cycles terminate, small LR graphs
  are horizontal, `hueOf` follows the root's branches (0 = root, multiple sources ≥ 1).
- **LG-1** Graph button only for a supported chart; never in full screen; not for `shape=record`.
- **LG-2** Graph draws one `[data-gnode]` per node and one `path[data-edge]` per edge, hides the
  SVG (kept in the DOM); Picture restores it.
- **LG-3** Fold/Unfold with `[data-badge]` `+n`; **LG-4** cluster header `[data-gcluster]` folds members.
- **LG-5** At 560px: no chip wider than a third of the graph, no sideways scroll, no overlap
  (the chip cap tightens to the widest row).
- **LG-6** Chip borders resolve to `--outis-diagram-bN-border` in Dark and Spark (tokens added to
  those themes; CD-7 and RM-7 updated accordingly); FT root chip uses `--outis-diagram-root-border`.
- **LG-7** `data-horizontal="true"` for LR with ≤ 8 nodes, `"false"` above.
