---
name: upgrade-owui
description: Move the Outis fork of Open WebUI (branch theme/outis-mneme) onto a new upstream release, keep every fork feature working, and deploy it to the live instance. Use when the user says "upgrade", "upgrade to new version", "new owui version", "a new version of Open WebUI is available", names a release like v0.12.1, or asks to update/rebase Outis onto upstream.
---

# Upgrade Outis to a new Open WebUI release

The user says "upgrade to new version" and expects this whole procedure done end to end without
further questions: merge, resolve, test, add coverage, commit, deploy, report. Stop and ask only
at the points marked **ASK**.

## Repos

| Repo | Role in an upgrade |
|---|---|
| `~/GithubProjects/open-webui` (this, branch `theme/outis-mneme`) | the app: merge, resolve, build, regression suite (`tests/outis`) |
| `~/GithubProjects/outis-mneme` | live compose; `scripts/deploy_owui.sh <sha>` is the **only** way to deploy |
| `~/GithubProjects/outis-owui` | tools, filters, prompts living *inside* Open WebUI; `./test.sh` checks them against the live instance |

Remotes here: `origin` = the user's fork, `upstream` = open-webui/open-webui. Always pass
`-R ankurtrapasiya/open-webui` to `gh`; bare `gh` hits upstream.

## Why merge, not rebase or patches

A patch series (`git format-patch` + `git am`) and a rebase are the same thing: replay each of
the ~130 fork commits one by one, so one file can conflict a dozen times on states later commits
already changed. `git merge vX.Y.Z` compares the final fork against the final release once: each
conflicting file is resolved once, no force-push, and `git log vX.Y.Z..theme/outis-mneme` still
lists exactly the fork's commits. `rerere` is on, so a resolution repeated in a later upgrade is
reused. Switched from rebase to merge at v0.12.0 (2026-10-10).

## Procedure

Say before starting that it takes 1–3 hours, mostly waiting on CI.

### 1. Preflight

```bash
cd ~/GithubProjects/open-webui
git status --short                       # must be clean; if not, ASK what to do with it
git switch theme/outis-mneme && git pull --ff-only origin theme/outis-mneme
git fetch upstream --tags
NEW=$(git tag -l 'v*' --sort=-v:refname | head -1)          # or the version the user named
OLD=$(git describe --tags --abbrev=0 --match 'v*' theme/outis-mneme)
git rev-list --count $OLD..$NEW; git rev-list --count $NEW..theme/outis-mneme
git config rerere.enabled true
```

If `NEW == OLD`, tell the user there is nothing to do. Read upstream `CHANGELOG.md` for `$NEW`
and note anything touching fork areas: notes, tool calls, markdown/code blocks, themes, i18n,
uploads, memory, DB migrations. A DB migration means rollback needs the database backup.

Overlap (files both sides changed; this is where fork features break):
```bash
comm -12 <(git diff --name-only $OLD theme/outis-mneme | sort) <(git diff --name-only $OLD $NEW | sort) | grep -v /locales/
```

### 2. Back up and merge on a separate branch

```bash
git branch backup/theme-pre-$NEW theme/outis-mneme && git push origin backup/theme-pre-$NEW
git switch -c upgrade/$NEW theme/outis-mneme
git merge --no-edit $NEW
python3 scripts/outis-merge-locales.py      # resolves every conflicted translation.json
git diff --name-only --diff-filter=U        # the code conflicts left for you
```

`theme/outis-mneme` does not move until the upgrade branch is green. Never run `git stash`,
`reset`, or `checkout .` during the merge: they abort it (cost a redo at v0.12.0).

`outis-merge-locales.py` takes upstream's file, adds back keys the fork added, keeps the fork's
value where the fork changed one (the rebrand), and prints `CHECK` lines for fork-changed keys
upstream dropped or renamed: re-apply those values to the new key.

### 3. Resolve code conflicts

Look at each hunk with base: `git checkout --conflict=zdiff3 -- <file>`. Rules:

- **Upstream's structure, fork's behaviour.** When upstream moved or refactored the code, take
  theirs and re-apply the fork change at the new place (v0.12.0: tool-call execution moved to
  top-level `execute_tool_call`; the fork's `parse_tool_call_arguments` moved with it).
- **Upstream fixed the same thing:** take theirs, delete the fork's now-dead code (v0.12.0:
  `escapeAttribute` → upstream `encode`). The fork's regression test still decides.
