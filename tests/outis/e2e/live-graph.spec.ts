import type { Page } from '@playwright/test';
import { test, expect } from '../support/fixtures';

// Live graph (user-approved design, 2026-11-15): a Graphviz chart's SVG carries its cleaned DOT
// source (data-outis-dot-b64); the viewer offers Graph / Picture; Graph draws a foldable,
// reflowing layout from the source. Fixtures mirror the Kroki filter's output.
const b64 = (s: string) => Buffer.from(s, 'utf8').toString('base64');
const dotSvg = (source: string, w = 1300) =>
	`<div class="outis-diagram"><svg xmlns="http://www.w3.org/2000/svg" data-outis-dot-b64="${b64(source)}" width="${w}" height="300" viewBox="0 0 ${w} 300"><rect width="200" height="80"/></svg></div>`;

const ML = `digraph mlmath {
  rankdir=TB;
  root [label="Mathematics for Machine Learning"];
  linear [label="Linear Algebra\\n· Vectors & matrices\\n· Eigendecomposition"];
  calc [label="Calculus\\n· Chain rule\\n· Gradient ∇f"];
  prob [label="Probability & Statistics"];
  optim [label="Optimization"];
  root -> linear; root -> calc; root -> prob; root -> optim;
  ml1 [label="Linear regression"]; ml2 [label="Neural networks"]; ml3 [label="Classification"]; ml4 [label="Model training"];
  linear -> ml1; linear -> ml2; calc -> ml1; calc -> ml2; calc -> ml3; prob -> ml3; prob -> ml4; optim -> ml2; optim -> ml4;
  extra1 [label="Convexity"]; extra2 [label="Regularization"]; extra3 [label="Bayes"]; extra4 [label="MLE"];
  optim -> extra1; optim -> extra2; prob -> extra3; prob -> extra4;
}`; // 13 nodes, 17 edges
const DIAMOND = 'digraph { a -> b; a -> c; b -> d; c -> d }';
const CLUSTER = 'digraph { subgraph cluster_x { label="Pre"; x1; x2; } x1 -> y; x2 -> y; }';
const RECORD = 'digraph { a [shape=record, label="{x|y}"]; a -> b; }';
const LONG = 'digraph { a -> b; a -> c; a -> d; b [label="' + 'a very long label that goes on and on for sixty characters here'.slice(0, 60) + '"]; c [label="' + 'x'.repeat(60) + '"]; d [label="' + 'another quite long label that also runs to sixty characters ok'.slice(0, 60) + '"]; }';
const LR5 = 'digraph { rankdir=LR; a -> b -> c; a -> d; d -> e }';
const LR9 = 'digraph { rankdir=LR; ' + Array.from({ length: 8 }, (_, i) => `n${i} -> n${i + 1}`).join('; ') + ' }';

async function openDot(page: Page, api: any, source: string, theme = 'outis-dark') {
	const chat = await api.chat({ title: `LG ${theme}`, assistant: `Chart:\n\n${dotSvg(source)}\n\nEnd` });
	await page.addInitScript((t) => localStorage.setItem('theme', t), theme);
	await page.goto(`/c/${chat.id}`);
	await expect(page.locator('[data-diagram-viewer]').first()).toBeVisible();
}
const viewer = (page: Page) => page.locator('[data-diagram-viewer]').first();
const graph = (page: Page) => page.locator('[data-live-graph]');
const chip = (page: Page, id: string) => graph(page).locator(`[data-gnode="${id}"]`);
async function openGraph(page: Page) {
	await viewer(page).hover();
	await viewer(page).getByRole('button', { name: 'Graph', exact: true }).click();
	await expect(graph(page)).toBeVisible();
}
const probe = (page: Page, css: string, prop: string) =>
	graph(page).evaluate((g, [c, p]) => {
		const el = document.createElement('div');
		el.style.cssText = c!;
		g.appendChild(el);
		const v = getComputedStyle(el).getPropertyValue(p!);
		el.remove();
		return v;
	}, [css, prop]);

test('LG-1 the Graph button appears for a plain chart, not for a record shape, not in full screen', async ({ page, api }) => {
	await openDot(page, api, ML);
	await viewer(page).hover();
	await expect(viewer(page).getByRole('button', { name: 'Graph', exact: true })).toHaveCount(1);
	await viewer(page).getByRole('button', { name: 'Full screen' }).click();
	const dialog = page.getByRole('dialog', { name: 'Diagram' });
	await dialog.locator('[data-diagram-viewer]').hover();
	await expect(dialog.getByRole('button', { name: 'Graph', exact: true })).toHaveCount(0);
	await page.keyboard.press('Escape');
	await openDot(page, api, RECORD);
	await viewer(page).hover();
	await expect(viewer(page).getByRole('button', { name: 'Graph', exact: true })).toHaveCount(0);
});

