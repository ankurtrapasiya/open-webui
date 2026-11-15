import { test, expect } from '../support/fixtures';

// LaTeX in a Markdown table cell renders as maths, readable, in all four themes (outis-owui issue #28).
// No model is called: the chat is saved with a fixed reply. Spec: specs/SPEC-chat-render.md (TL-1..2).
const THEMES = ['outis-dark', 'outis-light', 'outis-dark-spark', 'outis-light-ft'];

const TABLE = [
	'| factor | job |',
	'|---|---|',
	'| \\(\\mathrm{tfidf}(p)\\) | how important p is |',
	'| \\(\\mathrm{sim}(p,\\ \\text{seed}_s)\\) | how close p is to the seed |'
].join('\n');

function luminance(rgb: string) {
	const [r, g, b] = rgb.match(/[\d.]+/g)!.slice(0, 3).map((v) => {
		const c = Number(v) / 255;
		return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
	});
	return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const contrast = (a: string, b: string) => {
	const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m);
	return (x + 0.05) / (y + 0.05);
};

for (const theme of THEMES) {
	test(`TL-1 ${theme}: LaTeX in a table cell renders as maths and is readable`, async ({ page, api }) => {
		const chat = await api.chat({ title: `TL-1 ${theme}`, assistant: TABLE });
		await page.addInitScript((t) => localStorage.setItem('theme', t), theme);
		await page.goto(`/c/${chat.id}`);
		const table = page.locator('table').first();
		await expect(table.locator('td .katex')).toHaveCount(2);
		await expect(table.locator('.katex-error')).toHaveCount(0);
		const text = await table.innerText();
		expect(text).not.toContain('\\(');
		expect(text).not.toContain('\\mathrm');
		// The formula colour against the first background that is not transparent, walking up from the formula.
		const [fg, bg] = await table.locator('td .katex').first().evaluate((el) => {
			const fg = getComputedStyle(el).color;
			let n: Element | null = el, bg = 'rgba(0, 0, 0, 0)';
			while (n && /rgba\(.*, 0\)|transparent/.test(bg)) { bg = getComputedStyle(n).backgroundColor; n = n.parentElement; }
			return [fg, bg];
		});
		expect(contrast(fg, bg), `formula ${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5);
		// Saved under test-results/ for a human look (the folder is wiped on the next run).
		const shot = test.info().outputPath(`table-${theme}.png`);
		await table.screenshot({ path: shot });
		await test.info().attach(`table-${theme}.png`, { path: shot, contentType: 'image/png' });
	});
}

// TL-2: the cause of #28. A formula in backticks is code, never maths. If this ever starts rendering maths,
// the rule against backticked formulas can be dropped; until then it proves TL-1 can fail.
test('TL-2 a backticked formula in a cell stays code, not maths', async ({ page, api }) => {
	const chat = await api.chat({ title: 'TL-2', assistant: '| f |\n|---|\n| `\\mathrm{tfidf}(p)` |' });
	await page.goto(`/c/${chat.id}`);
	await expect(page.locator('table td code')).toHaveCount(1);
	await expect(page.locator('table td .katex')).toHaveCount(0);
});