- **Rebrand:** a literal `$i18n.t('… Open WebUI …')` is rebranded in the source string (BR-11
  scans those); a dotted key (`settings.admin.*`) is rebranded in its
  `src/lib/i18n/locales/en-US/translation.json` value (BR-10). Strings about the upstream
  project, community or company keep the upstream name (add them to BR-11's allow-list).
  The rebrand is allowed under the licence for ≤50 users per 30 days.
- **Colour classes:** the fork maps stray `sky-*` accents to `blue-*` (themed). If upstream
  rewrote such a block, take theirs and redo the substitution.
- Upstream renamed a file (v0.12.0: `routers/audio.py` → `routers/audio/__init__.py`): git
  usually carries the fork change over; check it did.

Then:
```bash
python3 scripts/outis-lost-lines.py $OLD backup/theme-pre-$NEW
```
Lists every line the fork added that is no longer in the merged tree. Each one must be explained
(moved, taken by upstream, deliberately dropped); anything unexplained is a lost fork feature: fix
it. Put the explanations in the merge commit message.

### 4. Does it compile?

```bash
python3 scripts/outis-merge-locales.py --test
uvx -q ruff check --select F821 --output-format concise backend/open_webui/   # undefined names
npm ci --no-audit --no-fund
NODE_OPTIONS=--max-old-space-size=8192 npx vite build                        # default heap OOMs
```
Compare ruff output with the same command on `$NEW` (`git stash` is forbidden mid-merge, so use
a worktree: `git worktree add /tmp/owui-$NEW $NEW`); only new findings count.
Never `pip install` or `conda install` anything (frozen course env, see `~/.claude/CLAUDE.md`);
use `uvx` or `/usr/bin/python3`.

### 5. Coverage review

For every overlap file from step 1, name the fork behaviour in it and the spec criterion
(`tests/outis/specs/`, ids like `CR-19`) that protects it. A fork behaviour with no criterion:
add the criterion to its `SPEC-*.md` and the test in `tests/outis/e2e/` in this same branch,
test title starting with the id. Also add a criterion for anything that broke in this upgrade
without a test going red. Report the mapping in the final summary (one line per file).

### 6. Commit and get an image

```bash
git add -A && git commit      # merge commit: "Merge Open WebUI $NEW into the Outis fork" + resolutions + lost-lines explanations
git push -u origin upgrade/$NEW
gh run watch -R ankurtrapasiya/open-webui $(gh run list -R ankurtrapasiya/open-webui -b upgrade/$NEW -L1 --json databaseId -q '.[0].databaseId')
```
CI ("Build the Outis-Mneme image") builds `ghcr.io/ankurtrapasiya/open-webui:outis-mneme-<sha7>`
and runs the regression suite on it. Red: read the failing criterion id, fix the feature (or the
resolution), commit, push, repeat. **Never** skip, loosen, or delete a check to get green;
**ASK** if a check itself looks wrong. After two failed fix attempts on the same check, stop
and report what was tried.

**CI did not start** (no run for the branch after a minute; `gh workflow run` says "Actions has
been disabled for this repository", seen at v0.12.0): build the same tag locally and go on; the
local suite in step 7 is the gate. Tell the user CI is blocked so they can check the GitHub
side.
```bash
# the Dockerfile's 4096 MB Node heap runs out (exit 134); CI raises it the same way
sed -E 's/--max-old-space-size=[0-9]+/--max-old-space-size=8192/' Dockerfile > /tmp/Dockerfile.ci
docker build -f /tmp/Dockerfile.ci --build-arg BUILD_HASH=$(git rev-parse HEAD) \
  -t ghcr.io/ankurtrapasiya/open-webui:outis-mneme-$(git rev-parse --short=7 HEAD) .
```
A full build takes about 30 minutes on this machine. To test a frontend-only fix fast, layer
the new `build/` onto the last image and run the suite on that; deploy only a full build:
```bash
NODE_OPTIONS=--max-old-space-size=8192 npx vite build
# rm first: COPY merges, and the old hashed chunks would stay (bundle-scanning checks see them)
printf 'FROM <last image>\nRUN rm -rf /app/build\nCOPY build /app/build\n' > /tmp/Dockerfile.layer
docker build -f /tmp/Dockerfile.layer -t outis-dev:try . && scripts/outis-regression.sh outis-dev:try
```
Rerun only some checks: `scripts/outis-regression.sh <image> -g "NF-9|BR-11" --repeat-each 3`.

### 7. Deploy

```bash
SHA=$(git rev-parse --short=7 HEAD)
~/GithubProjects/outis-mneme/scripts/deploy_owui.sh $SHA
```
It re-runs the suite locally against the image, backs up the live DB, bumps the compose tag,
restarts and waits for healthy. On a STOP nothing live changed; go back to step 6.

Then:
```bash
cd ~/GithubProjects/outis-owui && ./test.sh     # plugins/tools inside the new Open WebUI
curl -s localhost:3001/api/version              # shows $NEW
```
A red `test.sh` means an upstream API change broke a plugin: fix it in outis-owui, install
with `deploy.py --install <id>`, re-run.

### 8. Land it

```bash
cd ~/GithubProjects/open-webui
git switch theme/outis-mneme && git merge --ff-only upgrade/$NEW && git push origin theme/outis-mneme
git branch -d upgrade/$NEW && git push origin --delete upgrade/$NEW
cd ~/GithubProjects/outis-mneme && git add docker-compose.yml && git commit -m "deploy: open-webui outis-mneme-$SHA (Open WebUI $NEW)" && git push
```
Pushing `theme/outis-mneme` rebuilds the same commit (same tag, moves the floating
`outis-mneme` tag); nothing to deploy again.

Add any new trap you hit to the "Traps by release" list below, in the same commit as the
merge or a follow-up.

### 9. Report

One short message: version, regression result (pass count), what conflicted and how it was
resolved, the lost-lines explanations, coverage added, anything parked.

## Rollback

```bash
~/GithubProjects/outis-mneme/scripts/deploy_owui.sh <previous sha7>   # previous tag is in outis-mneme git log
```
If the new release migrated the database, also restore the backup `deploy_owui.sh` took
(`~/backups/owui/`, newest before the deploy): the old code may not read the migrated schema.
**ASK** before restoring a database: it discards anything written since.

## Traps by release

- **v0.11.4**: upstream moved English UI text into i18n keys (`settings.admin.*`); the rebrand
  moved into en-US values. A commit and its later revert can both be dropped.
- **v0.12.0**: 584 upstream commits, 74 conflicted files (64 locales). Tool-call execution
  refactored into top-level `execute_tool_call` (fork parser re-applied there); `structuredOutput.ts`
  got upstream's own `encode` (fork `escapeAttribute` dropped); `get_headers_and_cookies` moved to
  `utils/headers.py` (OpenRouter `X-Title: Outis` re-applied); `routers/audio.py` became a package;
  fa-IR locale writes U+200C as `‌` (script keeps escapes).
