# Spec: notes-render

Fork commits: a8b8cf891 (LaTeX in the notes editor), 6b34d3662 (show a note the chat wrote),
79e021f14 (math in the PDF export), cbacf7856 (print a note instead of rasterising it).

## Behaviour

- The note editor has its own Marked instance (`editorMarked`, `src/lib/utils/marked/
  editor-marked.ts`) that turns `$..$` and `$$..$$` into math nodes, rendered with KaTeX.
  Saving writes the `$` delimiters back to markdown.
- A note whose stored content has only `md` (as the chat's `write_note` tool writes it:
  `{json: null, html: '', md}`, or older notes with no `json` key) opens with its text, not a
  blank page.
- Open note → Download → PDF opens a print window with the note's live HTML, forced to the
  light theme, and calls `print()`. The Notes-list download still uses the raster
  `downloadPdf`, which now renders math before capture.

## Acceptance criteria

The editor's markdown parser (`editorMarked`), checked through what the editor renders:

- **NR-1** `'$$\n\\frac1n\n$$'` → a `div[data-type="block-math"][data-latex="\frac1n"]`.
- **NR-2** `'a $x^2$ b'` → a `span[data-type="inline-math"][data-latex="x^2"]`.
- **NR-3** `'$5 and $10'` → no inline math (prices are not math).
- **NR-4** `'$a<b$'` → `data-latex="a&lt;b"` (escaped).
- **NR-5** `'- [ ] x'` → an unchecked task item (`data-checked="false"`, checkbox unticked).
- **NR-6** After rendering a chat (which registers the chat's KaTeX extension on the global
  `marked`), a note opened in the same session still parses `$x^2$` as note math (the
  original bug).

- **NR-13** `'$$p(n) ::= n^2 + n + 41. \\tag{1.1}$$'` renders as display math (`.katex-display`)
  with the equation number and no `.katex-error`. (First run found every `$$` block rendered in
  inline mode, because the `Mathematics` wrapper gives block and inline math the same KaTeX
  options; `\tag` then failed. Fixed 2026-09-30: BlockMath is configured with `displayMode`.)

Browser:

- **NR-14** A note with a ` ```mermaid ` flowchart shows the code (still editable, highlighted)
  and the drawn diagram under it (`.mermaid-diagram svg`). Typing in the code redraws it
  (debounced 300 ms; a half-typed diagram keeps the last good drawing). Saving keeps the
  ` ```mermaid ` fence in `md`. Implemented in `RichTextInput/MermaidCodeBlock.ts`.
- **NR-18** A ` ```mermaid ` mind map and a ` ```plantuml ` block in a note are each drawn by the
  server's `kroki_diagram_renderer` filter (`POST /api/v1/utils/diagram`), not by Mermaid: two
  `.mermaid-diagram .outis-diagram svg`, no Mermaid svg, and saving keeps the ` ```mermaid ` fence.
  Mind maps are always the PlantUML mindmap skill's drawing; the filter converts a Mermaid
  mindmap. (Asked 2026-10-03. The suite has no Kroki, so a stub filter draws "lang: source".)
- **NR-19** A Kroki drawing (plantuml, dot, a mermaid mind map) hides its code once drawn and
  shows a `.diagram-source-toggle` button, "▸ Diagram source", under the drawing; clicking it
  shows the code ("▾ Diagram source") and clicking again hides it. A mermaid flowchart keeps its
  code visible and gets no toggle. A block created empty starts unfolded, so typing a new diagram
  is not hidden at its first good render. (Asked 2026-10-03, to match the chat, where the filter
  puts the source in a closed `<details>`.)
- **NR-15** A non-mermaid code block gets no `.mermaid-diagram` drawing.
- **NR-16** A 1600x1200 image in a note fills at least 90% of the editor width and is taller
  than 400px. (Found 2026-10-01: note images were capped at `max-h-72`, 288px, so a rendered
  mind map showed as an unreadable thumbnail. `RichTextInput/Image/image.ts`.)
- **NR-17** Clicking a note image opens the full-screen preview (`ImagePreview`, with
  pan/zoom) showing it at least 60% of the viewport tall; Escape closes it.

- **NR-7** A note created through the API with `md` containing `$E(y)$` and a `$$` block
  opens with at least two `.katex` elements and no literal `$E(y)$` text.
- **NR-8** A note created with `{json: null, html: '', md: 'NR8 body'}` opens showing
  "NR8 body".
- **NR-9** A note created with only `{md: 'NR9 body'}` (no `json` key) opens showing
  "NR9 body". (First run found it opened blank: the editor's `value` defaults to `''`, so a
  missing `json` never looked null. Fixed 2026-09-25: `sanitize_note_data` adds `json: null`
  to markdown-only notes.)
- **NR-10** Editing and saving a note with math keeps `$x^2$` and `$$` in the stored
  `data.content.md`. (First run found saving dropped every formula from the markdown:
  Turndown discards empty elements before rules run, and math nodes are empty placeholders.
  Fixed 2026-09-25 in `RichTextInput.svelte`.)
- **NR-11** Download → PDF document: with `window.open` wrapped so the popup's `print()` is
  captured, the captured HTML has `html.outis-light`, the note title as `<h1>`, `.katex`
  elements, and a `@page` rule.
- **NR-12** Download → PDF with the popup blocked (`window.open` returns `null`) shows the
  toast "Could not open the print window. Check your popup blocker."

## Test hooks

- Editor root: `.ProseMirror#note-<id>`. Math: `[data-type="inline-math"] .katex`,
  `[data-type="block-math"] .katex-display`.
- Note menu → "Download" → "PDF document (.pdf)".

## Known limits (pinned, not bugs to fix now)

- `'$5 and $x$ ok'` parses `5 and ` as math: the price guard only checks the character after
  the closing `$`. Documented, not tested.
- A tool-written note downloaded from the Notes list before it is ever opened has
  `html: ''`, so the raster PDF has a title and no body. Out of scope until fixed.
