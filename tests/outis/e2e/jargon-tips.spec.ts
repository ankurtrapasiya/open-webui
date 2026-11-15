import type { Page } from '@playwright/test';
import { test, expect } from '../support/fixtures';

// Jargon tips: [term]{tip="…"} in a reply shows the term underlined with its plain meaning on
// hover, focus or tap. Spec: specs/SPEC-jargon-tips.md.

const REPLY = [
	'The [gradient]{tip="the slope of the loss: which way it rises, and how steeply"} tells the optimiser where to step.',
	'A fund\'s [beta]{tip="how much the fund moves when the market moves 1%" src="Lectures/02-risk.md"} is its market sensitivity.',
	'[alpha]{tip="return not explained by the market" ai} is the rest.',
	'Not a tip: [plain text]{tip=unquoted} and [a link](https://example.com) stay as they are.',
	'Code is untouched: `[x]{tip="no"}`.'
].join('\n\n');

async function useTheme(page: Page, theme: string) {
	await page.addInitScript((t) => localStorage.setItem('theme', t), theme);
}

async function openChat(page: Page, api: any, title: string, theme = 'outis-light') {
	const chat = await api.chat({ title, assistant: REPLY });
	await useTheme(page, theme);
	await page.goto(`/c/${chat.id}`);
	const message = page.locator('#response-content-container').last();
	await expect(message).toBeVisible();
	return message;
}

test('JT-1 a marked term renders underlined with its tip hidden until hover', async ({
	page,
	api
}) => {
	const message = await openChat(page, api, 'JT-1');
	const term = message.locator('.o-tip', { hasText: 'gradient' });
	await expect(term).toHaveText(/^gradient/);
	await expect(term).toHaveCSS('text-decoration-style', 'dotted');
	const box = term.locator('.o-tip-box');
	await expect(box).toBeHidden();
	await term.hover();
	await expect(box).toBeVisible();
	await expect(box).toHaveText('the slope of the loss: which way it rises, and how steeply');
	// The raw markup never shows.
	await expect(message).not.toContainText('{tip=');
});

test('JT-2 a verified tip names its source; an ai tip carries the AI chip', async ({
	page,
	api
}) => {
	const message = await openChat(page, api, 'JT-2');
	const beta = message.locator('.o-tip', { hasText: 'beta' });
	await beta.hover();
	await expect(beta.locator('.o-tip-src')).toHaveText('Lectures/02-risk.md');
	await expect(beta).not.toHaveClass(/o-tip-ai/);
	const alpha = message.locator('.o-tip', { hasText: 'alpha' });
	await expect(alpha).toHaveClass(/o-tip-ai/);
	await alpha.hover();
	const chip = await alpha
		.locator('.o-tip-box')
		.evaluate((e) => getComputedStyle(e, '::after').content);
	expect(chip).toBe('"AI"');
});

test('JT-3 keyboard: focus shows the tip, Escape hides it; a tap toggles it', async ({
	page,
	api
}) => {
	const message = await openChat(page, api, 'JT-3');
	const term = message.locator('.o-tip', { hasText: 'gradient' });
	const box = term.locator('.o-tip-box');
	await term.focus();
	await expect(box).toBeVisible();
	await page.keyboard.press('Escape');
	await expect(box).toBeHidden();
	await page.mouse.move(0, 0);
	await term.dispatchEvent('click');
	await expect(term).toHaveClass(/o-tip-open/);
	await term.dispatchEvent('click');
	await expect(term).not.toHaveClass(/o-tip-open/);
});

test('JT-4 opening a tip moves nothing on the page', async ({ page, api }) => {
	const message = await openChat(page, api, 'JT-4');
	const last = message.locator('p').last();
	const before = await last.boundingBox();
	await message.locator('.o-tip', { hasText: 'gradient' }).hover();
	await expect(message.locator('.o-tip-box').first()).toBeVisible();
	expect(await last.boundingBox()).toEqual(before);
});

test('JT-5 malformed markers, links and code are left alone', async ({ page, api }) => {
	const message = await openChat(page, api, 'JT-5');
	await expect(message.locator('.o-tip')).toHaveCount(3);
	await expect(message).toContainText('[plain text]{tip=unquoted}');
	await expect(
		message.locator('a[href="https://example.com/"], a[href="https://example.com"]')
	).toHaveText('a link');
	await expect(message.locator('code', { hasText: '[x]{tip="no"}' })).toHaveCount(1);
});

test('JT-6 the tip box takes the theme surface in dark and light', async ({ page, api }) => {
	for (const [theme, bg] of [
		['outis-light', 'rgb(243, 240, 234)'],
		['outis-dark', 'rgb(33, 29, 26)']
	] as const) {
		const message = await openChat(page, api, `JT-6 ${theme}`, theme);
		const term = message.locator('.o-tip', { hasText: 'gradient' });
		await term.hover();
		await expect(term.locator('.o-tip-box')).toHaveCSS('background-color', bg);
	}
});
