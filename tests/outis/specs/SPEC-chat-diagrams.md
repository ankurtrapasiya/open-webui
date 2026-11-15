# Spec: chat-diagrams

Fork commits: e8d70a889 (render diagrams inline), a0858719d (match the wrapper, not the svg
tag), ad90f2691 (native size), 7e6fc78ca (mindmap tints in light theme), f2e4249b7 (fit
diagrams into the chat PDF).

## Behaviour

The Kroki filter (repo `outis-mneme`, out of scope here) replaces a diagram fence in an
assistant message with `<div class="outis-diagram"><svg …>…</svg></div>`. The chat renders
that block as live, sanitised SVG inside a horizontally scrollable wrapper, at the SVG's own
width. SVG colours use `var(--outis-diagram-*)` so the theme reaches them; the light theme
defines the variables, the dark values are the fallbacks baked into the SVG. The chat PDF
export scales diagrams to the page width and avoids splitting one across a page break.

Tests inject the post-filter HTML directly into a chat created through the API.

## Acceptance criteria

Markdown parsing (checked through what renders):

- **CD-1** `'Intro\n\n<div class="outis-diagram"><svg …>…</svg></div>\n\nAfter'` renders the
  intro paragraph, one live diagram, and the after paragraph.
- **CD-2** The same without a blank line before the div still renders the diagram.

Browser (chat created with a 1300×300 test SVG in the assistant message):

- **CD-3** `.outis-diagram > svg` is a live SVG element; the message text contains no literal
  `<svg`.
- **CD-4** Native size: the SVG's rendered width is 1300px, its computed `max-width` is
  `none`, and the wrapper scrolls (`scrollWidth > clientWidth`).
- **CD-5** Sanitising: a `<script>` inside the SVG does not run and is not in the DOM.
- **CD-6** Light theme: `--outis-diagram-b1-tint` resolves to `#dcede9` on `.outis-diagram`,
  and a rect filled with `var(--outis-diagram-b1-tint, #123)` computes to
  `rgb(220, 237, 233)`.
- **CD-7** Dark theme: the same rect computes to its fallback colour, proving the variable is
  what changes.
- **CD-8** Chat PDF: with a `MutationObserver` watching for the off-screen export clone, the
  cloned SVG has inline `max-width: 100%` and is at most 800px wide; the on-screen original
  is still 1300px afterwards; a `.pdf` download happens.
- **CD-9** CD-8 holds from both entry points: the chat header menu (`aria-label="Chat
  actions"`) and the sidebar chat menu. The export code is duplicated in the two menus, so a
  rebase can update one and miss the other.

## Test hooks

`.outis-diagram`, `.outis-diagram > svg`; menu path "Download" → "PDF document (.pdf)".

## Known limits (pinned, not tested)

- A blank line inside the filter's SVG splits the html block. The filter must not emit one.
- The page-break logic is inline in two Svelte files and cannot be unit-tested without
  extracting it. Extraction is an "ask first" change.
- Diagram HTML is sanitised with plain DOMPurify, not the stricter `sanitizeSvg`, so an
  external `<image href>` would still load. Recorded for a later hardening task.

## Viewer (2026-11-15, diagram readability)

- **CD-4** (rewritten) The SVG keeps its native size (`width` attribute, `max-width: none`) inside
  the viewer; zoom is a transform on the stage, so labels are drawn at full size.
- **CD-10** A wide diagram opens fitted (viewer no wider than its column, zoom < 1); Zoom in
  grows it, Fit restores it, double-click doubles it.
- **CD-11** Over an unclicked diagram the wheel scrolls the chat; after a click it zooms.
- **CD-12** A diagram narrower than the column stays at 1.00 with only the Full screen control.
- **CD-13** Zoom transforms `[data-diagram-stage]`, never `.outis-diagram > svg` (export copies it).
- **CD-14** Full screen opens `dialog "Diagram"` holding the SVG; Escape closes it.
- **CD-8/9** (changed) The PDF clone also undoes the viewer's stage transform and fixed height.
- **CD-15** Spark sets its own diagram root (fill #1a2a0d, text #a4e100, border #76b900), arrow and border; FT its root (#f5ebdd / #005b7f) and line colour. A theme switch recolours the full-screen view too.
- **CD-16** Outis Dark/Light mind map root label uses the accent (blue-400 / #1a588f), not the retired mint fallback; double-click zoom leaves no text selected.
- **CD-17** A tap on a non-zoomable diagram keeps `touch-action: pan-y`; the full-screen view (mounted on body, above the sidebar) zooms on the wheel without a prior click.

## Picture polish (2026-11-15, live graph plan Task 5)

- **CD-18** Panning is clamped: at least a quarter of the scaled drawing stays in the box on each axis.
- **CD-19** The toolbar (`[data-diagram-toolbar]`) is visible at rest (opacity ≥ .5); button zooms and
  Fit set `data-easing="true"` (180 ms transform transition); wheel and drag clear it. Reduced motion
  disables easing.
- **CD-20** Zoomed past fit, the box grows to `min(natural × zoom, 75% of the window)`; a
  `[data-zoom-pill]` shows the zoom as a percentage.
- **CD-21** The viewer sits on `--outis-code-bg` with a 1px `--outis-code-border` hairline, stock radius.
- **CD-7** (changed) Outis Dark now defines the branch tokens, so a baked `var(--outis-diagram-b1-tint, …)`
  resolves to the token (#1b302c) rather than its fallback.