test('LG-2 Graph draws every node and edge, keeps the picture in the DOM; Picture restores it', async ({ page, api }) => {
	await openDot(page, api, ML);
	await openGraph(page);
	await expect(graph(page).locator('[data-gnode]')).toHaveCount(13);
	await expect(graph(page).locator('svg[data-edges] path[data-edge]')).toHaveCount(17);
	const svg = page.locator('.outis-diagram > svg').first();
	await expect(svg).toBeAttached();
	await expect(svg).toBeHidden();
	await expect(chip(page, 'root')).toContainText('Mathematics for Machine Learning');
	await viewer(page).hover();
	await viewer(page).getByRole('button', { name: 'Picture' }).click();
	await expect(svg).toBeVisible();
	await expect(graph(page)).toHaveCount(0);
});

test('LG-3 folding hides only nodes reachable solely through the folded node, with a count badge', async ({ page, api }) => {
	await openDot(page, api, DIAMOND);
	await openGraph(page);
	await chip(page, 'b').getByRole('button', { name: 'Fold' }).click();
	await expect(chip(page, 'd')).toBeVisible();
	await expect(chip(page, 'b').locator('[data-badge]')).toHaveCount(0);
	await chip(page, 'b').getByRole('button', { name: 'Unfold' }).click();
	await chip(page, 'a').getByRole('button', { name: 'Fold' }).click();
	for (const id of ['b', 'c', 'd']) await expect(chip(page, id)).toHaveCount(0);
	await expect(chip(page, 'a').locator('[data-badge]')).toHaveText('+3');
	await chip(page, 'a').getByRole('button', { name: 'Unfold' }).click();
	await expect(chip(page, 'd')).toBeVisible();
});

test('LG-4 a cluster has a header chip that folds its members', async ({ page, api }) => {
	await openDot(page, api, CLUSTER);
	await openGraph(page);
	const header = graph(page).locator('[data-gcluster="cluster_x"]');
	await expect(header).toContainText('Pre');
	await expect(chip(page, 'x1')).toBeVisible();
	await header.getByRole('button', { name: 'Fold' }).click();
	await expect(chip(page, 'x1')).toHaveCount(0);
	await expect(chip(page, 'x2')).toHaveCount(0);
	await expect(chip(page, 'y')).toBeVisible();
	await header.getByRole('button', { name: 'Unfold' }).click();
	await expect(chip(page, 'x1')).toBeVisible();
});

test('LG-5 long labels wrap in a narrow column: no chip wider than a third, no sideways scroll, no overlap', async ({ page, api }) => {
	await page.setViewportSize({ width: 560, height: 900 });
	await openDot(page, api, LONG);
	await openGraph(page);
	const g = graph(page);
	const [gw, sw, cw] = await g.evaluate((e) => [e.getBoundingClientRect().width, e.scrollWidth, e.clientWidth]);
	expect(sw).toBeLessThanOrEqual(cw + 1);
	const rects = await g.locator('[data-gnode]').evaluateAll((els) => els.map((e) => { const r = e.getBoundingClientRect(); return [r.x, r.y, r.width, r.height]; }));
	for (const r of rects) expect(r[2]).toBeLessThanOrEqual(gw / 3 + 1);
	for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) {
		const [a, b] = [rects[i], rects[j]];
		const overlap = a[0] < b[0] + b[2] && b[0] < a[0] + a[2] && a[1] < b[1] + b[3] && b[1] < a[1] + a[3];
		expect(overlap, `${i} vs ${j}`).toBe(false);
	}
});

test('LG-6 chips take the theme: branch 1 border in Dark and Spark is a real token colour; FT root uses the root border', async ({ page, api }) => {
	for (const theme of ['outis-dark', 'outis-dark-spark']) {
		await openDot(page, api, ML, theme);
		await openGraph(page);
		const b1 = await probe(page, 'color: var(--outis-diagram-b1-border)', 'color');
		const body = await page.evaluate(() => getComputedStyle(document.body).color);
		expect(b1, theme).toMatch(/^rgb\(/);
		expect(b1, theme).not.toBe(body);
		expect(await chip(page, 'linear').evaluate((e) => getComputedStyle(e).borderLeftColor), theme).toBe(b1);
	}
	await openDot(page, api, ML, 'outis-light-ft');
	await openGraph(page);
	const rootBorder = await probe(page, 'color: var(--outis-diagram-root-border)', 'color');
	expect(await chip(page, 'root').evaluate((e) => getComputedStyle(e).borderLeftColor)).toBe(rootBorder);
});

test('LG-7 small LR charts are drawn as columns; large ones as rows', async ({ page, api }) => {
	await openDot(page, api, LR5);
	await openGraph(page);
	await expect(graph(page)).toHaveAttribute('data-horizontal', 'true');
	const [ax, bx] = await Promise.all([chip(page, 'a').evaluate((e) => e.getBoundingClientRect().x), chip(page, 'b').evaluate((e) => e.getBoundingClientRect().x)]);
	expect(bx).toBeGreaterThan(ax);
	await openDot(page, api, LR9);
	await openGraph(page);
	await expect(graph(page)).toHaveAttribute('data-horizontal', 'false');
});
