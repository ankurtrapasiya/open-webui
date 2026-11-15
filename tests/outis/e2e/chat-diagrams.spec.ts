import type { Page } from '@playwright/test';
import { test, expect } from '../support/fixtures';

// What the Kroki filter leaves in an assistant message: a wrapper div around an SVG whose
// colours read the theme's --outis-diagram-* variables, with the dark value as the fallback.
const DARK_B1_TINT = '#123456';
const svg = (w = 1300) =>
	`<div class="outis-diagram"><svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="300" viewBox="0 0 ${w} 300">` +
	`<rect id="cd-rect" width="200" height="80" style="fill:var(--outis-diagram-b1-tint, ${DARK_B1_TINT})"/>` +
	`<text x="20" y="50">Leaf node</text><script>window.__cdScript = 1</script></svg></div>`;

const diagram = (page: Page) => page.locator('.outis-diagram > svg');

async function openChat(page: Page, api: any, title: string, assistant: string, theme = 'outis-dark') {
	const chat = await api.chat({ title, assistant });
	await page.addInitScript((t) => {
		localStorage.setItem('theme', t);
		localStorage.setItem('sidebar', 'true');
	}, theme);
	await page.goto(`/c/${chat.id}`);
	return chat;
}

test('CD-1 a diagram after a blank line renders as a live SVG between the paragraphs', async ({ page, api }) => {
	await openChat(page, api, 'CD-1', `Intro paragraph\n\n${svg()}\n\nAfter paragraph`);
	await expect(diagram(page)).toHaveCount(1);
	await expect(page.getByText('Intro paragraph')).toBeVisible();
	await expect(page.getByText('After paragraph')).toBeVisible();
});

test('CD-2 a diagram right after a line of text (no blank line) still renders', async ({ page, api }) => {
	await openChat(page, api, 'CD-2', `Intro line\n${svg()}\n\nAfter`);
	await expect(diagram(page)).toHaveCount(1);
});

test('CD-3 the diagram is live SVG, not escaped markup', async ({ page, api }) => {
	await openChat(page, api, 'CD-3', `Here:\n\n${svg()}\n\nDone`);
	await expect(diagram(page)).toHaveCount(1);
	expect(await diagram(page).evaluate((e) => e instanceof SVGSVGElement)).toBe(true);
	await expect(page.getByText('<svg', { exact: false })).toHaveCount(0);
});

test('CD-4 the SVG keeps its native size inside the viewer (labels drawn full size; zoom is a transform)', async ({ page, api }) => {
	await openChat(page, api, 'CD-4', `Wide:\n\n${svg(1300)}\n\nEnd`);
	const el = diagram(page);
	await expect(el).toHaveCount(1);
	expect(await el.evaluate((e) => (e as unknown as SVGSVGElement).width.baseVal.value)).toBe(1300);
	expect(await el.evaluate((e) => getComputedStyle(e).maxWidth)).toBe('none');
	await expect(page.locator('[data-diagram-viewer]')).toHaveCount(1);
});

test('CD-5 a script inside the diagram is removed and never runs', async ({ page, api }) => {
	await openChat(page, api, 'CD-5', `S:\n\n${svg()}\n\nE`);
	await expect(diagram(page)).toHaveCount(1);
	await expect(page.locator('.outis-diagram script')).toHaveCount(0);
	expect(await page.evaluate(() => (window as any).__cdScript)).toBeUndefined();
});

test('CD-6 the light theme colours the diagram through its variables', async ({ page, api }) => {
	await openChat(page, api, 'CD-6', `L:\n\n${svg()}\n\nE`, 'outis-light');
	await expect(diagram(page)).toHaveCount(1);
	const tint = await page
		.locator('.outis-diagram')
		.evaluate((e) => getComputedStyle(e).getPropertyValue('--outis-diagram-b1-tint').trim());
	expect(tint).toBe('#dcede9');
	expect(await page.locator('#cd-rect').evaluate((e) => getComputedStyle(e).fill)).toBe('rgb(220, 237, 233)');
});

test('CD-7 the dark theme leaves the diagram on its built-in dark colours', async ({ page, api }) => {
	await openChat(page, api, 'CD-7', `D:\n\n${svg()}\n\nE`, 'outis-dark');
	await expect(diagram(page)).toHaveCount(1);
	expect(await page.locator('#cd-rect').evaluate((e) => getComputedStyle(e).fill)).toBe('rgb(18, 52, 86)');
});

