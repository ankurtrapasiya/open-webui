# Spec: Outis regression suite

## Objective

This fork (branch `theme/outis-mneme`) carries features that upstream Open WebUI does not have.
The owner takes every upstream release by rebasing onto it. A rebase can silently drop or
break a fork feature: a conflict resolved the wrong way, an upstream refactor that moves the
code the feature hooks into, a string moved to a new i18n key.

This suite answers one question after every rebase: **does every fork feature still work?**
It runs against the image CI built from the rebased branch, before that image replaces the
live one. A red run blocks the deploy.

Success looks like this: after a rebase, one command runs in under 10 minutes and either
passes, or names the broken feature and the acceptance criterion it broke.

## Capability map

| Module id | Protects | Spec |
|---|---|---|
| `notes-folders` | Notes in folders: create, move, delete a folder | [SPEC-notes-folders.md](SPEC-notes-folders.md) |
| `notes-navigation` | Previous/next note, Alt+Up/Down, remembered sort | [SPEC-notes-navigation.md](SPEC-notes-navigation.md) |
| `notes-drafts` | Save on demand, Ctrl+S, ask before leaving | [SPEC-notes-drafts.md](SPEC-notes-drafts.md) |
| `notes-render` | LaTeX in notes, chat-written notes, note PDF/print | [SPEC-notes-render.md](SPEC-notes-render.md) |
| `chat-diagrams` | Inline diagrams at native size, chat PDF fit | [SPEC-chat-diagrams.md](SPEC-chat-diagrams.md) |
| `chat-behaviour` | Tool images, document dedupe, skills persist, composer UX | [SPEC-chat-behaviour.md](SPEC-chat-behaviour.md) |
| `theme` | Outis-Dark/Light, fonts, type scale, surfaces, focus, CodeMirror | [SPEC-theme.md](SPEC-theme.md) |
| `branding` | "Outis" everywhere the instance names itself | [SPEC-branding.md](SPEC-branding.md) |

No module depends on another. Build order is by risk: notes → chat → theme → branding.

Every acceptance criterion has a stable id (`NF-3`, `TH-12`, ...). A test's title starts with
the id it checks, so a failure report names the criterion directly.

## Tech stack

- **Playwright** (`@playwright/test`, Chromium only) for browser and HTTP API tests. New dev
  dependency; approved.
- **vitest** (already in the repo, `npm run test:frontend`) for pure TypeScript helpers.
- **A fake OpenAI-compatible server** (small Node HTTP server started by Playwright's global
  setup) for the few features that need a model turn: tool calls, skills, document context.
  It returns scripted responses and records every request it receives.
- **`docker exec` into the test container** for pure backend functions that have no HTTP
  surface (e.g. `get_source_context`).
- No Python test stack on the host. The backend's dependencies stay inside the image.

## Commands

```
# Full suite against an image (what the upgrade procedure runs)
scripts/outis-regression.sh ghcr.io/ankurtrapasiya/open-webui:outis-mneme-<sha>

# Unit tests only (no container)
npx vitest run tests/outis/unit

# Browser/API tests against an already-running test container
OUTIS_BASE_URL=http://localhost:3099 npx playwright test -c tests/outis/playwright.config.ts
OUTIS_BASE_URL=... npx playwright test -c tests/outis/playwright.config.ts -g "NF-"   # one module
```

`scripts/outis-regression.sh <image>`:
1. Starts the image as container `outis-regression` on port 3099 with a new, empty named
   volume, `WEBUI_AUTH=true`, `OPENAI_API_BASE_URL` pointing at the fake server, and no
   `WEBUI_NAME` override.
2. Waits for `/health`.
3. Runs vitest, then Playwright.
4. Always removes the container and its volume, pass or fail.
5. Exits non-zero on any failure and prints the failing criterion ids.

## Project structure

```
tests/outis/
  specs/                 ← these specs (source of truth for what is tested)
  unit/                  ← vitest: pure TS helpers
  e2e/                   ← Playwright: one file per module, e.g. notes-folders.spec.ts
  support/
    api.ts               ← typed helpers: signup admin, create user, create note/chat/skill
    fake-openai.ts       ← scripted OpenAI-compatible server
    fixtures.ts          ← Playwright fixtures: logged-in page, theme, seeded data
  playwright.config.ts
scripts/outis-regression.sh
```

