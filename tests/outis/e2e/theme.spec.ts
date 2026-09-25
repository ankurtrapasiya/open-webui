import type { Page } from '@playwright/test';
import { test, expect } from '../support/fixtures';

// Palette values from src/outis-dark-theme.css and src/outis-light-theme.css.
const T = {
	'outis-dark': {
		classes: ['dark', 'outis-dark'],
		themeColor: '#090d0c',
		bg: 'rgb(9, 13, 12)',
		text: 'rgb(212, 237, 226)',
		accent: 'rgb(45, 255, 143)',
		filled: 'rgb(45, 255, 143)', // dark:bg-white controls
		codeBg: 'rgb(15, 21, 18)',
		selection: 'rgba(45, 255, 143, 0.16)'
	},
	'outis-light': {
		classes: ['light', 'outis-light'],
		themeColor: '#fafdfc',
		bg: 'rgb(250, 253, 252)',
		text: 'rgb(39, 55, 47)',
		accent: 'rgb(0, 131, 80)',
		filled: 'rgb(0, 110, 67)', // bg-black / bg-gray-900 controls
		codeBg: 'rgb(234, 242, 237)',
		selection: 'rgba(0, 131, 80, 0.14)'
	}
} as const;
type Theme = keyof typeof T;
const THEMES = Object.keys(T) as Theme[];

const RICH = [
	'# Heading one',
	'## Heading two',
	'### Heading three',
	'Body paragraph with **bold**, `inline code` and a [link](https://example.com).',
	'```python\nprint("hi")\nx = 1\n```',
	'After the code.'
].join('\n\n');

async function useTheme(page: Page, theme: string, font?: string) {
	await page.addInitScript(
		([t, f]) => {
			localStorage.setItem('theme', t!);
			if (f) localStorage.setItem('outisFont', f);
			else localStorage.removeItem('outisFont');
		},
		[theme, font ?? '']
	);
}

async function richChat(page: Page, api: any, theme: string, font?: string) {
	const chat = await api.chat({ title: `TH ${theme} ${font ?? ''}`, assistant: RICH, followUps: ['A follow-up question'] });
	await useTheme(page, theme, font);
	await page.goto(`/c/${chat.id}`);
	await expect(page.locator('div[class*="language-"] .cm-editor')).toHaveCount(1);
	return chat;
}

const css = (page: Page, selector: string, prop: string, pseudo?: string) =>
	page.locator(selector).first().evaluate((e, [p, ps]) => getComputedStyle(e, ps || null).getPropertyValue(p!).trim(), [prop, pseudo ?? '']);

const px = async (page: Page, selector: string) => parseFloat(await css(page, selector, 'font-size'));

