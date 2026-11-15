import type { Page } from '@playwright/test';
import { test, expect } from '../support/fixtures';

// What the Kroki filter leaves for a mind map: the SVG carries the final PlantUML source, base64.
// Real output has a <style> block (DOMPurify would drop a plain-text attribute holding "</style")
// and may hold blank lines, so the fixture includes both.
const STYLE = '<style>\nmindmapDiagram {\n  node {\n    Padding 8\n  }\n}\n</style>\n';
const b64 = (s: string) => Buffer.from(s, 'utf8').toString('base64');
const withStyle = (source: string) => source.replace('@startmindmap\n', '@startmindmap\n' + STYLE).replace('\n@endmindmap', '\n\n@endmindmap');
const mapSvg = (source: string, w = 1300) =>
	`<div class="outis-diagram"><svg xmlns="http://www.w3.org/2000/svg" data-outis-mindmap-b64="${b64(withStyle(source))}" width="${w}" height="300" viewBox="0 0 ${w} 300">` +
	`<rect width="200" height="80"/></svg></div>`;
const plainSvg = `<div class="outis-diagram"><svg xmlns="http://www.w3.org/2000/svg" width="1300" height="300" viewBox="0 0 1300 300"><rect width="200" height="80"/></svg></div>`;

const SIX = [
	'@startmindmap',
	'* Root',
	'** Branch <<b1>>',
	'***_ A & "B" <c> <<b1s>>',
	'***_ Second <<b1s>>',
	'** Two <<b2>>',
	'***_ Deep <<b2s>>',
	'****_ Deeper <<b2s>>',
	'** Three <<b3>>',
	'***_ t1 <<b3s>>',
	'** Four <<b4>>',
	'***_ f1 <<b4s>>',
	'** Five <<b5>>',
	'***_ v1 <<b5s>>',
	'** Six <<b6>>',
	'***_ s1 <<b6s>>',
	'@endmindmap'
].join('\n');
const TWO = '@startmindmap\n* Root\n** Left <<b1>>\n***_ l1 <<b1s>>\n** Right <<b2>>\n***_ r1 <<b2s>>\n@endmindmap';
const BARE = '@startmindmap\n* Alone\n@endmindmap';

async function openMap(page: Page, api: any, source: string, theme = 'outis-dark') {
	const chat = await api.chat({ title: `RM ${theme}`, assistant: `Map:\n\n${mapSvg(source)}\n\nEnd` });
	await page.addInitScript((t) => localStorage.setItem('theme', t), theme);
	await page.goto(`/c/${chat.id}`);
	await expect(page.locator('[data-diagram-viewer]').first()).toBeVisible();
	return chat;
}
const viewer = (page: Page) => page.locator('[data-diagram-viewer]').first();
const map = (page: Page) => page.locator('[data-recall-map]');
async function enterRecall(page: Page) {
	await viewer(page).hover();
	await viewer(page).getByRole('button', { name: 'Recall', exact: true }).click();
	await expect(map(page)).toBeVisible();
}
async function recallMode(page: Page) {
	await map(page).getByRole('button', { name: 'Recall mode' }).click();
	await expect(map(page)).toHaveAttribute('data-mode', 'recall');
}
const cssq = (v: string) => v.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
const node = (page: Page, label: string) => map(page).locator(`[data-node][data-node-label="${cssq(label)}"]`);
// The node's own row (label + its buttons), not its descendants'.
const row = (page: Page, label: string) => node(page, label).locator(':scope > div').first();

test('RM-1 the Recall button appears only for a diagram that carries its mind map source', async ({ page, api }) => {
	await openMap(page, api, SIX);
	await viewer(page).hover();
	await expect(viewer(page).getByRole('button', { name: 'Recall', exact: true })).toHaveCount(1);
	const chat = await api.chat({ title: 'RM plain', assistant: `P:\n\n${plainSvg}\n\nE` });
	await page.goto(`/c/${chat.id}`);
	await viewer(page).hover();
	await expect(viewer(page).getByRole('button', { name: 'Recall', exact: true })).toHaveCount(0);
});

