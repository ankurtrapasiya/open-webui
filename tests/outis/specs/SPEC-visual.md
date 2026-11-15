# Spec: visual checks

## Objective

Colour and layout bugs are the ones a person sees and a unit test does not: grey boxes where the theme has an
accent, yellow notes on a warm light page, text that disappears into its fill. They are hard to catch by
reading code, so the suite looks at the picture two ways. The aim is that a theme or Mermaid change which
makes a diagram unreadable, or hands it back to a stock palette, turns the gate red before it reaches Outis.

## Two tiers

| Tier | Runs | What it checks | Why this split |
|---|---|---|---|
| Measured | everywhere, including the GitHub runner | Properties read off the drawn SVG: text contrast against its fill (WCAG), stock fills absent | No baseline image, so it does not depend on the machine's fonts |
| Golden | only with `OUTIS_VISUAL=1` (the deploy gate on the Spark) | Screenshot of the element against a committed baseline, 2% pixel tolerance | Anti-aliasing differs between machines, so a baseline is only meaningful on the machine that made it |

`outis-mneme/scripts/deploy_owui.sh` sets `OUTIS_VISUAL=1`; CI does not.

## Acceptance criteria

- **VIS-0** The contrast helper (`support/visual.ts`) matches WCAG: black on white is 21, a known weak pair is below 4.5.
- **VIS-1** In each of the four themes, a Mermaid sequence diagram's actor, note and loop label have text contrast of
  at least 4.5 on their fills, and no fill is Mermaid's stock lavender (`#ececff`) or yellow (`#fff5ad`).
- **VIS-2** In each of the four themes, every node of a Mermaid flowchart with a subgraph has label contrast of at
  least 4.5 on its fill.
- **VIS-3** The sequence diagram and the flowchart match their golden screenshots in each theme
  (`visual-baselines/mermaid-<type>-<theme>.png`). Skipped unless `OUTIS_VISUAL=1`.

## Proven to fail

Run on 2026-11-15 against the image from before the Mermaid palette change, the same checks went red:
VIS-1 failed in all four themes, VIS-3 differed from the baselines by up to 20% of the pixels. Against the new
image VIS-3 passed twice in a row, so the baselines are stable.

## Updating a baseline

A red VIS-3 is a question, not a chore. Open the diff images Playwright writes under `test-results/`, decide
whether the new picture is the one you meant, then:

```bash
scripts/outis-visual-update.sh ghcr.io/ankurtrapasiya/open-webui:outis-mneme-<sha>
git add tests/outis/visual-baselines && git commit
```

Say in the commit what changed and why. Update the baselines before the deploy, not after: the gate compares
the new image to the committed pictures.

## Adding a diagram type

Add a probe selector and a source to `e2e/visual-mermaid.spec.ts` (or a new spec using `support/visual.ts`), run
the update script once, and look at the new PNGs before committing them.

## Not covered yet

Archify embeds (the page is made by a service that is not in the throwaway container; needs a saved embed as a
fixture), Kroki diagrams, mind maps, and the chat page chrome. Tracked in outis-owui issue 27 (AR-1).
