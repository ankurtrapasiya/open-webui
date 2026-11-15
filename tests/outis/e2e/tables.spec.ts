import type { Page } from '@playwright/test';
import { test, expect } from '../support/fixtures';

// Chat tables (user-approved style, 2026-11-15): reply-sized text, sentence-case ink header on the
// chrome tone, per-column numeric alignment with tabular figures, labelled first column, stripes
// only on wide (4+ column) tables. Tokens follow every Outis theme.
const WIDE = ['| Learner | Leaf size | RMSE (in) | Corr | Verdict |', '|---|---|---|---|---|', '| LinReg | – | 0.0042 | 0.71 | Baseline |', '| DT | 5 | 0.0031 | 0.62 | Overfits |', '| Bag | 5 | 0.0035 | 0.73 | **Best** |'].join('\n');
const NARROW = ['| Symbol | Meaning |', '|---|---|', '| sigma | Volatility |', '| beta | Market sensitivity |', '| alpha | The rest |'].join('\n');
const ALIGNED = ['| Name | Count |', '|:---|:---|', '| a | 1 |', '| b | 22 |'].join('\n');

async function open(page: Page, api: any, md: string, theme = 'outis-dark') {
	const chat = await api.chat({ title: `TB ${theme}`, assistant: `Intro.\n\n${md}\n\nAfter.` });
	await page.addInitScript((t) => localStorage.setItem('theme', t), theme);
	await page.goto(`/c/${chat.id}`);
	const msg = page.locator('#response-content-container').last();
	await expect(msg.locator('table').first()).toBeVisible();
	return msg;
}
const style = (loc: any, prop: string) => loc.evaluate((e: Element, p: string) => getComputedStyle(e).getPropertyValue(p), prop);
const probe = (page: Page, css: string, prop: string) =>
	page.evaluate(([c, p]) => {
		const el = document.createElement('div');
		el.style.cssText = c!;
		document.body.appendChild(el);
		const v = getComputedStyle(el).getPropertyValue(p!);
		el.remove();
		return v;
	}, [css, prop]);

test('TB-1 body cells read at the reply size with tabular figures; header is sentence case, medium, ink, on the chrome tone', async ({ page, api }) => {
	const msg = await open(page, api, WIDE);
	const p = msg.locator('p').first();
	const td = msg.locator('tbody td').nth(1);
	const th = msg.locator('thead th').first();
	expect(await style(td, 'font-size')).toBe(await style(p, 'font-size'));
	expect(await style(td, 'font-variant-numeric')).toContain('tabular-nums');
	expect(await style(th, 'text-transform')).toBe('none');
	expect(await style(th, 'font-weight')).toBe('500');
	expect(await style(th, 'color')).toBe(await probe(page, 'color: var(--outis-input-fg)', 'color'));
	expect(await style(th, 'background-color')).toBe(await probe(page, 'background: var(--outis-chrome)', 'background-color'));
	expect(await style(th, 'border-bottom-color')).toBe(await probe(page, 'color: var(--outis-divider)', 'color'));
	expect(await style(msg.locator('tbody td').first(), 'font-weight')).toBe('500');
});

test('TB-2 numeric columns are right-aligned as a whole (header, dash and cells); text columns are not; explicit markdown alignment wins', async ({ page, api }) => {
	const msg = await open(page, api, WIDE);
	const ths = msg.locator('thead th');
	const row0 = msg.locator('tbody tr').first().locator('td');
	for (const i of [1, 2, 3]) {
		await expect(ths.nth(i)).toHaveAttribute('data-num', '');
		expect(await style(row0.nth(i), 'text-align')).toBe('right');
	}
	expect(await style(row0.nth(1).locator('div'), 'text-align')).not.toBe('left'); // the "–" follows its column
	for (const i of [0, 4]) {
		await expect(ths.nth(i)).not.toHaveAttribute('data-num', '');
		expect(await style(row0.nth(i), 'text-align')).not.toBe('right');
	}
	const aligned = await open(page, api, ALIGNED);
	expect(await style(aligned.locator('tbody td').nth(1), 'text-align')).toBe('left');
});

test('TB-3 alternate rows are striped on a wide table only', async ({ page, api }) => {
	const wide = await open(page, api, WIDE);
	const even = await style(wide.locator('tbody tr').nth(1).locator('td').first(), 'background-color');
	const odd = await style(wide.locator('tbody tr').nth(0).locator('td').first(), 'background-color');
	expect(even).not.toBe(odd);
	expect(odd).toBe('rgba(0, 0, 0, 0)');
	const narrow = await open(page, api, NARROW);
	expect(await style(narrow.locator('tbody tr').nth(1).locator('td').first(), 'background-color')).toBe('rgba(0, 0, 0, 0)');
});

test('TB-4 the header tone and divider follow each theme', async ({ page, api }) => {
	for (const theme of ['outis-light', 'outis-dark-spark', 'outis-light-ft']) {
		const msg = await open(page, api, WIDE, theme);
		const th = msg.locator('thead th').first();
		expect(await style(th, 'background-color'), theme).toBe(await probe(page, 'background: var(--outis-chrome)', 'background-color'));
		expect(await style(th, 'border-bottom-color'), theme).toBe(await probe(page, 'color: var(--outis-divider)', 'color'));
		expect(await style(msg.locator('tbody td').nth(1), 'color'), theme).toBe(await probe(page, 'color: var(--outis-input-fg)', 'color'));
	}
});