test('RM-2 Recall shows the tree and keeps the picture in the DOM; Picture brings it back; <4 branches stay on one side', async ({ page, api }) => {
	await openMap(page, api, TWO);
	await enterRecall(page);
	const svg = page.locator('.outis-diagram > svg').first();
	await expect(svg).toBeAttached();
	await expect(svg).toBeHidden();
	await expect(map(page).locator('[data-side="left"] [data-node]')).toHaveCount(0);
	await expect(map(page).locator('[data-side="right"] [data-node]')).toHaveCount(4);
	await viewer(page).hover();
	await viewer(page).getByRole('button', { name: 'Picture' }).click();
	await expect(svg).toBeVisible();
	await expect(map(page)).toHaveCount(0);
});

test('RM-3 branches collapse and expand; depth 2 and deeper start collapsed', async ({ page, api }) => {
	await openMap(page, api, SIX);
	await enterRecall(page);
	await expect(node(page, 'Deep')).toBeVisible();
	await expect(node(page, 'Deeper')).toBeHidden();
	await row(page, 'Deep').getByRole('button', { name: 'Expand' }).click();
	await expect(node(page, 'Deeper')).toBeVisible();
	await row(page, 'Two').getByRole('button', { name: 'Collapse' }).click();
	await expect(node(page, 'Deep')).toBeHidden();
	await expect(node(page, 'Deeper')).toBeHidden();
	await row(page, 'Two').getByRole('button', { name: 'Expand' }).click();
	await expect(node(page, 'Deep')).toBeVisible();
	// 6 branches: 3 right, 3 left.
	await expect(map(page).locator('[data-side="left"] [data-depth="1"]')).toHaveCount(3);
});

test('RM-4 recall mode hides every leaf; reveal + Missed posts the card and counts; Knew it counts', async ({ page, api }) => {
	await openMap(page, api, SIX);
	await enterRecall(page);
	await recallMode(page);
	const leaves = map(page).locator('[data-leaf]');
	const n = await leaves.count();
	expect(n).toBeGreaterThan(5);
	await expect(map(page).locator('[data-leaf] [data-chip]')).toHaveCount(n);
	await expect(map(page).getByText('Second', { exact: true })).toHaveCount(0);
	await expect(map(page).getByText('Branch', { exact: true })).toBeVisible();
	const special = node(page, 'A & "B" <c>');
	await special.getByRole('button', { name: 'Reveal' }).click();
	await expect(special.locator('[data-label]')).toHaveText('A & "B" <c>');
	const req = page.waitForRequest((r) => r.url().endsWith('/api/v1/outis/recall') && r.method() === 'POST');
	await special.getByRole('button', { name: 'Missed' }).click();
	expect((await req).postDataJSON()).toEqual({ root: 'Root', path: ['Root', 'Branch'], label: 'A & "B" <c>', result: 'missed', siblings: ['A & "B" <c>', 'Second'] });
	await expect(special).toHaveAttribute('data-result', 'missed');
	await expect(map(page).locator('[data-recall-count]')).toHaveText('known 0 · missed 1');
	const second = node(page, 'Second');
	await second.getByRole('button', { name: 'Reveal' }).click();
	await second.getByRole('button', { name: 'Knew it' }).click();
	await expect(second).toHaveAttribute('data-result', 'knew');
	await expect(map(page).locator('[data-recall-count]')).toHaveText('known 1 · missed 1');
});

test('RM-5 Knew it on a never-missed leaf stores nothing and shows no toast; Missed toasts once', async ({ page, api }) => {
	await openMap(page, api, SIX);
	await enterRecall(page);
	await recallMode(page);
	const t1 = node(page, 't1');
	await t1.getByRole('button', { name: 'Reveal' }).click();
	const res = page.waitForResponse((r) => r.url().endsWith('/api/v1/outis/recall'));
	await t1.getByRole('button', { name: 'Knew it' }).click();
	expect(await (await res).json()).toEqual({ stored: false, card_id: null, due: null });
	await expect(page.getByText('Saved to Review: My gaps')).toHaveCount(0);
	for (const l of ['f1', 'v1']) {
		await node(page, l).getByRole('button', { name: 'Reveal' }).click();
		await node(page, l).getByRole('button', { name: 'Missed' }).click();
		await expect(node(page, l)).toHaveAttribute('data-result', 'missed');
	}
	await expect(page.getByText('Saved to Review: My gaps')).toHaveCount(1);
});

