# Spec: chat-render

How an assistant answer's code blocks, HTML and media render in the chat. Fork commit: the one
adding this file (inline HTML embeds, always-expanded code, one-line video tags).

## Behaviour

- A finished ` ```html ` or ` ```svg ` block runs **inline in the message**, in a sandboxed
  iframe (`allow-scripts`, no `allow-same-origin`) titled "Interactive content", above its
  code. The Artifacts side panel no longer opens by itself; a block's Preview button still
  opens it. (`CodeBlock.svelte`, `ContentRenderer.svelte`)
- An embed without `allow-same-origin` cannot be measured from outside, so
  `FullHeightIframe` appends a small script to every such embed (inline html/svg blocks and
  tool `HTMLResponse` embeds alike) that posts `{type: 'iframe:height'}`, capped at 3000px.
  Inline blocks start at 480px. (Found 2026-10-01: Visuals Toolkit charts sat in the 150px
  iframe default, cut off.)
- Code blocks always open expanded. The user setting "Collapse code blocks"
  (`collapseCodeBlocks`) is ignored. (`MarkdownTokens.svelte`)
- `<video>url</video>` or `<audio>url</audio>` alone on a line is given its own lines
  before lexing (`blockMediaTags`, `src/lib/utils/index.ts`), because on one line marked
  splits it into inline pieces and no player renders. (Found 2026-10-01: the explainer
  video tool's reply showed as plain text.)

## Acceptance criteria

- **CR-1** An answer with an html block shows `iframe[title="Interactive content"]` inside
  the message with the block's content; no `iframe[title="Content"]` (Artifacts) appears.
- **CR-2** An embed whose body is 900px tall grows past 850px.
- **CR-3** An svg block renders inside the inline embed.
- **CR-4** Script in the embed cannot read `parent.localStorage` (sandbox, no same-origin).
- **CR-5** With `collapseCodeBlocks: true`, a python block's code is visible and no
  "hidden lines" placeholder shows.
- **CR-6** An html block's code stays visible below the embed.
- **CR-7** `<video>/api/v1/files/x/content</video>` on one line inside a paragraph renders a
  `<video>` with that src, and the surrounding text still shows.
- **CR-8** The same tag split over three lines renders a `<video>` too.
- **CR-9** The chat's `<video>` has `playsinline` and `controls`. Without `playsinline`, iOS
  Safari plays every video full-screen instead of inside the message. (Found 2026-10-01.)
- **CR-10** A tool returning a 700px-tall `HTMLResponse` shows an "Embedded Content" iframe
  taller than 650px.

## Known limits

- `blockMediaTags` runs on the whole message, so a line that is exactly `<video>…</video>`
  inside a code fence is re-wrapped onto three lines. Not tested.
- The embed is not same-origin, so libraries the app injects for same-origin embeds
  (Alpine, Chart.js) are not injected; embeds load their own from jsDelivr.
