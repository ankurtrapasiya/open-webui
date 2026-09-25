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

test('CD-4 the diagram keeps its native width and the wrapper scrolls', async ({ page, api }) => {
	await openChat(page, api, 'CD-4', `Wide:\n\n${svg(1300)}\n\nEnd`);
	const el = diagram(page);
	await expect(el).toHaveCount(1);
	expect(await el.evaluate((e) => Math.round(e.getBoundingClientRect().width))).toBe(1300);
	expect(await el.evaluate((e) => getComputedStyle(e).maxWidth)).toBe('none');
	expect(
		await el.evaluate((e) => {
			const w = e.closest('.overflow-x-auto') as HTMLElement;
			return w.scrollWidth > w.clientWidth;
		})
	).toBe(true);
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
	expect(await diagram(page).evaluate((e) => Math.round(e.getBoundingClientRect().width))).toBe(1300);
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
		const row = page.locator(`a#sidebar-chat-item[href="/c/${chat.id}"]`).locator('xpath=..');
		await row.hover();
		await row.locator('button[aria-label="Chat Menu"]').click();
	});
});
