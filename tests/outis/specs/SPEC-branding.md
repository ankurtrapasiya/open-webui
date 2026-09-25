# Spec: branding

Fork commit: fccf19520 (rebrand as Outis). Since v0.11.4 much of the English UI text lives
under `settings.*` i18n keys, so part of the rebrand is in
`src/lib/i18n/locales/en-US/translation.json` values.

Licence note: the Open WebUI licence allows changing its branding for deployments with at most
50 end users in any 30 days. This instance is a small private deployment. Strings that refer to
the upstream project, community or company ("Made by Open WebUI Community", "Open WebUI Inc.",
the sponsorship line) keep the upstream name on purpose and are not tested.

## Acceptance criteria

API (no `WEBUI_NAME` set in the test container):

- **BR-1** `GET /api/config` → `name` is `Outis`.
- **BR-2** `GET /manifest.json` → `name` and `short_name` are `Outis`.
- **BR-3** `GET /opensearch.xml` contains `<ShortName>Outis`.
- **BR-4** With `WEBUI_NAME=Foo` in the container environment, `/api/config` `name` is exactly
  `Foo` (no " (Open WebUI)" suffix). Runs in a second, short-lived container.
- **BR-5** A chat to a failing model connection (fake server returns 500) returns an error
  detail containing `Outis: Server Connection Error`.

Browser:

- **BR-6** Page title is `Outis`; the sign-in page says "Outis" (e.g. "Get started with
  Outis" on first run).

Unit (vitest):

- **BR-7 [KNOWN BUG]** `static/static/site.webmanifest` names the app `Outis`. Today it still
  says "Open WebUI" (a leftover; the live manifest is `/manifest.json`, covered by BR-2).
- **BR-8 [KNOWN BUG]** The community-sharing setting description refers to the Open WebUI
  community, which is what it means. Today it says "Outis community".
- **BR-9** `APP_NAME` in `src/lib/constants.ts` is `Outis`.
- **BR-10** In en-US `translation.json`, these `settings.*` values say `Outis` and not
  `Open WebUI`: STT model description, TTS model description, LDAP group mapping, OAuth
  group mapping, OAuth role mapping, both Jupyter auth descriptions, help description.
- **BR-11** A guard for new upstream strings: every en-US value containing `Open WebUI` is on
  an allow-list of intentional upstream references. A new upstream string that names the
  instance fails this test, which tells the next rebase to decide: rebrand it or allow-list
  it.
