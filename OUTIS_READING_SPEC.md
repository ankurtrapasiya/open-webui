# Outis reading spec — day (Outis-Light) and night (Outis-Dark)

Asked 2026-10-04: optimise both themes for long study reading. Outis-Light is the daytime
page, Outis-Dark the night page. Where this and older theme docs disagree, this wins for
colour; the CSS is the final truth. Acceptance: `tests/outis/specs/SPEC-theme.md` TH-29 (and
the updated TH-1…TH-28 values).

## What the evidence says (short)

| Question | Finding | Strength |
|---|---|---|
| Which polarity reads best? | Dark-on-light: more accurate proofreading, smaller pupil, sharper image; holds even in a dark room. Light-on-dark is for comfort, not speed. | Strong (Piepenbrock 2013/2014; Dobres 2017) |
| Light ground | Off-white, not #fff; text dark gray, not #000. Body ≥ 7:1, APCA Lc 90 preferred. | Contrast: strong. Off-white vs white: practitioner consensus |
| Dark ground | Dark gray (#121212–#1a1917), not black; body text ~87% white, APCA Lc 75–90. Max contrast causes halation (glow round bright letters), worse with astigmatism. | Contrast band: strong. Halation: plausible, no direct study |
| Dark accents | Desaturate (Material "200" tone); saturated colour vibrates on dark. | Practitioner (Material, Apple HIG) |
| Night and sleep | Brightness drives melatonin suppression; warm tint alone did not help (Night Shift trials). Warm tint is cheap and harmless. | Brightness: strong. Tint: weak |
| Neutral hue | Reading apps go warm (Kindle, Apple Books, Solarized). No study for green vs warm. | Consensus only |
| Line length | 45–75 characters; WCAG 1.4.8 caps at 80. | Strong |
| Spacing | Line height ≥ 1.5; paragraph gap ≥ 1.5 × line spacing (WCAG 1.4.8). | Standard |
| Headings | Rank by size and weight, not colour; colour belongs to links and code. | Consensus |
| Dark weight | Light text on dark looks bolder; add a hair of letter-spacing. | Consensus |

Sources: Piepenbrock et al. 2013 (*Ergonomics*) and 2014 (*Human Factors*); Dobres et al. 2017
(*Applied Ergonomics*); APCA documentation (git.apcacontrast.com); Material dark theme
(m2.material.io/design/color/dark-theme.html); Apple HIG Dark Mode; Chang et al. 2015 (*PNAS*);
Nagare et al. 2019; Duraccio et al. 2021; WCAG 2.2 Understanding 1.4.8; Dyson & Haselgrove 2001;
NN/g "Dark mode".

## What the old palette got wrong (measured)

| | Old | Problem |
|---|---|---|
| Night body text | `#a5b5ad` on `#090d0c`, Lc 60 | Below the Lc 75 body floor, at a 12.8px font |
| Night accent | `#2dff8f`, Lc 88, chroma 0.22 | Brighter than the text being read; neon at night |
| Night ground | `#090d0c`, green tint | Near-black maximises halation; cool tint |
| Headings (both) | amber / ochre | Same hue as maths (`#f0c674` / `#7a4f00`): a heading read as a formula |
| Line length | ~112 mono characters per line | 1.5× the 75 limit |
| Paragraph gap | 8px after a 20.8px line | 1.38× line spacing, below 1.5× |

## The two palettes

Night (Outis-Dark): warm, dim, desaturated. Neutrals OKLCH H75, chroma ≤ 0.013.

| Role | Hex | WCAG | APCA Lc |
|---|---|---|---|
| Ground (gray-950) | `#151311` | — | — |
| Code / cards (gray-900) | `#1a1816` | — | — |
| Headings | `#e7e2dc` | 14.4 | 89 |
| Strong | `#dfdad4` | 13.3 | 84 |
| Body | `#d7d2cb` | 12.3 | 79 |
| Quiet (quotes, captions) | `#bab4ac` | 9.0 | 61 |
| Accent (blue-500) | `#7ad0a0` | 10.0 | 67 |
| Links (blue-400) | `#8edbaf` | 11.4 | 74 |
| Maths (unchanged) | `#f0c674` | 11.5 | 75 |

Day (Outis-Light): warm off-white paper, warm-black ink. Neutrals OKLCH H80.

| Role | Hex | WCAG | APCA Lc |
|---|---|---|---|
| Paper (white) | `#fbf9f5` | — | — |
| Code / cards | `#f3f0ea` | — | — |
| Headings | `#1d1a16` | 16.5 | 101 |
| Body | `#33302b` | 12.5 | 96 |
| Quiet | `#615d56` | 6.2 | 79 |
| Links | `#00784a` | 5.3 | 74 |
| Accent (unchanged) | `#008350` | 4.6 | 69 |
| Maths (unchanged) | `#7a4f00` | 6.8 | 81 |

Colour in the reading area now means two things only: green = interactive, gold/ochre =
maths. Code syntax colours (GitHub Primer, chosen 2026-10-01) and diagram branch hues are
unchanged; diagram neutrals (ground, fill, border, text) follow the new grounds.

## Shared layout

- Running text (p, li, blockquote, h1–h6) capped at `75ch`; code, tables, maths, diagrams keep
  the full column.
- Paragraph gap `0.8em` (≈ 1.5 × line spacing).
- Night prose gets `letter-spacing: 0.01em`.

## Not changed, on purpose

- Font size (12.8px via `--outis-prose-scale` 0.85) and the monospace default. Research favours
  a proportional face and +1–2px at night, but both were tuned by hand earlier; the size is
  one variable if wanted.
- Light accent ramp, red/yellow, code syntax colours, the favicon mark.
- Print stylesheet (paper stays white).

## Habit, not CSS

Screen brightness matters more than any colour for sleep: at night, turn the display down too.
