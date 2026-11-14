# Outis theme colours: research and proposed palettes

Scope: colour only. Font and corner radius are out of scope (note: the fork today ships IBM Plex
Mono and 0px corners, not the stock sans and rounded corners; changing those is a separate task).
Date: 2026-11-14. Every number below was computed with the script in the appendix
(`/usr/bin/python3`, stdlib only; APCA-W3 0.0.98G-4g formula, checked against the reference
values black-on-white Lc 106.0 and white-on-black Lc -107.9, and against the existing spec's
`#d7d2cb` on `#151311` = 12.3:1 / Lc 79).

## 1. Findings

| # | Finding | Source |
|---|---|---|
| F1 | WCAG 2.2 AA: body text needs 4.5:1, large text 3:1. | https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html |
| F2 | UI parts that identify a control (input border, focus ring, toggle track) need 3:1 against neighbours (SC 1.4.11, AA). | https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html |
| F3 | Focus Appearance (2.4.13, AAA): a ring at least 2px thick whose pixels change by 3:1 between focused and unfocused. Easy to meet with a solid 2px accent outline. | https://www.w3.org/WAI/WCAG22/Understanding/focus-appearance |
| F4 | Colour must not be the only signal (SC 1.4.1, level A): status needs an icon or text too. Red/green is the pair that collapses for the ~6–8% of men with red-green colour deficiency; blue/orange survives. | https://www.w3.org/WAI/WCAG22/Understanding/use-of-color.html , https://www.section508.gov/create/making-color-usage-accessible/ |
| F5 | APCA (the candidate WCAG 3 contrast method) Bronze: body text min Lc 75, preferred Lc 90; other content text min Lc 60. APCA is polarity-aware, so light-on-dark and dark-on-light score differently (WCAG 2 ratio does not). | https://a11yreadtech.github.io/ARC/tests/bronze-simple-mode , https://github.com/Myndex/SAPC-APCA/blob/master/documentation/WhyAPCA.md |
| F6 | Material dark theme: use dark gray (#121212 baseline), not black; show elevation by making surfaces *lighter*; use desaturated accents, because saturated colours "vibrate" on dark grounds and strain the eye. | https://m2.material.io/design/color/dark-theme |
| F7 | Apple HIG: dark mode uses base and elevated background sets (popovers/sheets are lighter); minimum 4.5:1, aim for 7:1 for small custom text. | https://developer.apple.com/design/human-interface-guidelines/dark-mode , https://developer.apple.com/design/human-interface-guidelines/color |
| F8 | Reading research: for normal vision, dark text on light ground (positive polarity) gives better proofreading/reading performance; in dim rooms dark mode is about comfort, not speed. So light theme = default for long day study, dark theme = evening comfort. | https://www.nngroup.com/articles/dark-mode/ |
| F9 | Pure white on pure black maximises halation (glow around bright letters, worse with astigmatism); keep body text ~85–90% white on a dark gray. Evidence is practitioner-level, no direct controlled study (already recorded in `OUTIS_READING_SPEC.md`). | https://m2.material.io/design/color/dark-theme (87% white high-emphasis text) |

Two conclusions that change the current palette:

1. **Accent hue: mint green → muted blue.** The fork maps `green-*` onto the accent, so
   "clickable" and "succeeded" are the same signal, and the green accent next to red error text
   is the red/green pair (F4). Blue is also the learned "this is a link" colour, so readers spend
   no attention decoding it (psychology: people scan for the convention they already know; a
   novel link colour costs a moment of doubt every time). Blue against the amber maths colour is
   the colour-blind-safe blue/orange pair. Green returns to meaning only "success".
2. **Keep the accent dimmer than the text you read.** In dark mode the accent sits at Lc 60–62,
   below body text (Lc 79), so buttons do not pull the eye off the explanation (F6). In light
   mode body text is Lc 97 and the accent Lc 76.

## 2. Token tables

Role → Tailwind token mapping follows stock Open WebUI usage (body `gray-900` in dark /
`white` in light, sidebar `gray-950` / `gray-50`, menus and inputs `gray-850`/`gray-800`).
Note: the fork today paints dark `body` with `gray-950`; this proposal moves it to `gray-900`
so the sidebar sits one step deeper, as stock does.

### Outis-Dark

| Role | Token | Hex |
|---|---|---|
| App background (chat column) | gray-900 | `#1a1713` |
| Sidebar | gray-950 | `#14110e` |
| Surface: cards, code block, composer, inputs | gray-850 | `#211d1a` |
| Elevated: menus, popovers, modals, inline-code bg, hover row | gray-800 | `#282521` |
| Hairline border / divider | gray-800 | `#282521` |
| Strong border (card edge, code-block edge) | gray-700 | `#36322e` |
| Control border (form fields, needs 3:1) | `--outis-control-border` | `#6c6864` |
| Text: headings | gray-50 | `#e7e2dc` |
| Text: body, code text | gray-100 | `#d9d3cd` |
| Text: secondary (sidebar titles, labels, captions) | gray-200 | `#c2bdb7` |
| Text: muted (timestamps, counters, placeholders) | gray-300 | `#a9a49e` |
| Text: disabled / gutter numbers | gray-500 | `#67625d` |
| Accent (filled buttons, toggles on, active tab bar) | blue-500 | `#84b9e6` |
| Accent hover / active (pressed) | blue-400 / blue-300 | `#93c4ed` / `#a2cdf2` |
| Text on accent fill | gray-950 | `#14110e` |
| Link | blue-300 | `#a2cdf2` (underline on hover; always underlined in prose) |
| Focus ring (2px solid, 2px offset) | blue-400 | `#93c4ed` |
| Success / warning / error / info | green-500 / yellow-500 / red-500 / blue-300 | `#8bcd99` / `#edbf71` / `#f69b94` / `#a2cdf2` |
| Selection highlight | accent @ 18% | `rgba(132,185,230,0.18)` ≈ `#2d3439` on app bg |
| KaTeX / maths (unchanged) | `--outis-math` | `#f0c674` |
| Maths display card | `--outis-math-card` | `#211d1a` (= surface) |

Scales (`--color-gray-*`, `--color-blue-*`; OKLCH, gray H70 C≤0.010, blue H245 C≤0.09):

| | 50 | 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 850 | 900 | 950 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| gray | `#e7e2dc` | `#d9d3cd` | `#c2bdb7` | `#a9a49e` | `#8a8580` | `#67625d` | `#4b4742` | `#36322e` | `#282521` | `#211d1a` | `#1a1713` | `#14110e` |
| blue (accent) | `#e1f1ff` | `#cee6fc` | `#b7d9f7` | `#a2cdf2` | `#93c4ed` | `#84b9e6` | `#558cb9` | `#3b6e97` | `#265173` | — | `#15364f` | `#0a2133` |

### Outis-Light

| Role | Token | Hex |
|---|---|---|
| App background (paper; `--color-white`) | white | `#fbf9f5` |
| Sidebar | gray-50 | `#f7f3ef` |
| Surface: cards, code block, composer, inputs | gray-100 | `#f0ece8` |
| Elevated: menus, popovers, modals (with shadow) | `--outis-menu-bg` | `#fefdfb` |
| Inline-code bg, hover row | gray-200 | `#e6e2de` |
| Hairline border / divider | gray-200 | `#e6e2de` |
| Strong border (card edge, code-block edge) | gray-400 | `#b4b0ac` |
| Control border (form fields, needs 3:1) | `--outis-control-border` | `#878480` |
| Text: headings | gray-950 | `#1d1a16` |
| Text: body, code text | gray-900 | `#2e2b26` |
| Text: secondary | gray-700 | `#585550` |
| Text: muted | gray-600 | `#6e6b67` |
| Text: disabled / gutter numbers | gray-400 | `#b4b0ac` |
| Accent (filled buttons, toggles on) | blue-500 | `#2266a4` |
| Accent hover / active | blue-600 / blue-700 | `#1a588f` / `#124a7b` |
| Text on accent fill | white | `#fbf9f5` |
| Link | blue-600 | `#1a588f` |
| Focus ring (2px solid, 2px offset) | blue-500 | `#2266a4` |
| Success / warning / error / info | green-600 / yellow-700 / red-600 / blue-600 | `#2b7440` / `#975c16` / `#b33832` / `#1a588f` |
| Selection highlight | accent @ 18% | `rgba(34,102,164,0.18)` ≈ `#d4dfe6` |
| KaTeX / maths (unchanged) | `--outis-math` | `#7a4f00` |
| Maths display card | `--outis-math-card` | `#f0ece8` (= surface) |

Scales (gray H75 C≤0.009, blue H250 C≤0.12):

| | 50 | 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 850 | 900 | 950 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| gray | `#f7f3ef` | `#f0ece8` | `#e6e2de` | `#d7d4cf` | `#b4b0ac` | `#8f8c88` | `#6e6b67` | `#585550` | `#403d38` | `#37342f` | `#2e2b26` | `#1d1a16` |
| blue (accent) | `#eff6fe` | `#dbecfd` | `#bfdbf8` | `#99c2ed` | `#5b97d3` | `#2266a4` | `#1a588f` | `#124a7b` | `#103c65` | — | `#0d2f4f` | `#072038` |

Status colours need their own small scales once `green-*` is no longer aliased to `blue-*`:
set only the steps named above and leave the rest at Tailwind defaults (as red/yellow are today).

## 3. Measured contrast

Cells are WCAG ratio / APCA |Lc|, text colour on each background.


#### Outis-Dark

| Text | on app | on sidebar | on card/code | on menu | on selection |
|---|---|---|---|---|---|
| heading `#e7e2dc` | 13.9:1 / Lc 88 | 14.6:1 / Lc 89 | 13.0:1 / Lc 88 | 11.8:1 / Lc 87 | 9.8:1 / Lc 84 |
| body `#d9d3cd` | 12.0:1 / Lc 79 | 12.7:1 / Lc 80 | 11.3:1 / Lc 79 | 10.3:1 / Lc 77 | 8.5:1 / Lc 75 |
| secondary `#c2bdb7` | 9.6:1 / Lc 66 | 10.1:1 / Lc 67 | 9.0:1 / Lc 65 | 8.2:1 / Lc 64 | 6.8:1 / Lc 61 |
| muted `#a9a49e` | 7.2:1 / Lc 52 | 7.6:1 / Lc 53 | 6.8:1 / Lc 52 | 6.2:1 / Lc 50 | 5.1:1 / Lc 47 |
| disabled `#67625d` | 3.0:1 / Lc 21 | 3.1:1 / Lc 21 | 2.8:1 / Lc 20 | 2.5:1 / Lc 19 | 2.1:1 / Lc 16 |
| link `#a2cdf2` | 10.7:1 / Lc 72 | 11.2:1 / Lc 73 | 10.0:1 / Lc 72 | 9.1:1 / Lc 70 | 7.6:1 / Lc 67 |
| accent `#84b9e6` | 8.6:1 / Lc 60 | 9.0:1 / Lc 61 | 8.0:1 / Lc 60 | 7.3:1 / Lc 59 | 6.1:1 / Lc 56 |
| success `#8bcd99` | 9.6:1 / Lc 66 | 10.1:1 / Lc 67 | 9.0:1 / Lc 66 | 8.2:1 / Lc 65 | 6.8:1 / Lc 62 |
| warning `#edbf71` | 10.5:1 / Lc 71 | 11.0:1 / Lc 72 | 9.8:1 / Lc 70 | 8.9:1 / Lc 69 | 7.4:1 / Lc 66 |
| error `#f69b94` | 8.5:1 / Lc 60 | 9.0:1 / Lc 61 | 8.0:1 / Lc 60 | 7.3:1 / Lc 59 | 6.0:1 / Lc 56 |
| math `#f0c674` | 11.1:1 / Lc 75 | 11.7:1 / Lc 75 | 10.4:1 / Lc 74 | 9.5:1 / Lc 73 | 7.8:1 / Lc 70 |
| on-accent `#14110e` on accent `#84b9e6` | 9.0:1 / Lc 62 | hover 10.2:1 / Lc 68 | active 11.2:1 / Lc 74 | | |
| body on inline-code `#282521` | 10.3:1 / Lc 77 | | | | |

Non-text (WCAG 1.4.11, 3:1): focus ring vs app 9.7, vs card 9.0, vs menu 8.3; strong border vs app 1.41; control border vs app 3.23, vs card 3.03; hairline vs app 1.17; accent fill vs app 8.6.

#### Outis-Light

| Text | on app | on sidebar | on card/code | on menu | on selection |
|---|---|---|---|---|---|
| heading `#1d1a16` | 16.5:1 / Lc 101 | 15.7:1 / Lc 97 | 14.7:1 / Lc 93 | 17.0:1 / Lc 103 | 12.8:1 / Lc 84 |
| body `#2e2b26` | 13.4:1 / Lc 97 | 12.8:1 / Lc 94 | 12.0:1 / Lc 90 | 13.9:1 / Lc 100 | 10.4:1 / Lc 81 |
| secondary `#585550` | 7.1:1 / Lc 82 | 6.7:1 / Lc 79 | 6.3:1 / Lc 75 | 7.3:1 / Lc 85 | 5.5:1 / Lc 66 |
| muted `#6e6b67` | 5.0:1 / Lc 73 | 4.8:1 / Lc 70 | 4.5:1 / Lc 65 | 5.2:1 / Lc 75 | 3.9:1 / Lc 57 |
| disabled `#b4b0ac` | 2.0:1 / Lc 39 | 2.0:1 / Lc 36 | 1.8:1 / Lc 31 | 2.1:1 / Lc 41 | 1.6:1 / Lc 23 |
| link `#1a588f` | 7.0:1 / Lc 82 | 6.7:1 / Lc 79 | 6.3:1 / Lc 74 | 7.3:1 / Lc 84 | 5.5:1 / Lc 66 |
| accent `#2266a4` | 5.7:1 / Lc 76 | 5.4:1 / Lc 73 | 5.1:1 / Lc 69 | 5.9:1 / Lc 78 | 4.4:1 / Lc 60 |
| success `#2b7440` | 5.4:1 / Lc 75 | 5.2:1 / Lc 71 | 4.9:1 / Lc 67 | 5.6:1 / Lc 77 | 4.2:1 / Lc 59 |
| warning `#975c16` | 5.2:1 / Lc 73 | 4.9:1 / Lc 70 | 4.6:1 / Lc 66 | 5.4:1 / Lc 76 | 4.0:1 / Lc 57 |
| error `#b33832` | 5.7:1 / Lc 75 | 5.4:1 / Lc 72 | 5.1:1 / Lc 68 | 5.9:1 / Lc 78 | 4.4:1 / Lc 59 |
| math `#7a4f00` | 6.8:1 / Lc 81 | 6.5:1 / Lc 78 | 6.1:1 / Lc 74 | 7.0:1 / Lc 83 | 5.3:1 / Lc 65 |
| on-accent `#fbf9f5` on accent `#2266a4` | 5.7:1 / Lc 81 | hover 7.0:1 / Lc 86 | active 8.7:1 / Lc 91 | | |
| body on inline-code `#e6e2de` | 10.9:1 / Lc 84 | | | | |

Non-text (WCAG 1.4.11, 3:1): focus ring vs app 5.7, vs card 5.1, vs menu 5.9; strong border vs app 2.05; control border vs app 3.54, vs card 3.17; hairline vs app 1.23; accent fill vs app 5.7.

Pass check against the brief:

- Body text: dark 10.3–12.7:1, Lc 77–80 on every surface (Lc 75 even inside a selection);
  light 12.0–13.9:1, Lc 90–100. All ≥ 4.5:1 and ≥ Lc 75.
- Secondary text: dark Lc 64–67, light Lc 75–85 on every surface. All ≥ Lc 60.
- Links, status text, maths: ≥ 4.5:1 and ≥ Lc 59 everywhere except inside a selection.
- Focus ring and control borders ≥ 3:1 (F2). Hairlines (1.2–1.4:1) are decorative and exempt
  under 1.4.11, because no control is identified by them alone.
- Muted is the one role under Lc 60 in dark (Lc 50–53, still 6–7:1 WCAG): use it only for
  spot text (timestamps, counters), never for a sentence. Disabled text is exempt by WCAG.
- Red and green status colours share lightness, so a deuteranope cannot tell them apart by
  colour: every status must keep its icon or word (F4). Accent blue vs maths amber is safe.

## 4. Rationale

**Outis-Dark (evening study).** A warm dark gray, not black, so bright glyphs halate less (F6, F9),
and three surface steps that get lighter as they rise (sidebar → page → card → menu), the depth
cue both Material and Apple use (F6, F7). Body text sits at Lc ~79: inside the APCA body band but
well short of maximum, which is the low-glare goal. The only saturated-looking colour is a dim,
desaturated blue that scores *below* body text, so the eye stays on the explanation; amber is
reserved for maths, so a formula stands out from prose without a second accent. Code blocks and
display maths share one surface step, so the column reads as prose plus quiet boxes, not a
patchwork of panels.

**Outis-Light (day study, the default for long reading).** Positive polarity reads best for
normal vision in a lit room (F8), so this is the theme for long explanations and maths. Paper
is warm off-white and ink warm near-black (no `#fff`/`#000`), giving Lc ~97 body text: APCA's
preferred Lc 90 without the glare of pure white. The accent is a deep ink blue used only for
links, focus and the single primary button per view; success green is separate, and the same
amber maths colour keeps the two themes recognisably one system.

## 5. Cost of adopting it

Tests in `tests/outis/specs/SPEC-theme.md` assert today's values and must change with it:
TH-1/TH-3/TH-14 (dark body `#151311` → `#1a1713`), TH-15/16/19 (accent fill), TH-17/22
(focus/edge colour), TH-18 (selection rgba), TH-25 (emerald → accent), TH-27/28 (accent edge and
heading node). Keeping mint green is possible (it already passes WCAG/APCA per
`OUTIS_READING_SPEC.md`), but it keeps the accent=success overlap and the red/green pair.

## Appendix: contrast script

```python
# /usr/bin/python3 -c "from contrast import *; print(wcag('#d9d3cd','#1a1713'), apca('#d9d3cd','#1a1713'))"
def rgb(h): h=h.lstrip('#'); return [int(h[i:i+2],16) for i in (0,2,4)]
def lin(c): c/=255; return c/12.92 if c<=0.04045 else ((c+0.055)/1.055)**2.4
def wcag(a,b):
    L=lambda h: sum(w*lin(c) for w,c in zip((0.2126,0.7152,0.0722),rgb(h)))
    x,y=sorted((L(a),L(b)),reverse=True); return (x+.05)/(y+.05)
def apca(txt,bg):  # APCA-W3 0.0.98G-4g; negative = light text on dark
    Y=lambda h: sum(w*(c/255)**2.4 for w,c in zip((0.2126729,0.7151522,0.0721750),rgb(h)))
    t,b=Y(txt),Y(bg)
    t=t+(0.022-t)**1.414 if t<0.022 else t
    b=b+(0.022-b)**1.414 if b<0.022 else b
    if abs(b-t)<0.0005: return 0.0
    if b>t: s=(b**0.56-t**0.57)*1.14; o=0 if s<0.1 else s-0.027
    else:   s=(b**0.65-t**0.62)*1.14; o=0 if s>-0.1 else s+0.027
    return o*100
assert abs(wcag('#000000','#ffffff')-21)<0.01
assert abs(apca('#000000','#ffffff')-106.04)<0.1 and abs(apca('#ffffff','#000000')+107.88)<0.1
```