const rootVar = (page: Page, name: string) =>
	page.evaluate((n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim(), name);

// Adds a probe element with the given classes and returns one computed property.
const probe = (page: Page, classes: string, prop: string, id?: string) =>
	page.evaluate(
		([c, p, i]) => {
			const el = document.createElement('div');
			el.className = c!;
			if (i) el.id = i;
			el.textContent = 'probe';
			document.body.appendChild(el);
			const v = getComputedStyle(el).getPropertyValue(p!).trim();
			el.remove();
			return v;
		},
		[classes, prop, id ?? '']
	);

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

// --- Boot and switching -------------------------------------------------------------------

test('TH-1 a fresh browser boots in Outis-Dark with the default font', async ({ page }) => {
	await page.goto('/');
	const html = page.locator('html');
	await expect(html).toHaveClass(/\bdark\b/);
	await expect(html).toHaveClass(/\boutis-dark\b/);
	expect(await page.evaluate(() => localStorage.theme)).toBe('outis-dark');
	expect(await page.locator('meta[name="theme-color"]').first().getAttribute('content')).toBe('#090d0c');
	expect(await html.getAttribute('data-outis-font')).toBeNull();
});

test('TH-2 the old theme name outis-mneme boots as Outis-Dark and is rewritten', async ({ page }) => {
	await page.addInitScript(() => {
		if (!sessionStorage.th2) {
			sessionStorage.th2 = '1';
			localStorage.setItem('theme', 'outis-mneme');
		}
	});
	await page.goto('/');
	await expect(page.locator('html')).toHaveClass(/\boutis-dark\b/);
	expect(await page.evaluate(() => localStorage.theme)).toBe('outis-dark');
});

async function chooseTheme(page: Page, value: string) {
	await page.getByRole('combobox', { name: 'Theme' }).selectOption(value);
}

test('TH-3 the theme switcher offers both Outis themes and applies them', async ({ page }) => {
	await useTheme(page, 'dark');
	await page.goto('/?settings=general');
	const select = page.getByRole('combobox', { name: 'Theme' });
	await expect(select.locator('option[value="outis-dark"]')).toHaveCount(1);
	await expect(select.locator('option[value="outis-light"]')).toHaveCount(1);
	for (const theme of THEMES) {
		await chooseTheme(page, theme);
		for (const c of T[theme].classes) await expect(page.locator('html')).toHaveClass(new RegExp(`\\b${c}\\b`));
		expect(await page.locator('meta[name="theme-color"]').first().getAttribute('content')).toBe(T[theme].themeColor);
	}
});

test('TH-4 switching through other themes leaves no dark palette on Outis-Light', async ({ page }) => {
	await useTheme(page, 'dark');
	await page.goto('/?settings=general');
	for (const t of ['outis-dark', 'outis-light', 'oled-dark', 'outis-light']) await chooseTheme(page, t);
	const inline = await page.evaluate(() =>
		['800', '850', '900', '950'].map((n) => document.documentElement.style.getPropertyValue(`--color-gray-${n}`))
	);
	expect(inline).toEqual(['', '', '', '']);
	expect(await rootVar(page, '--color-gray-900')).toBe('#0e1913');
});

test('TH-5 the Font picker exists only under the Outis themes', async ({ page }) => {
	await useTheme(page, 'outis-dark');
	await page.goto('/?settings=general');
	const font = page.getByRole('combobox', { name: 'Font' });
	for (const [theme, shown] of [
		['outis-dark', 1],
		['outis-light', 1],
		['dark', 0],
		['oled-dark', 0],
		['light', 0]
	] as const) {
		await chooseTheme(page, theme);
		await expect(font, theme).toHaveCount(shown);
	}
});

// --- Typography ---------------------------------------------------------------------------

test('TH-6 IBM Plex Mono is the default face, including font-sans elements', async ({ page, api }) => {
	await richChat(page, api, 'outis-dark');
	expect(await css(page, 'body', 'font-family')).toMatch(/^"?IBM Plex Mono/);
	expect(await probe(page, 'font-sans', 'font-family')).toMatch(/^"?IBM Plex Mono/);
});

test('TH-7 choosing JetBrains Mono applies it, and after a reload it is set before the app starts', async ({ page }) => {
	await page.addInitScript(() => {
		if (!sessionStorage.th7) {
			sessionStorage.th7 = '1';
			localStorage.setItem('theme', 'outis-dark');
			localStorage.removeItem('outisFont');
		}
		document.addEventListener('DOMContentLoaded', () => {
			(window as any).__fontAtLoad = document.documentElement.getAttribute('data-outis-font');
		});
	});
	await page.goto('/?settings=general');
	await page.getByRole('combobox', { name: 'Font' }).selectOption('jetbrains-mono');
	await expect(page.locator('html')).toHaveAttribute('data-outis-font', 'jetbrains-mono');
	expect(await css(page, 'body', 'font-family')).toMatch(/^"?JetBrains Mono/);

	await page.goto('/');
	expect(await page.evaluate(() => (window as any).__fontAtLoad)).toBe('jetbrains-mono');
	expect(await css(page, 'body', 'font-family')).toMatch(/^"?JetBrains Mono/);
});

test('TH-8 the narrow faces carry their own size ratio', async ({ page }) => {
	for (const [font, scale] of [
		['martian-mono', '0.69'],
		['azeret-mono', '0.74'],
		['', '0.85']
	]) {
		await useTheme(page, 'outis-dark', font || undefined);
		await page.goto('/');
		expect(parseFloat(await rootVar(page, '--outis-prose-scale')), font || 'default').toBe(parseFloat(scale));
	}
});

test('TH-9 one ratio: composer, reply, code block and editor text are the same size and move together', async ({ page, api }) => {
	const sizes = async () =>
		Promise.all([
			px(page, '.markdown-prose p'),
			px(page, '.input-prose'),
			px(page, 'div[class*="language-"]'),
			px(page, 'div[class*="language-"] .cm-editor')
		]);
	await richChat(page, api, 'outis-dark');
	const base = await sizes();
	expect(new Set(base).size, `sizes ${base}`).toBe(1);

	await richChat(page, api, 'outis-dark', 'martian-mono');
	const narrow = await sizes();
	expect(new Set(narrow).size, `sizes ${narrow}`).toBe(1);
	expect(narrow[0] / base[0]).toBeCloseTo(0.69 / 0.85, 2);
});

test('TH-10 the heading ladder is proportional to the body text', async ({ page, api }) => {
	await richChat(page, api, 'outis-dark');
	const body = await px(page, '.markdown-prose p');
	const [h1, h2, h3] = await Promise.all(['h1', 'h2', 'h3'].map((h) => px(page, `.markdown-prose ${h}`)));
	expect(h1 / body).toBeCloseTo(1.18, 2);
	expect(h2 / body).toBeCloseTo(1.09, 2);
	expect(h3 / body).toBeCloseTo(1.0, 2);
	const sm = parseFloat(await probe(page, 'text-sm', 'font-size'));
	const xs = parseFloat(await probe(page, 'text-xs', 'font-size'));
	expect(h1).toBeGreaterThan(h2);
	expect(h2).toBeGreaterThan(h3);
	expect(body).toBeGreaterThan(sm);
	expect(sm).toBeGreaterThan(xs);
});

test('TH-11 follow-ups and the 0.9375rem text match the reply size', async ({ page, api }) => {
	await richChat(page, api, 'outis-dark');
	const body = await px(page, '.markdown-prose p');
	expect(parseFloat(await probe(page, 'text-[0.9375rem]', 'font-size'))).toBeCloseTo(body, 1);
	await expect(page.getByText('A follow-up question')).toBeVisible();
	expect(await page.getByText('A follow-up question').evaluate((e) => parseFloat(getComputedStyle(e).fontSize))).toBeCloseTo(body, 1);
});

// --- Shape --------------------------------------------------------------------------------

test('TH-12 corners are square everywhere', async ({ page, api }) => {
	await richChat(page, api, 'outis-dark');
	for (const cls of ['rounded-full', 'rounded-lg', 'rounded-xl', 'rounded-2xl', 'rounded-3xl']) {
		expect(await probe(page, cls, 'border-top-left-radius'), cls).toBe('0px');
	}
	expect(await css(page, 'div:has(> div[class*="language-"])', 'border-top-left-radius')).toBe('0px');
	await page.goto('/?settings=general');
	expect(await css(page, '[role="dialog"] > div', 'border-top-left-radius').catch(() => '0px')).toBe('0px');
});

test('TH-13 icons have square caps and mitred joins', async ({ page }) => {
	await page.goto('/');
	const svg = page.locator('button svg').first();
	expect(await svg.evaluate((e) => getComputedStyle(e).strokeLinecap)).toBe('square');
	expect(await svg.evaluate((e) => getComputedStyle(e).strokeLinejoin)).toBe('miter');
});

// --- Surfaces and colour ------------------------------------------------------------------

for (const theme of THEMES) {
	test(`TH-14 page background and text colour (${theme})`, async ({ page }) => {
		await useTheme(page, theme);
		await page.goto('/');
		expect(await css(page, 'body', 'background-color')).toBe(T[theme].bg);
		expect(await css(page, 'body', 'color')).toBe(T[theme].text);
		// Autofill can't be triggered from a script; check its override rule is loaded.
		const hasAutofill = await page.evaluate(() =>
			[...document.styleSheets].some((s) => {
				try {
					return [...s.cssRules].some((r) => r.cssText.includes('autofill'));
				} catch {
					return false;
				}
			})
		);
		expect(hasAutofill).toBe(true);
	});

	test(`TH-15 filled primary buttons use the accent (${theme})`, async ({ page }) => {
		await useTheme(page, theme);
		await page.goto('/?settings=general');
		const save = page.getByRole('dialog').getByRole('button', { name: 'Save' });
		// The button fades between colours; wait for it to settle.
		await expect.poll(() => save.evaluate((e) => getComputedStyle(e).backgroundColor)).toBe(T[theme].filled);
		const bg = await save.evaluate((e) => getComputedStyle(e).backgroundColor);
		const fg = await save.evaluate((e) => getComputedStyle(e).color);
		expect(bg).toBe(T[theme].filled);
		expect(contrast(bg, fg)).toBeGreaterThanOrEqual(4.5);
	});

	test(`TH-18 text selection uses the accent tint (${theme})`, async ({ page }) => {
		await useTheme(page, theme);
		await page.goto('/');
		expect(await css(page, 'body', 'background-color', '::selection')).toBe(T[theme].selection);
	});

	test(`TH-21 code block, editor and gutter share one background (${theme})`, async ({ page, api }) => {
		await richChat(page, api, theme);
		for (const sel of ['div[class*="language-"] .cm-editor', 'div[class*="language-"] .cm-gutters']) {
			const bg = await css(page, sel, 'background-color');
			expect(bg, sel).toBe(T[theme].codeBg);
		}
	});

	test(`TH-22 a focused code block gets an accent frame on all four sides (${theme})`, async ({ page, api }) => {
		await richChat(page, api, theme);
		const wrapper = 'div:has(> div[class*="language-"])';
		const unfocused = await css(page, wrapper, 'border-top-color');
		expect(unfocused).not.toBe(T[theme].accent);
		await page.locator('div[class*="language-"] .cm-content').click();
		for (const side of ['top', 'right', 'bottom', 'left']) {
			expect(await css(page, wrapper, `border-${side}-color`), side).toBe(T[theme].accent);
		}
	});
}

test('TH-16 the confirm button is the accent with readable text, also in high contrast', async ({ page, api }) => {
	const chat = await api.chat({ title: 'TH-16 delete me', assistant: 'x' });
	await useTheme(page, 'outis-dark');
	await page.addInitScript(() => localStorage.setItem('sidebar', 'true'));
	await page.goto(`/c/${chat.id}`);
	const row = page.locator(`a#sidebar-chat-item[href="/c/${chat.id}"]`).locator('xpath=..');
	await row.hover();
	await row.locator('button[aria-label="Chat Menu"]').click();
	await page.getByRole('menuitem', { name: 'Delete' }).or(page.getByText('Delete', { exact: true })).last().click();
	const confirm = page.getByRole('dialog').getByRole('button', { name: 'Confirm' });
	await expect(confirm).toBeVisible();

	for (const highContrast of [false, true]) {
		await page.evaluate((h) => document.documentElement.classList.toggle('high-contrast', h), highContrast);
		const bg = await confirm.evaluate((e) => getComputedStyle(e).backgroundColor);
		const fg = await confirm.evaluate((e) => getComputedStyle(e).color);
		expect(bg, `high contrast ${highContrast}`).toBe(T['outis-dark'].accent);
		expect(contrast(bg, fg), `high contrast ${highContrast}`).toBeGreaterThanOrEqual(4.5);
	}
	await page.keyboard.press('Escape'); // leave the chat in place
});

test('TH-17 focus: the keyboard ring is the accent, the composer has none unless high contrast', async ({ page }) => {
	await useTheme(page, 'outis-dark');
	await page.goto('/');

	// Keyboard focus on a button shows the accent ring.
	let outline = '';
	for (let i = 0; i < 15 && !outline; i++) {
		await page.keyboard.press('Tab');
		outline = await page.evaluate(() => {
			const a = document.activeElement as HTMLElement | null;
			return a && a.tagName === 'BUTTON' ? getComputedStyle(a).outlineColor : '';
		});
	}
	expect(outline).toBe(T['outis-dark'].accent);

	// The composer shows no ring...
	await page.locator('#chat-input').click();
	expect(await css(page, '#chat-input-container', 'outline-style')).toBe('none');
	expect(await css(page, '#chat-input', 'outline-style')).toBe('none');

	// ...unless high contrast is on.
	await page.evaluate(() => document.documentElement.classList.add('high-contrast'));
	await page.locator('#chat-input').blur();
	await page.locator('#chat-input').click();
	expect(await css(page, '#chat-input', 'outline-style')).not.toBe('none');
});

test('TH-19 text on an accent badge is dark, not white (Outis-Dark)', async ({ page }) => {
	await useTheme(page, 'outis-dark');
	await page.goto('/');
	expect(await probe(page, 'bg-blue-500 text-white', 'color')).toBe(T['outis-dark'].bg);
});

test('TH-20 dark:text-white renders as the palette off-white (Outis-Dark)', async ({ page }) => {
	await useTheme(page, 'outis-dark');
	await page.goto('/');
	expect(await probe(page, 'dark:text-white', 'color')).toBe(T['outis-dark'].text);
});

test('TH-23 an open code editor recolours when the theme changes', async ({ page, api }) => {
	const chat = await richChat(page, api, 'outis-dark');
	expect(await css(page, 'div[class*="language-"] .cm-editor', 'background-color')).toBe(T['outis-dark'].codeBg);
	await page.goto(`/c/${chat.id}?settings=general`);
	await expect(page.locator('div[class*="language-"] .cm-editor')).toHaveCount(1);
	await chooseTheme(page, 'outis-light');
	await expect
		.poll(() => css(page, 'div[class*="language-"] .cm-editor', 'background-color'))
		.toBe(T['outis-light'].codeBg);
});

test('TH-24 no stock sky-blue or blue-500 on the chat page or in settings', async ({ page, api }) => {
	const STOCK = ['oklch(0.685 0.169 237.323)', 'oklch(0.588 0.158 241.966)', 'oklch(0.623 0.214 259.815)'];
	const offenders = () =>
		page.evaluate((stock) => {
			const bad: string[] = [];
			for (const el of document.querySelectorAll('body *')) {
				if (el.closest('[data-alert-type], .alert')) continue; // AlertRenderer: one hue per alert type, on purpose
				const s = getComputedStyle(el);
				for (const v of [s.color, s.backgroundColor, s.borderTopColor]) {
					if (stock.some((c) => v.includes(c))) bad.push(`${el.tagName}.${String(el.className).slice(0, 60)} ${v}`);
				}
			}
			return bad;
		}, STOCK);
	await richChat(page, api, 'outis-dark');
	expect(await offenders(), 'chat page').toEqual([]);
	await page.goto('/?settings=general');
	expect(await offenders(), 'settings').toEqual([]);
});

test('TH-25 emerald text classes resolve to the accent', async ({ page }) => {
	await useTheme(page, 'outis-dark');
	await page.goto('/');
	for (const cls of ['text-emerald-500', 'text-emerald-600', 'text-emerald-700']) {
		expect(await probe(page, cls, 'color'), cls).toBe(T['outis-dark'].accent);
	}
});

test('TH-26 light theme: the favicon is darkened and the splash is the page colour', async ({ page }) => {
	await useTheme(page, 'outis-light');
	await page.goto('/');
	expect(await css(page, 'img[src$="favicon.png"]', 'filter')).toBe('brightness(0.431)');
	expect(await probe(page, '', 'background-color', 'splash-screen')).toBe(T['outis-light'].bg);
});
