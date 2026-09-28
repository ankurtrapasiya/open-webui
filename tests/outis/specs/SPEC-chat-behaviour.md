# Spec: chat-behaviour

Fork commits: 286f7e072 (show tool-result images to the reader), the tool-result PDF viewer and download links, 582afde74 (name a
tool-result image after what the tool read), f993e8fd4 (send each attached document once),
67ae4033a (keep selected skills across messages), 5a2aa312d (suggestions grow; no floating
menu on focus), 0ccac7c7d (suggestion click does not select the whole prompt), 388c5204c
(no focus ring on the composer; covered in SPEC-theme TH-17).

## Tool-result images

With native function calling, a tool that returns a `data:image/…` value has the image
uploaded once, given to the model as an input image, and shown to the reader in the tool-call
display. The file is named after the first non-empty tool argument among `name`,
`filename`, `path`, `file` (basename, stem only, plus the extension from the MIME type),
else after the tool, else `tool-image`.

Test setup: a workspace Tool `read_figure(path)` returning a 1×1 PNG data URI, and the fake
OpenAI server scripted to call it on turn 1 and answer in text on turn 2.

- **CB-1** In a saved chat, the assistant message's `function_call_output` has
  `files[0].url` matching `/api/v1/files/<id>/content`, and no `data:` string appears
  anywhere in the stored chat.
- **CB-2** That file's `meta.name` is `figure1.png` when called with
  `path: "plots/figure1.png"`.
- **CB-3** Name fallbacks: no path-like argument → `read_figure.png`; a JPEG → `.jpg`.
- **CB-4** Opening the chat shows the stored image file (`img[src="/api/v1/files/<id>/content"]`)
  to the reader.
- **CB-5 [KNOWN BUG] [NOT AUTOMATED]** With tool approval on, the approved-call path must show
  and name the image the same way. Today it hides it and names it `generated-image.png`. The
  test is `fixme`: approving a call through the API leaves it `queued` with no output, so the
  resume needs a browser-driven test. Until then the gate does not cover this path.

## Tool-result PDFs and download links

A tool that returns a `data:application/pdf;base64,…` value has the PDF stored once as a
file, named the same way as an image, and attached to the tool output as
`{type: 'file', url, content_type: 'application/pdf', name}`. The model gets a one-line
summary instead of the base64. The reader can open it inline (existing `PDFViewer`), and
every tool image or PDF shows its full URL (`origin + /api/v1/files/<id>/content`) as a
download link with a Copy button. Test setup: `read_report(path)` on the same workspace Tool,
returning a one-page PDF reading "Outis report".

- **CB-16** `files[0]` is a stored `/api/v1/files/<id>/content` with
  `content_type: application/pdf`, named `report.pdf` for `path: "out/report.pdf"`; no
  `data:application/pdf` in the stored chat; the model's output says the PDF was shown.
- **CB-17** Opening the chat and clicking `View report.pdf` renders the page: the text
  "Outis report" is visible inside `.tool-result-pdf`.
- **CB-18** For both an image and a PDF, `.tool-result-file-link a` has the absolute URL as
  both `href` and text, and a `download` name ending `.png` / `.pdf`.

- **CB-19** Two tool calls in one turn (`CALL read_figure …` twice; the fake model emits
  one call per `CALL` line) both store an image, and both images are visible on opening the
  chat without expanding the "2 tool calls" group. Several calls in one turn are how
  ml4t-env's figures arrive (one `file()` per figure); the group used to render its calls'
  files only while expanded, so every figure was hidden. The group now draws its calls' files
  below itself (`ToolResultFiles.svelte`), as it already did for embeds.

Not covered: ml4t-env's `/file` returns a `.pdf` as text, not bytes, so PDFs from that
container do not reach this path until its `IMAGE_TYPES` gains `.pdf` (container frozen
until 25 Dec 2026).

## Documents sent once

`get_source_context` in `backend/open_webui/utils/middleware.py` emits each
`(source id, document text)` pair once, keeping citation numbering.

Test by `docker exec` into the test container, calling the function directly.

- **CB-6** The same source passed twice → its text appears once in the output, with id 1.
- **CB-7** Two different chunks of one source → both appear.
- **CB-8** The same text under two different source ids → appears twice, ids 1 and 2.

## BibTeX files load as text

The live instance extracts documents with Docling, which rejects `.bib` ("File format not
allowed"). Browsers send `.bib` as `application/octet-stream` or no type, so only the
extension marks it as text: `bib` is in `known_source_ext`
(`backend/open_webui/retrieval/loaders/main.py`), which reads it locally with `TextLoader`
whatever the engine.

- **CB-23** `Loader(engine='docling', DOCLING_SERVER_URL=<unreachable>)` loads
  `references.bib` sent as `application/octet-stream` and returns its text, without calling
  Docling.

## Skills persist across messages

- **CB-9** Turn a skill on in the composer, send two messages: both
  `/api/chat/completions` request bodies contain its id in `skill_ids`, and the skills
  button still shows 1 after each send.
- **CB-10** Starting a new chat clears the selected skills (the commit keeps skills across
  messages in one chat and resets them where a reset is the point).

## Composer suggestions

Settings for these tests: `ui.showFormattingToolbar = true`,
`ui.insertSuggestionPrompt = true`, and 8 suggestions set through
`POST /api/v1/configs/suggestions`.

- **CB-11** All 8 suggestion chips are visible without scrolling the suggestion list
  (`scrollHeight <= clientHeight`).
- **CB-12** Focusing the empty chat input does not create `#floating-menu`.
- **CB-13** Clicking a plain-text suggestion leaves the selection collapsed with the cursor at
  the end of the prompt, and the formatting bubble menu stays hidden.
- **CB-14** Selecting typed text does show the bubble menu (the menu still works).
- **CB-15** A pool longer than 20 (a book model has one prompt per chapter) shows exactly 20
  chips, a different random 20 after a reload, and typing searches the whole pool: a prompt
  that was not among the 20 appears when its text is typed.

## Wrap long lines in code blocks

Every fenced code block (```` ``` ````) in a chat has a **Wrap** button in its header, next to
Collapse. On, long lines wrap to the block's width instead of scrolling sideways; the button
reads **No wrap** and `aria-pressed="true"`. It works for the editable view (CodeMirror,
`EditorView.lineWrapping`), the read-only view (`<pre>`) and diff blocks. The last choice is
kept in `localStorage['outis-wrap-code']` and is the starting state of every block after it.

- **CB-20** A chat whose answer holds a code block with one 400-character line: the editor
  scrolls sideways (`.cm-scroller` `scrollWidth > clientWidth`) and the button says `Wrap`.
- **CB-21** Clicking `Wrap` makes the same block fit (`scrollWidth <= clientWidth`), the
  `.cm-content` has class `cm-lineWrapping`, and the button says `No wrap` with
  `aria-pressed="true"`.
- **CB-22** After a reload the block opens already wrapped; clicking `No wrap` scrolls it
  sideways again and stores `false`.

## Notes for the test author

The fake server must record requests so CB-9 and the tool tests can assert what the backend
sent. Temporary chats (`temporary:` ids) keep images inline by design; do not use them for
CB-1..4.
