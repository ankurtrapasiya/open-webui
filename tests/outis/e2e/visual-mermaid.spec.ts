import type { Page } from '@playwright/test';
import { test, expect } from '../support/fixtures';
import { THEMES, contrast, MIN_TEXT_CONTRAST } from '../support/visual';

// Two tiers, so the suite stays green on the GitHub runner and strict on the deploy machine:
//  - VIS-1/2 (always): measured properties of the drawn SVG, no baseline image. Platform independent.
//  - VIS-3 (OUTIS_VISUAL=1, the deploy machine): golden screenshots. Text anti-aliasing differs between
//    machines, so a baseline only means something on the machine that made it. See SPEC-visual.md.

const SEQUENCE = `sequenceDiagram
  participant U as User
  participant S as Service
  participant D as Database
  U->>S: request
  Note over U,S: a note
  loop retry
    S->>D: query
    D-->>S: rows
  end
  S-->>U: response`;

const FLOWCHART = `flowchart LR
  A[Client] --> B{Balancer}
  subgraph Backend
    B --> C[(Cache)]
    B --> D[Service]
    D --> E[(Database)]
  end`;

async function openMermaid(page: Page, api: any, title: string, source: string, theme: string, probe: string) {
	const chat = await api.chat({ title, assistant: `Diagram:\n\n\`\`\`mermaid\n${source}\n\`\`\`\n\nEnd` });
	await page.addInitScript((t) => {
		localStorage.setItem('theme', t);
		localStorage.setItem('sidebar', 'true');
	}, theme);
	await page.goto(`/c/${chat.id}`);
	const svg = page.locator(`svg:has(${probe})`).first();
	await expect(svg).toBeVisible();
	await page.evaluate(() => document.fonts.ready);
	return svg;
}

test('VIS-0 the contrast helper agrees with WCAG on known pairs', () => {
	expect(contrast('rgb(0, 0, 0)', 'rgb(255, 255, 255)')).toBeCloseTo(21, 0);
	expect(contrast('rgb(119, 119, 119)', 'rgb(136, 136, 136)')).toBeLessThan(MIN_TEXT_CONTRAST); // a bad pair is caught
	expect(contrast('rgb(51, 50, 46)', 'rgb(236, 220, 180)')).toBeGreaterThan(MIN_TEXT_CONTRAST);
});

for (const theme of THEMES) {
	test(`VIS-1 ${theme}: sequence diagram text is readable on its fills, and its fills are not the stock ones`, async ({ page, api }) => {
		await openMermaid(page, api, `VIS-1 ${theme}`, SEQUENCE, theme, 'rect.actor');
		const pairs = await page.evaluate(() => {
			const fill = (sel: string) => getComputedStyle(document.querySelector(sel)!).fill;
			// Mermaid colours the glyphs on the <tspan>; the <text> itself carries the box's fill.
			const ink = (sel: string) => {
				const el = document.querySelector(sel)!;
				return getComputedStyle(el.querySelector('tspan') ?? el).fill;
			};
			const pick = (name: string, box: string, text: string) => {
				if (!document.querySelector(box) || !document.querySelector(text)) return null;
				return { name, box: fill(box), text: ink(text) };
			};
			return [
				pick('actor', 'rect.actor', 'text.actor'),
				pick('note', 'rect.note', 'text.noteText'),
				pick('loop frame', 'polygon.labelBox', 'text.labelText')
			].filter(Boolean);
		});
		expect(pairs.length, 'actor, note and loop label all found').toBe(3);
		for (const p of pairs as { name: string; box: string; text: string }[]) {
			expect(contrast(p.text, p.box), `${theme} ${p.name}: ${p.text} on ${p.box}`).toBeGreaterThanOrEqual(MIN_TEXT_CONTRAST);
		}
		const stock = ['rgb(236, 236, 255)', 'rgb(255, 245, 173)'];
		for (const p of pairs as { box: string }[]) expect(stock).not.toContain(p.box);
	});

	test(`VIS-2 ${theme}: flowchart node labels are readable on their fills`, async ({ page, api }) => {
		await openMermaid(page, api, `VIS-2 ${theme}`, FLOWCHART, theme, 'g.node');
		const pairs = await page.evaluate(() =>
			[...document.querySelectorAll('g.node')].map((node) => {
				const shape = node.querySelector('rect, polygon, path') as SVGElement;
				const text = node.querySelector('text') as SVGElement;
				const glyphs = (text.querySelector('tspan') ?? text) as SVGElement;
				return { box: getComputedStyle(shape).fill, text: getComputedStyle(glyphs).fill };
			})
		);
		expect(pairs.length, 'nodes found').toBeGreaterThanOrEqual(4);
		for (const p of pairs) expect(contrast(p.text, p.box), `${theme}: ${p.text} on ${p.box}`).toBeGreaterThanOrEqual(MIN_TEXT_CONTRAST);
	});

	test(`VIS-3 ${theme}: golden screenshots of the sequence diagram and the flowchart`, async ({ page, api }) => {
		test.skip(!process.env.OUTIS_VISUAL, 'golden screenshots run on the deploy machine (OUTIS_VISUAL=1)');
		const seq = await openMermaid(page, api, `VIS-3 seq ${theme}`, SEQUENCE, theme, 'rect.actor');
		await expect(seq).toHaveScreenshot(`mermaid-sequence-${theme}.png`);
		const flow = await openMermaid(page, api, `VIS-3 flow ${theme}`, FLOWCHART, theme, 'g.node');
		await expect(flow).toHaveScreenshot(`mermaid-flowchart-${theme}.png`);
	});
}
