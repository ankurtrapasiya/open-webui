# Spec: notes-drafts

Fork commit: b231eb2cd (edit notes as drafts: save on demand, ask before leaving). During
the v0.11.4 rebase it was merged with upstream's `{#key autoFormat}` editor wrapper and
upstream's `onNavigate` autosave. The fork sets `collaboration={false}` on the note editor,
which is what stops every keystroke being stored.

## Behaviour

Edits to a note body stay in the browser until the user saves: the floppy-disk Save button
(disabled when clean, amber when dirty) or Ctrl+S / Cmd+S. Leaving the note with unsaved
changes cancels the navigation and asks "Save changes?" with Save / Discard. Closing or
reloading the tab gets the browser's own leave-page prompt. Content the server pushes (the
note's own save echo, a chat editing the note) counts as saved.

## Acceptance criteria

- **ND-1** Typing in the note body does not change the stored note: after typing and waiting
  2 s, `GET /api/v1/notes/{id}` still returns the original `data.content.md`.
- **ND-2** Save button: disabled on open, enabled after typing, disabled again after clicking
  it; after saving, the API returns the new markdown.
- **ND-3** Ctrl+S saves (API returns the new markdown) and the browser's own save dialog does
  not open.
- **ND-4** Clicking a link to another page with unsaved changes opens the "Save changes?"
  dialog and stays on the note.
- **ND-5** "Save" in that dialog saves, then completes the navigation.
- **ND-6** "Discard" in that dialog leaves the stored body unchanged, then completes the
  navigation.
- **ND-7** Reloading with unsaved changes raises a `beforeunload` dialog.
- **ND-8 [KNOWN BUG]** A title-only edit followed by Discard must not persist the new title.
  Today it does: the title input saves itself on blur.
- **ND-9 [KNOWN BUG]** Pressing Escape, or clicking outside the "Save changes?" dialog, must
  keep the user on the note with the draft intact. Today it discards the draft and
  navigates away. This is the one that loses work.
- **ND-10** Toggling Formatting in the note menu (which remounts the editor) keeps the
  unsaved body text on screen.
- **ND-11** Previous/next note (`notes-navigation`) with unsaved changes also asks first.

## Test hooks

- Save: `button[aria-label="Save"]` in the editor header. The dialog's own button is also
  "Save", so scope dialog clicks to `getByRole('dialog', { name: 'Save changes?' })`.
- Dialog text "This note has unsaved changes."; buttons "Save", "Discard".
- Title: `input[placeholder="Title"]`. Editor: `#note-<id>` (`.ProseMirror`).

## Notes for the test author

The editor treats its own reformatting in the first 1.5 s after load (while not focused) as
not-an-edit. Click into the editor before typing.
