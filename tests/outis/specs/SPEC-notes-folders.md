# Spec: notes-folders

Fork commits: 1710d8c78 (notes live in folders), 0a3f235b5 (New folder action), 7d1d73e16
(delete a folder).

## Behaviour

A note's folder is a path string in `note.meta.folder` (e.g. `ML4T/Murphy`). No table, no
migration. Folders exist only as prefixes of note paths, except a new empty folder, which lives
in the browser (`localStorage.noteEmptyFolders`) until it holds a note.

The Notes page shows a folder bar (All / breadcrumb / trash) and one chip per child folder;
the open folder is remembered in `localStorage.noteFolder`. New and imported notes land in
the open folder.

## API

| Call | Contract |
|---|---|
| `POST /api/v1/notes/create` | `meta.folder` normalised if present |
| `POST /api/v1/notes/{id}/update` | `title` required; `meta.folder` normalised; `"/"` or `null` → `null` |
| `GET /api/v1/notes/folders` | sorted distinct normalised paths of notes the caller can read |
| `GET /api/v1/notes/search?folder=F` | notes in `F` and below |
| `DELETE /api/v1/notes/folders/delete?path=F` | deletes notes in `F` and below the caller can write; returns count |

Normalisation (`normalize_folder`): split on `/`, trim each part, drop empty parts, join;
empty → `null`; non-string → `null`. Case kept.

## Acceptance criteria

API (Playwright `request`):

- **NF-1** Normalisation: creating notes with folder `" a / /b/ "`, `"/"`, `""`, `"   "` stores
  `"a/b"`, `null`, `null`, `null`.
- **NF-2** `GET /notes/folders` returns each used path once, sorted, and never `""` or
  `null`.
- **NF-3** `search?folder=ML` returns notes in `ML` and `ML/Murphy` but not `ML4T` or unfiled
  notes.
- **NF-4** `folders/delete?path=ML` deletes notes in `ML` and `ML/Murphy`, returns 2, leaves
  `ML4T` and unfiled notes.
- **NF-5** `folders/delete?path=/` returns 0 and deletes nothing; a missing `path` returns
  422.
- **NF-6** A non-admin user cannot delete another user's notes through folder delete: count
  0, notes still there.
- **NF-7** Moving a note with `meta.folder = "/"` stores `null` (note leaves every folder).

Browser:

- **NF-8** Create menu → New folder → name `NF8` → the folder opens, its chip survives a
  reload, and it disappears from `noteEmptyFolders` once a note is created inside it.
- **NF-9** Note menu → Move to folder → `NF9/Sub` → the note shows under that folder; the
  folder bar breadcrumb reads `NF9 / Sub` when opened; deleting the folder from the trash
  button (confirm dialog "Delete folder?") lands in the parent `NF9` and shows
  "Deleted 1 notes".

- **NF-10** `folders/delete?path=a_b` does not delete a note in `aXb`. (The code survey
  suspected `_` would act as a SQL wildcard; a real run on SQLite showed it does not. Kept as
  a guard in case the query or database changes.)

## Test hooks

- Create menu: `aria-label="Open create menu"`, item text "New folder".
- Dialogs: `role="dialog"` named "New folder", "Move to folder", "Delete folder?"; input is a
  `textarea`; confirm by clicking the button ("Create", "Move", "Confirm"), not Enter.
- Folder trash: `aria-label="Delete folder"`. Row menu: `aria-label="Note Menu"`.

## Out of scope

Admin bypass (an admin can delete every user's notes in a path) is upstream access-control
behaviour, not a fork feature.