## Test data rules

- **Never the live instance.** The suite refuses to run if `OUTIS_BASE_URL` is port 3001 or
  the Tailscale host.
- **Fresh database per run.** Global setup signs up the first user (becomes admin) and a
  second, non-admin user.
- **No real model calls.** Chats are created through `POST /api/v1/chats/new` with fixed
  content, or through the fake OpenAI server.
- **Unique titles.** Every note and chat title includes the test id, so sort ties
  (see NN-8) cannot make tests flaky.

## Code style

```ts
test('NF-4 deleting a folder removes its subfolders but not a prefix sibling', async ({ api }) => {
  await api.note({ title: 'NF-4 a', folder: 'ML' });
  await api.note({ title: 'NF-4 b', folder: 'ML/Murphy' });
  await api.note({ title: 'NF-4 c', folder: 'ML4T' });

  const deleted = await api.deleteFolder('ML');

  expect(deleted).toBe(2);
  expect(await api.folders()).toEqual(['ML4T']);
});
```

- Test title = criterion id + the behaviour in plain words.
- Assert relationships, not magic numbers, where the spec defines one (e.g. "composer size =
  reply size", not "12.75px").
- Locate by role, aria-label or visible text before CSS classes. Use a class only where the
  class *is* the contract (`.outis-diagram`, `html.outis-dark`).
- No `waitForTimeout`. Wait for a condition.

## Testing levels

| Concern | Level |
|---|---|
| Pure TS (markdown parsing, theme picker, i18n values) | vitest |
| Backend endpoints, stored data shape | Playwright `request` (HTTP API) |
| Pure backend functions with no endpoint | `docker exec python -c` from a Playwright test |
| Anything a user sees or clicks | Playwright browser |
| Features that need a model turn | Playwright + fake OpenAI server |

Screenshots are not used for pass/fail. Theme tests read computed styles.

## Known bugs

The code survey found bugs in fork features. Each has a criterion marked **[KNOWN BUG]**. Its
test is written with `test.fail()`, so it passes while the bug exists and turns red the day
the bug is fixed, which prompts removing `test.fail()`. They are listed in each module spec and
summarised in Open Questions.

## Boundaries

- **Always:** run the full suite before switching the live container to a new image; keep
  specs and tests in the fork so they move with it on every rebase; add a criterion to the
  spec before adding its test.
- **Ask first:** changing application code to make something testable (e.g. extracting the
  chat-PDF page slicer); adding any dependency beyond `@playwright/test`; deleting or
  loosening a criterion.
- **Never:** point the suite at the live instance or its volume; call a real model provider;
  skip a failing test to get a deploy through.

## Success criteria

1. `scripts/outis-regression.sh <image>` runs vitest and Playwright against a throwaway
   container and cleans up after itself, pass or fail.
2. Every criterion in the eight module specs has exactly one test whose title starts with its
   id.
3. The suite passes against the current image (`outis-mneme-f2e4249`), with known bugs
   passing as expected failures.
4. Reverting any single fork feature commit makes at least one test fail. Checked by hand
   for one commit per module.
5. Full run under 10 minutes on this machine.
6. `upstream-upgrade` procedure (memory + `outis-mneme` notes) gains the gate step.

## Open questions

1. **Known bugs, fix or pin?** The survey found these in fork features:
   - `notes-drafts`: Escape or a click outside the "Save changes?" dialog *discards* the
     draft and leaves (ND-9); a title edit saves itself without Save (ND-8).
   - `notes-folders`: `_` and `%` in a folder name act as SQL wildcards, so deleting
     `a_b` also deletes `aXb` (NF-10).
   - `chat-behaviour`: tool images on the tool-approval path are still hidden and named
     `generated-image.png` (CB-5).
   - `branding`: installed-app manifest leftover says "Open WebUI"; "Outis community" where
     the real Open WebUI community is meant (BR-7, BR-8).
   - `theme`: one sky-blue badge left in `ChannelItem.svelte` (TH-24).

   Default: pin them as `test.fail()` now and fix them as separate, small tasks after the
   suite is green. The draft-discard bug (ND-9) is the one that can lose work.
2. **Fonts need internet.** Theme fonts come from Google Fonts. Tests assert the computed
   `font-family` (works offline) and only check that the font actually loaded when online.
