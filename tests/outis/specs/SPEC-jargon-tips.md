# Spec: jargon-tips

A technical term in a reply carries a one-line plain meaning the reader sees on hover, focus or
tap. Fork commit: the one adding this file. Design and the rest of the pipeline (the reading-guide
rule that makes models write the markup, the glossary filter that swaps in verified meanings):
`outis-owui/docs/specs/jargon-tips.md`.

## Behaviour

- Markup, written by the model or by the glossary outlet filter:
  `[term]{tip="plain meaning"}`, optional `src="where it comes from"`, optional bare `ai`.
  Same shape as the equation card's `[text]{.class}`. (`src/lib/utils/marked/tip-extension.ts`)
- The term renders with a dotted underline (the equation card's cue for a term) and a floating
  box with the meaning, shown on hover, keyboard focus or tap (tap toggles, Escape closes).
  The box is `position: absolute`, so opening it moves nothing. (`TipToken.svelte`,
  `outis-theme-shared.css` "Jargon tips")
- `src` shows as a muted line under the meaning; `ai` adds a small "AI" chip, so the reader
  knows the meaning is the model's, not from their notes.
- Surfaces use the `--o-*` card tokens, so the box matches the equation and seed cards in both
  themes. Near the right edge the box shifts left to keep a 16px gutter.
- Not a tip: an unquoted or empty `tip`, markup inside inline code, and `[text](url)` links.
  Malformed markup is left as written; nothing breaks.

## Acceptance criteria

- **JT-1** `[gradient]{tip="…"}` renders a `.o-tip` with dotted underline; its `.o-tip-box` is
  hidden until hover, then shows exactly the tip text; `{tip=` never appears in the message.
- **JT-2** `src="…"` renders in `.o-tip-src`; `ai` adds class `o-tip-ai` and the box's `::after`
  reads `AI`.
- **JT-3** Focus shows the box, Escape hides it; a click toggles `o-tip-open`.
- **JT-4** Opening a tip leaves the bounding box of the following paragraph unchanged.
- **JT-5** Unquoted `tip`, a markdown link and inline code are not turned into tips.
- **JT-6** The box background is the code surface in both themes (`#f3f0ea` light, `#211d1a`
  dark).
