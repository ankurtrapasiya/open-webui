# Spec: theme

Fork commits: ~30 theme commits (fb1066519 … 4a475f9a3). Design docs:
`OUTIS_DARK_THEME_SPEC.md`, `OUTIS_LIGHT_THEME_SPEC.md`, `OUTIS_DARK_CONSISTENCY_SPEC.md`.
Where those docs and the CSS disagree, the CSS is the truth (e.g. prose scale is 0.85, the
default font is IBM Plex Mono).

## Behaviour

- Themes are `<html>` classes: Outis-Dark = `dark outis-dark`, Outis-Light =
  `light outis-light`. Stored in `localStorage.theme`. A fresh browser gets `outis-dark`.
  A stored `outis-mneme` (old name) is rewritten to `outis-dark` before first paint.
- Font: `localStorage.outisFont` → `data-outis-font` on `<html>`; IBM Plex Mono is the
  default and removes the key. Seven faces. The font picker shows only under Outis themes.
- One ratio, `--outis-prose-scale` (0.85; 0.74 Azeret Mono; 0.69 Martian Mono), drives every
  text size: Tailwind `--text-*`, prose, composer, code blocks, CodeMirror, sidebar.
- All corner radii are 0. Icons have square caps and mitred joins.

Every browser test runs twice, once per Outis theme, unless it says otherwise. Values below are
dark / light.

## Acceptance criteria

Boot and switching:

- **TH-1** Fresh browser: `<html>` has `dark outis-dark`, `localStorage.theme ===
  'outis-dark'`, meta theme-color `#090d0c`, no `data-outis-font`.
- **TH-2** Stored `outis-mneme` boots as `outis-dark` and rewrites the stored value.
- **TH-3** Settings → General lists Outis-Dark and Outis-Light; choosing each applies its
  classes and theme-color (`#090d0c` / `#fafdfc`).
- **TH-4** Outis-Dark → Outis-Light → OLED Dark → Outis-Light leaves no inline
  `--color-gray-800/850/900/950` on `<html>`, and computed `--color-gray-900` is `#0e1913`.
- **TH-5** The Font picker is present under Outis themes and absent under Dark, OLED Dark and
  Light.

Typography:

- **TH-6** Default: `body` font-family starts with `IBM Plex Mono`; so does an element using
  `font-sans` (user menu).
- **TH-7** Choosing JetBrains Mono sets `data-outis-font="jetbrains-mono"` and body font
  starts with `JetBrains Mono`; after reload the attribute is present before the app mounts.
- **TH-8** Martian Mono sets computed `--outis-prose-scale` to 0.69; Azeret Mono to 0.74.
- **TH-9** One ratio: composer text size = reply prose size = code block size = CodeMirror
  size, and all of them change together when the scale changes (default → Martian Mono).
- **TH-10** Heading ladder: reply h1 = 1.18 × body, h2 = 1.09 × body, h3 = body; and
  h1 > h2 > h3 = body > `text-sm` > `text-xs`.
- **TH-11** Follow-up suggestions and `text-[0.9375rem]` elements match the reply prose size.

Shape:

- **TH-12** `border-radius` is `0px` on `.rounded-full`, `.rounded-lg`, `.rounded-xl`,
  `.rounded-2xl`, `.rounded-3xl`, the settings modal and the code block wrapper. (Toasts are not
  on screen in a test; their rule is covered by the same radius tokens.)
- **TH-13** `svg` stroke caps `square`, joins `miter`.

Surfaces and colour:

- **TH-14** Body background / text: `rgb(9, 13, 12)` / `rgb(212, 237, 226)` in dark;
  `rgb(250, 253, 252)` / `rgb(39, 55, 47)` in light.
- **TH-15** Primary filled buttons (the settings Save button) use the accent at rest: dark
  `rgb(45, 255, 143)`, light `rgb(0, 110, 67)`, text contrast ≥ 4.5:1. The lighter hover green
  appears only on hover. (First run found the dark hover colour applied at rest because one
  selector lacked `:hover`; fixed 2026-09-25.)
- **TH-16** Confirm dialog button (delete a chat): accent background, text contrast ≥ 4.5:1,
  also with `html.high-contrast` (the 4a475f9a3 regression).
- **TH-17** Focus: Tab to a button → outline colour is the accent, not stock blue. Focusing
  the composer shows no outline on `#chat-input-container` or the editor; with
  `html.high-contrast` the editor outline returns.
- **TH-18** Text selection colour: `rgba(45, 255, 143, 0.16)` in dark,
  `rgba(0, 131, 80, 0.14)` in light.
- **TH-19** Text on an accent badge (`bg-blue-500 text-white`, as the calendar's today badge
  uses) is `rgb(9, 13, 12)` in dark.
- **TH-20** `dark:text-white` renders as gray-50 `rgb(212, 237, 226)`, not pure white.

Code blocks:

- **TH-21** Code block, CodeMirror and gutters share one background: `rgb(15, 21, 18)` /
  `rgb(234, 242, 237)`; no `rgb(0, 0, 0)` seam.
- **TH-22** Clicking into a code block gives its wrapper an accent border on all four sides;
  unfocused, the border is the code-border colour.
- **TH-23** An open code editor follows the theme: switching Outis-Dark → Outis-Light while a
  code block is on screen recolours its CodeMirror to the light code background (the
  `outisEditorThemeKey` observer path).

Stray colours:

- **TH-24** No element on the chat page (with sidebar) or in settings computes to a stock
  sky-blue or stock blue-500 colour. `AlertRenderer` is allow-listed (one hue per alert type,
  on purpose). Not covered: the channel badge in `ChannelItem.svelte` still uses sky, but
  only shows on the channels page; recorded for a later fix.
- **TH-25** Emerald text classes resolve to the accent.

Light only:

- **TH-26** Favicon image `filter` is `brightness(0.431)`; splash background is
  `rgb(250, 253, 252)`.

## Notes for the test author

- Colours may come back as `oklch(...)` for unthemed tokens; normalise before comparing.
- Browser autofill cannot be triggered from a script: check the autofill rule exists in
  `document.styleSheets` instead (part of TH-14's file).
- Sizes assume a 16px root and `--app-text-scale` 1; assert ratios where the spec gives one.