// Watches for the off-screen copy the PDF export makes and records how the diagram is sized in it.
async function watchPdfClone(page: Page) {
	await page.evaluate(() => {
		(window as any).__cdClone = null;
		new MutationObserver((records, obs) => {
			for (const r of records)
				for (const n of r.addedNodes) {
					const el = n as HTMLElement;
					const s = el.querySelector?.('.outis-diagram > svg') as SVGSVGElement | null;
					if (s && el.style?.left === '-9999px') {
						requestAnimationFrame(() => {
							(window as any).__cdClone = {
								maxWidth: s.style.maxWidth,
								width: Math.round(s.getBoundingClientRect().width)
							};
						});
						obs.disconnect();
					}
				}
		}).observe(document.body, { childList: true, subtree: true });
	});
}

async function expectPdfFitsDiagram(page: Page, openMenu: () => Promise<void>) {
	await watchPdfClone(page);
	await openMenu();
	await page.getByText('Download', { exact: true }).last().click();
	const download = page.waitForEvent('download', { timeout: 45_000 });
	await page.getByText('PDF document (.pdf)', { exact: true }).last().click();
	expect((await download).suggestedFilename()).toMatch(/\.pdf$/);

	const clone = await page.evaluate(() => (window as any).__cdClone);
	expect(clone, 'the export clone was observed').not.toBeNull();
	expect(clone.maxWidth).toBe('100%');
	expect(clone.width).toBeLessThanOrEqual(800);
	// The diagram on screen is untouched.
	expect(await diagram(page).evaluate((e) => (e as HTMLElement).style.maxWidth)).toBe('');
}

test('CD-8 the chat PDF shrinks a wide diagram to the page (chat header menu)', async ({ page, api }) => {
	await openChat(page, api, 'CD-8 pdf', `P:\n\n${svg(1300)}\n\nE`);
	await expect(diagram(page)).toHaveCount(1);
	await expectPdfFitsDiagram(page, async () => {
		await page.locator('button[aria-label="Chat actions"]').click();
	});
});

test('CD-9 the chat PDF shrinks a wide diagram to the page (sidebar chat menu)', async ({ page, api }) => {
	const chat = await openChat(page, api, 'CD-9 sidebar', `P:\n\n${svg(1300)}\n\nE`);
	await expect(diagram(page)).toHaveCount(1);
	await expectPdfFitsDiagram(page, async () => {
		const row = page.locator(`#sidebar-chat-item:has(a[href="/c/${chat.id}"])`).locator('xpath=..');
		await row.hover();
		await row.locator('button[aria-label="Chat Menu"]').click();
	});
});

// --- Viewer (diagram readability plan, Task 5): overview first, zoom on demand ---

const viewer = (page: Page) => page.locator('[data-diagram-viewer]').first();
const zoomOf = async (page: Page) => Number(await viewer(page).getAttribute('data-zoom'));

test('CD-10 a wide diagram opens fitted to the column; Zoom in, Fit and double-click work', async ({ page, api }) => {
	await openChat(page, api, 'CD-10', `Wide:\n\n${svg(2400)}\n\nEnd`);
	await expect(viewer(page)).toBeVisible();
	const fit = await zoomOf(page);
	expect(fit).toBeLessThan(1);
	const [vw, pw] = await viewer(page).evaluate((e) => [e.getBoundingClientRect().width, e.parentElement!.getBoundingClientRect().width]);
	expect(vw).toBeLessThanOrEqual(pw + 1);
	await viewer(page).hover();
	await viewer(page).getByRole('button', { name: 'Zoom in' }).click();
	expect(await zoomOf(page)).toBeGreaterThan(fit);
	await viewer(page).getByRole('button', { name: 'Fit diagram' }).click();
	expect(await zoomOf(page)).toBeCloseTo(fit, 2);
	await viewer(page).dblclick();
	expect(Math.abs((await zoomOf(page)) - fit * 2)).toBeLessThan(0.02);
});

test('CD-11 the wheel scrolls the page over an unclicked diagram, and zooms once it is clicked', async ({ page, api }) => {
	await openChat(page, api, 'CD-11', `${'Paragraph.\n\n'.repeat(25)}${svg(2400)}\n\n${'More.\n\n'.repeat(40)}`);
	await viewer(page).scrollIntoViewIfNeeded();
	const fit = await zoomOf(page);
	const scroller = page.locator('#messages-container');
	const before = await scroller.evaluate((e) => e.scrollTop);
	await viewer(page).hover();
	await page.mouse.wheel(0, 300);
	await expect.poll(() => scroller.evaluate((e) => e.scrollTop)).not.toBe(before);
	expect(await zoomOf(page)).toBe(fit);
	await viewer(page).click();
	await page.mouse.wheel(0, -300);
	await expect.poll(() => zoomOf(page)).toBeGreaterThan(fit);
});

