# SPEC: Chat tables (2026-11-15, user-approved)

Markdown tables in replies follow the Outis themes through the same tokens as the sidebar and
diagrams (`outis-theme-shared.css`, "Tables"); `MarkdownTokens.svelte` marks numeric columns.

- **TB-1** Body cells at the reply's font size with `tabular-nums`; header `text-transform: none`,
  weight 500, colour `--outis-input-fg`, background `--outis-chrome`, 1px `--outis-divider` under
  it; the first body column is weight 500.
- **TB-2** A column whose non-dash cells are at least half numeric gets `data-num` on its header and
  cells and is right-aligned (the lone `–` with it); text columns are not; an explicit markdown
  alignment (`:---`) is respected instead.
- **TB-3** Tables with 4+ columns tint every even body row (`--outis-chrome` at 55%); narrower
  tables have no stripes.
- **TB-4** Header tone, divider and cell ink resolve per theme (Light, Spark, FT checked).
