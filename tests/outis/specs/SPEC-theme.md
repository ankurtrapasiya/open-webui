# Spec: theme

Fork commits: ~30 theme commits (fb1066519 … 4a475f9a3). Design docs: `OUTIS_READING_SPEC.md` (colour, from 2026-10-04),
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
  'outis-dark'`, meta theme-color `#151311`, no `data-outis-font`.
- **TH-2** Stored `outis-mneme` boots as `outis-dark` and rewrites the stored value.
- **TH-3** Settings → General lists Outis-Dark and Outis-Light; choosing each applies its
  classes and theme-color (`#151311` / `#fbf9f5`).
- **TH-4** Outis-Dark → Outis-Light → OLED Dark → Outis-Light leaves no inline
  `--color-gray-800/850/900/950` on `<html>`, and computed `--color-gray-900` is `#1b1916`.
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

- **TH-14** Body background / text: `rgb(21, 19, 17)` / `rgb(228, 223, 216)` in dark;
  `rgb(251, 249, 245)` / `rgb(54, 50, 45)` in light.
- **TH-15** Primary filled buttons (the settings Save button) use the accent at rest: dark
  `rgb(122, 208, 160)`, light `rgb(0, 110, 67)`, text contrast ≥ 4.5:1. The lighter hover green
  appears only on hover. (First run found the dark hover colour applied at rest because one
  selector lacked `:hover`; fixed 2026-09-25.)
- **TH-16** Confirm dialog button (delete a chat): accent background, text contrast ≥ 4.5:1,
  also with `html.high-contrast` (the 4a475f9a3 regression).
- **TH-17** Focus: Tab to a button → outline colour is the accent, not stock blue. Focusing
  the composer shows no outline on `#chat-input-container` or the editor; with
  `html.high-contrast` the editor outline returns.
- **TH-18** Text selection colour: `rgba(122, 208, 160, 0.22)` in dark,
  `rgba(0, 131, 80, 0.14)` in light.
- **TH-19** Text on an accent badge (`bg-blue-500 text-white`, as the calendar's today badge
  uses) is `rgb(21, 19, 17)` in dark.
- **TH-20** `dark:text-white` renders as gray-50 `rgb(228, 223, 216)`, not pure white.

Code blocks:

- **TH-21** Code block, CodeMirror and gutters share one background: `rgb(26, 24, 22)` /
  `rgb(243, 240, 234)`; no `rgb(0, 0, 0)` seam.
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
  `rgb(251, 249, 245)`.
- **TH-27** A formula is one colour -- symbols, numbers, variables, brackets, bars -- per theme:
  `#f0c674` (Outis-Dark) / `#7a4f00` (Outis-Light), different from the prose colour. Display
  equations sit on a card (`#201e1a` / `#f3f0ea`) with a 2px accent edge. A formula's own
  `\color{}` wins. (Asked 2026-10-03; colour-by-kind tried and replaced 2026-10-04: different
  colours inside one equation read as noise.)
- **TH-28** With the third-party Texting Bubbles event function installed (fixture
  `tests/outis/fixtures/texting_bubbles.py`, 1.0.0), a reply reads as a study thread, not a box
  per paragraph: blocks are full width, transparent and square, hanging off a 2px rail
  (`#3c3934` / `#e3dfd8`), each with an 8px square node coloured by kind -- muted text, accent
  heading (`#7ad0a0` / `#008350`, heading sizes kept), formula node in the maths colour (`#f0c674` / `#7a4f00`),
  number-blue code. Display maths spans the reply, centred. Blocks still reveal one at a time with
  accent typing dots. A colour picked in the plugin's own setting brings its bubbles back.
  Animations stop under `prefers-reduced-motion`. (Asked 2026-10-03/04: bubbles every few lines
  broke up reading of coursework maths.)

Reading (asked 2026-10-04; research and numbers in `OUTIS_READING_SPEC.md`):

- **TH-29** Reply body text sits in its contrast band -- dark `rgb(215, 210, 203)` at 11-14:1
  (APCA Lc ~79), light `rgb(51, 48, 43)` at 12-17:1 (Lc ~96) -- and headings are the
  brightest/darkest neutral (`rgb(231, 226, 220)` / `rgb(29, 26, 22)`), not a hue. In dark the
  accent's contrast is below body text's. Running text (p, li, blockquote, headings) uses the
  full column, as wide as code blocks (the 75ch cap was removed at the user's request, 2026-10-05).

## Notes for the test author

- Colours may come back as `oklch(...)` for unthemed tokens; normalise before comparing.
- Browser autofill cannot be triggered from a script: check the autofill rule exists in
  `document.styleSheets` instead (part of TH-14's file).
- Sizes assume a 16px root and `--app-text-scale` 1; assert ratios where the spec gives one.