test('CD-12 a diagram narrower than the column is not upscaled and offers only Full screen', async ({ page, api }) => {
	await openChat(page, api, 'CD-12', `Small:\n\n${svg(400)}\n\nEnd`);
	await expect(viewer(page)).toHaveAttribute('data-zoom', '1.00');
	await expect(viewer(page).getByRole('button', { name: 'Zoom in' })).toHaveCount(0);
	await expect(viewer(page).getByRole('button', { name: 'Fit diagram' })).toHaveCount(0);
	await expect(viewer(page).getByRole('button', { name: 'Full screen' })).toHaveCount(1);
});

test('CD-13 zooming transforms the viewer stage, never the SVG (chat export copies the SVG)', async ({ page, api }) => {
	await openChat(page, api, 'CD-13', `Wide:\n\n${svg(2400)}\n\nEnd`);
	await viewer(page).hover();
	await viewer(page).getByRole('button', { name: 'Zoom in' }).click();
	expect(await diagram(page).evaluate((e) => getComputedStyle(e).transform)).toBe('none');
	expect(await page.locator('[data-diagram-stage]').first().evaluate((e) => getComputedStyle(e).transform)).not.toBe('none');
});

test('CD-14 Full screen opens the diagram in a dialog; Escape closes it', async ({ page, api }) => {
	await openChat(page, api, 'CD-14', `Wide:\n\n${svg(2400)}\n\nEnd`);
	await viewer(page).hover();
	await viewer(page).getByRole('button', { name: 'Full screen' }).click();
	const dialog = page.getByRole('dialog', { name: 'Diagram' });
	await expect(dialog).toBeVisible();
	await expect(dialog.locator('.outis-diagram > svg')).toHaveCount(1);
	await page.keyboard.press('Escape');
	await expect(dialog).toHaveCount(0);
});

test('CD-15 Spark and FT give diagrams their own root colour, also in the full-screen view after a switch', async ({ page, api }) => {
	const rooted = `<div class="outis-diagram"><svg xmlns="http://www.w3.org/2000/svg" width="2400" height="300" viewBox="0 0 2400 300"><rect class="cd-root" width="200" height="80" style="fill:var(--outis-diagram-root-fill, #000000)"/></svg></div>`;
	await openChat(page, api, 'CD-15', `Root:\n\n${rooted}\n\nEnd`, 'outis-dark-spark');
	const fill = (scope: any) => scope.locator('.cd-root').first().evaluate((e: Element) => getComputedStyle(e).fill);
	expect(await fill(page)).toBe('rgb(26, 42, 13)');
	await viewer(page).hover();
	await viewer(page).getByRole('button', { name: 'Full screen' }).click();
	const dialog = page.getByRole('dialog', { name: 'Diagram' });
	await page.evaluate(() => (document.documentElement.className = 'light outis-light outis-ft'));
	expect(await fill(dialog)).toBe('rgb(245, 235, 221)');
});

test('CD-16 the mind map root follows each theme\'s accent, not the retired mint; double-click selects no text', async ({ page, api }) => {
	const rooted = `<div class="outis-diagram"><svg xmlns="http://www.w3.org/2000/svg" width="2400" height="300" viewBox="0 0 2400 300"><text class="cd-rt" x="10" y="40" style="fill:var(--outis-diagram-root-text, #00cf76)">Root label</text></svg></div>`;
	const want = { 'outis-dark': 'rgb(147, 196, 237)', 'outis-light': 'rgb(26, 88, 143)' };
	for (const [theme, colour] of Object.entries(want)) {
		await openChat(page, api, `CD-16 ${theme}`, `Root:\n\n${rooted}\n\nEnd`, theme);
		expect(await page.locator('.cd-rt').first().evaluate((e) => getComputedStyle(e).fill), theme).toBe(colour);
	}
	await viewer(page).dblclick({ position: { x: 30, y: 15 } });
	expect(await page.evaluate(() => window.getSelection()?.toString() ?? '')).toBe('');
});

test('CD-17 a tap on a narrow diagram leaves touch scrolling on; full screen zooms on the wheel without a click', async ({ page, api }) => {
	await openChat(page, api, 'CD-17', `Small:\n\n${svg(400)}\n\nEnd`);
	await viewer(page).click();
	expect(await viewer(page).evaluate((e) => getComputedStyle(e).touchAction)).toBe('pan-y');
	await openChat(page, api, 'CD-17 wide', `Wide:\n\n${svg(2400)}\n\nEnd`);
	await viewer(page).hover();
	await viewer(page).getByRole('button', { name: 'Full screen' }).click();
	const full = page.getByRole('dialog', { name: 'Diagram' }).locator('[data-diagram-viewer]');
	const z0 = Number(await full.getAttribute('data-zoom'));
	await full.hover({ position: { x: 200, y: 200 } });
	await page.mouse.wheel(0, -300);
	await expect.poll(async () => Number(await full.getAttribute('data-zoom'))).toBeGreaterThan(z0);
});
