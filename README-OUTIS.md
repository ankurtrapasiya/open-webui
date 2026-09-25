# Outis: this fork

This repository is a fork of [Open WebUI](https://github.com/open-webui/open-webui), branch
`theme/outis-mneme`. It adds features upstream does not have (listed below) and takes every
new upstream release by rebasing onto it. This file is fork-only, so it never conflicts with
upstream's `README.md`.

The live instance runs from `~/GithubProjects/outis-mneme` (docker compose, port 3001).

## The one rule

**A new image reaches the live instance only through the regression gate.**

```
rebase onto the new upstream tag → push
  → GitHub builds the image and runs the regression suite on it (red = a fork feature broke)
  → outis-mneme/scripts/deploy_owui.sh <short-sha>
       1. runs the suite again locally, in a throwaway container   ── any failure → STOP,
       2. backs up the live database                                  live instance untouched
       3. points docker-compose.yml at the new image, restarts
       4. waits until it is healthy
```

Never edit the image tag in `docker-compose.yml` by hand, and never skip, loosen or delete a
failing check to get a deploy through. A red check means the feature is broken: fix the
feature (or the rebase), then deploy.

## Upgrading to a new upstream release

```bash
cd ~/GithubProjects/open-webui
git fetch upstream --tags
git branch backup/theme-pre-vX.Y.Z                  # the way back
git rebase vX.Y.Z                                   # resolve conflicts, keep fork behaviour
NODE_OPTIONS=--max-old-space-size=8192 npx vite build   # compiles? (default heap runs out)
git push --force-with-lease origin theme/outis-mneme
gh run watch -R ankurtrapasiya/open-webui           # image build + regression job must be green
~/GithubProjects/outis-mneme/scripts/deploy_owui.sh <short-sha>
```

`<short-sha>` is the first 7 characters of the pushed commit (`git rev-parse --short=7 HEAD`);
the image tag is `ghcr.io/ankurtrapasiya/open-webui:outis-mneme-<short-sha>`.

Things that went wrong in past rebases:

- Upstream moves English UI text into i18n keys. The Outis rebrand then has to move into
  `src/lib/i18n/locales/en-US/translation.json` values.
- Locale JSON conflicts: keep upstream's lines, add only the keys the fork commit adds.
- A commit and its later revert can both be dropped instead of replayed.

## The regression suite

Specs (what is checked, one numbered criterion per behaviour): `tests/outis/specs/`, starting
with `SPEC.md`. Tests: `tests/outis/e2e/` (Playwright) and `tests/outis/unit/` (vitest). Test
titles start with the criterion id (`NF-4`, `TH-12`), so a failure names what broke.

```bash
scripts/outis-regression.sh ghcr.io/ankurtrapasiya/open-webui:outis-mneme-<short-sha>
```

It starts the image as a throwaway container on `127.0.0.1:3099` with its own empty database,
signs up a test admin, runs the suite, and removes the container and database whether it
passes or fails. It never talks to the live instance (the config refuses port 3001 and the
Tailscale host) and never calls a real AI model.

When a fork feature is added or changed: add or update its criterion in the spec and its test
in the same change.

| Module | What it protects |
|---|---|
| `notes-drafts` | Save on demand, Ctrl+S, ask before leaving, Escape keeps the draft |
| `notes-folders` | Notes in folders: create, move, delete a folder |
| `notes-navigation` | Previous/next note, Alt+Up/Down, remembered sort |
| `notes-render` | LaTeX in notes, markdown-only notes, math kept on save, print to PDF |
| `chat-diagrams` | Diagrams inline at native size, themed, chat PDF fit |
| `chat-behaviour` | Tool images shown and named, documents sent once, skills kept, composer |
| `theme` | Outis-Dark/Light, fonts, one-ratio type scale, flat shape, focus, code blocks |
| `branding` | "Outis" wherever the instance names itself |

All eight are tested (about 100 checks, 3–4 minutes). One check is not automated yet: CB-5,
tool images after a tool-approval, which needs a browser-driven test.

The suite starts a small fake model server (`tests/outis/support/fake-openai.ts`) that the test
container is pointed at, so chat features run with scripted replies and no real model.

Checks marked `[KNOWN BUG]` in the specs describe a bug that still exists. Their tests are
written as expected failures and turn red the day the bug is fixed, as a reminder to update
them.

## Fork features

- **Themes**: Outis-Dark (default) and Outis-Light; seven monospace faces (IBM Plex Mono
  default); one ratio drives every text size; flat corners. Design notes:
  `OUTIS_DARK_THEME_SPEC.md`, `OUTIS_LIGHT_THEME_SPEC.md`, `OUTIS_DARK_CONSISTENCY_SPEC.md`.
- **Notes**: folders, previous/next stepping, draft editing with save on demand, LaTeX, print
  to PDF with real text.
- **Chat**: diagrams rendered inline (by the Kroki filter in `outis-mneme`), tool-result
  images shown to the reader and named after what the tool read, attached documents sent
  once, selected skills kept across messages.
- **Branding**: the instance calls itself Outis. Allowed by the Open WebUI licence for
  deployments of at most 50 users in any 30 days; strings about the upstream project,
  community or company keep the upstream name.

## Where things live

| What | Where |
|---|---|
| Fork branch | `theme/outis-mneme` (backups: `backup/theme-pre-v*`) |
| Image | `ghcr.io/ankurtrapasiya/open-webui:outis-mneme-<short-sha>`, built by `.github/workflows/docker-outis-mneme.yaml` |
| Live compose, deploy and backup scripts | `~/GithubProjects/outis-mneme` (`scripts/deploy_owui.sh`, `scripts/backup_owui.sh`) |
| Nightly database backups | `~/backups/owui/` (kept 14 days; `keep-*` files are never rotated) |
| Diagram renderer (Kroki filter) | `~/GithubProjects/outis-mneme/services/kroki/` |
