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

Unit (vitest, `editorMarked.parse`):

- **NR-1** `'$$\n\\frac1n\n$$'` → a `div[data-type="block-math"][data-latex="\frac1n"]`.
- **NR-2** `'a $x^2$ b'` → a `span[data-type="inline-math"][data-latex="x^2"]`.
- **NR-3** `'$5 and $10'` → no inline math (prices are not math).
- **NR-4** `'$a<b$'` → `data-latex="a&lt;b"` (escaped).
- **NR-5** `'- [ ] x'` → a task item with `data-checked="false"`.
- **NR-6** Registering the chat's KaTeX extension on the global `marked` does not change
  `editorMarked.parse('$x$')` (the original bug).

Browser:

- **NR-7** A note created through the API with `md` containing `$E(y)$` and a `$$` block
  opens with at least two `.katex` elements and no literal `$E(y)$` text.
- **NR-8** A note created with `{json: null, html: '', md: 'NR8 body'}` opens showing
  "NR8 body".
- **NR-9** A note created with only `{md: 'NR9 body'}` (no `json` key) opens showing
  "NR9 body".
- **NR-10** Editing and saving a note with math keeps `$x^2$` and `$$` in the stored
  `data.content.md`.
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
