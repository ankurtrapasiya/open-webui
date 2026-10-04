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
- `FullHeightIframe` also injects the app theme into every embed: `data-outis-theme` and
  `--outis-font` on `<html>`, updated live on theme switches. Tool UIs style against it
  (outis-mneme's QuizUI does: `services/quizui/quizui.py`, themes `outis_light`/`outis_dark`).
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
- **CR-6** Once an html/svg block's embed is drawn, its code is folded ("N hidden lines",
  Expand button); Expand shows it. While the block streams, the code shows. (Changed
  2026-10-04 from "code stays visible", to match the folded diagram source.)
- **CR-7** `<video>/api/v1/files/x/content</video>` on one line inside a paragraph renders a
  `<video>` with that src, and the surrounding text still shows.
- **CR-8** The same tag split over three lines renders a `<video>` too.
- **CR-9** The chat's `<video>` has `playsinline` and `controls`. Without `playsinline`, iOS
  Safari plays every video full-screen instead of inside the message. (Found 2026-10-01.)
- **CR-10** A tool returning a 700px-tall `HTMLResponse` shows an "Embedded Content" iframe
  taller than 650px.
- **CR-12** A display equation spread over several lines, with a line holding only `=` between
  two matrices, renders as one KaTeX display block: no heading, no raw `\begin{bmatrix}`. A `$$`
  block likewise; a python fence is untouched. (Found 2026-10-01: the lone `=` was read as a
  setext heading underline, so the Wolfram Tutor's Bellman system showed as raw LaTeX under a big
  heading. `joinDisplayMath` in `src/lib/utils/index.ts` joins each display block onto one line
  before lexing, skipping fenced code.)
- **CR-13** A formula whose thousands separator lost its `,}` (`$€1{000,000$`,
  `$$€100{000{000$$`) renders as KaTeX with no `.katex-error`. (Found 2026-10-03: mercury-2.5
  writes `10{,}000{,}000` as `10{000{000` about one reply in three; the unclosed `{` was a red
  parse error. `repairLatex` in `katex-extension.ts` puts `{,}` back, only when braces
  do not balance.)
- **CR-14** A formula with every backslash doubled (`$IC \\times \\sqrt{BR}$`) renders as
  KaTeX with a real square root and no "times" text. A matrix `\\` next to single-backslash
  commands is untouched. (Found 2026-10-03: mercury-2.5 doubles backslashes as if JSON-escaping;
  KaTeX read `\\` as a line break. `repairLatex` halves them only when no single-backslash
  command is present.)
- **CR-11** Every embed gets `data-outis-theme` ("dark"/"light", from the app's `dark` class)
  and `--outis-font` on its `<html>`; switching the app theme updates it live via an
  `{type: 'outis:theme'}` message, with no reload (a quiz in progress keeps its state).
- **ML-1** (`math-latex.spec.ts`, skips without outis-mneme) With outis-mneme's global
  "Math as LaTeX" filter active, a chat with any model sends a system message containing the
  `[math-as-latex]` rule exactly once.
- **FM-1** (`code-format.spec.ts`, skips without outis-mneme) With the global "Format code"
  outlet filter active, a finished reply's ` ```python ` block is saved Black-formatted
  (`lik*prior` → `lik * prior`), an invalid snippet is left as written, and the chat shows the
  formatted text. The fake model's `ECHO` line makes it reply with fixed text.
- **QZ-1** (`quiz-theme.spec.ts`, skips without outis-mneme) The themed QuizUI tool's body is
  `#090d0c` in dark and `#fafdfc` in light, following a live switch both ways.

## Known limits

- `blockMediaTags` runs on the whole message, so a line that is exactly `<video>…</video>`
  inside a code fence is re-wrapped onto three lines. Not tested.
- The embed is not same-origin, so libraries the app injects for same-origin embeds
  (Alpine, Chart.js) are not injected; embeds load their own from jsDelivr.