test('RM-6 keyboard: Enter reveals, m records, Escape leaves recall mode; a map with no leaves has nothing to recall', async ({ page, api }) => {
	await openMap(page, api, SIX);
	await enterRecall(page);
	await recallMode(page);
	const s1 = node(page, 's1');
	await s1.getByRole('button', { name: 'Reveal' }).focus();
	await page.keyboard.press('Enter');
	await expect(s1.locator('[data-label]')).toHaveText('s1');
	await page.keyboard.press('m');
	await expect(s1).toHaveAttribute('data-result', 'missed');
	await page.keyboard.press('Escape');
	await expect(map(page)).toHaveAttribute('data-mode', 'browse');
	await expect(map(page).getByText('Second', { exact: true })).toBeVisible();
	await openMap(page, api, BARE);
	await enterRecall(page);
	await recallMode(page);
	await expect(map(page).locator('[data-recall-count]')).toHaveText('0 to recall');
	await expect(map(page).locator('[data-chip]')).toHaveCount(0);
});

test('RM-7 the tree takes the theme: Spark branch hue, FT paper; full screen offers no Recall', async ({ page, api }) => {
	await openMap(page, api, SIX, 'outis-dark-spark');
	await enterRecall(page);
	const probe = async (prop: string, css: string) =>
		map(page).evaluate((m, [p, c]) => {
			const el = document.createElement('div');
			el.style.cssText = c!;
			m.appendChild(el);
			const v = getComputedStyle(el).getPropertyValue(p!);
			el.remove();
			return v;
		}, [prop, css]);
	const b1 = await probe('color', 'color: var(--outis-diagram-b1-border)');
	expect(b1).toMatch(/^rgb\(/); // a real token colour (dark themes define it since 2026-11-15)
	expect(b1).not.toBe(await page.evaluate(() => getComputedStyle(document.body).color));
	expect(await row(page, 'Branch').locator('[data-label]').evaluate((e) => getComputedStyle(e).borderLeftColor)).toBe(b1);
	await openMap(page, api, SIX, 'outis-light-ft');
	await enterRecall(page);
	const paper = await probe('background-color', 'background: var(--o-page)');
	expect(await map(page).evaluate((e) => getComputedStyle(e).backgroundColor)).toBe(paper);
	await viewer(page).hover();
	await viewer(page).getByRole('button', { name: 'Picture' }).click();
	await viewer(page).hover();
	await viewer(page).getByRole('button', { name: 'Full screen' }).click();
	const dialog = page.getByRole('dialog', { name: 'Diagram' });
	await expect(dialog).toBeVisible();
	await dialog.locator('[data-diagram-viewer]').hover();
	await expect(dialog.getByRole('button', { name: 'Recall', exact: true })).toHaveCount(0);
});

test('RM-8 Reveal all and Reset', async ({ page, api }) => {
	await openMap(page, api, SIX);
	await enterRecall(page);
	await recallMode(page);
	await map(page).getByRole('button', { name: 'Reveal all' }).click();
	await expect(map(page).locator('[data-chip]')).toHaveCount(0);
	await expect(map(page).getByText('Second', { exact: true })).toBeVisible();
	await node(page, 'Second').getByRole('button', { name: 'Missed' }).click();
	await expect(map(page).locator('[data-recall-count]')).toHaveText('known 0 · missed 1');
	await map(page).getByRole('button', { name: 'Reset' }).click();
	const n = await map(page).locator('[data-leaf]').count();
	await expect(map(page).locator('[data-chip]')).toHaveCount(n);
	await expect(map(page).locator('[data-recall-count]')).toHaveText('known 0 · missed 0');
});
