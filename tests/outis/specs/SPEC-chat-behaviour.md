# Spec: chat-behaviour

Fork commits: 286f7e072 (show tool-result images to the reader), 582afde74 (name a
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
- **CB-4** The image is visible in the browser inside the expanded tool call
  (`[id$="-tool-call-result-0"] img`).
- **CB-5 [KNOWN BUG]** With tool approval on, the approved-call path must show and name the
  image the same way. Today it hides it and names it `generated-image.png`.

## Documents sent once

`get_source_context` in `backend/open_webui/utils/middleware.py` emits each
`(source id, document text)` pair once, keeping citation numbering.

Test by `docker exec` into the test container, calling the function directly.

- **CB-6** The same source passed twice → its text appears once in the output, with id 1.
- **CB-7** Two different chunks of one source → both appear.
- **CB-8** The same text under two different source ids → appears twice, ids 1 and 2.

## Skills persist across messages

- **CB-9** Turn a skill on in the composer, send two messages: both
  `/api/chat/completions` request bodies contain its id in `skill_ids`, and the skills
  button still shows 1 after each send.
- **CB-10** Navigate to another chat and back before sending: the skill is still selected.

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

## Notes for the test author

The fake server must record requests so CB-9 and the tool tests can assert what the backend
sent. Temporary chats (`temporary:` ids) keep images inline by design; do not use them for
CB-1..4.
