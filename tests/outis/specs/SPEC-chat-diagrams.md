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

Unit (vitest, `marked.lexer`):

- **CD-1** `'Intro\n\n<div class="outis-diagram"><svg …>…</svg></div>\n\nAfter'` lexes to
  paragraph, html, paragraph, and the html token contains `outis-diagram`.
- **CD-2** The same without a blank line before the div still yields an html token.

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
