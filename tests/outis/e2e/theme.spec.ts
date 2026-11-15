import { readFileSync } from 'fs';
import { join } from 'path';
import type { Page } from '@playwright/test';
import { test, expect } from '../support/fixtures';

// Palette values from src/outis-dark-theme.css and src/outis-light-theme.css.
const T = {
	// 2026-11-14 palette (docs/outis-theme-colour-research.md): calm blue accent, green kept for success.
	'outis-dark': {
		classes: ['dark', 'outis-dark'],
		themeColor: '#1a1713',
		bg: 'rgb(26, 23, 19)',
		text: 'rgb(217, 211, 205)',
		white: 'rgb(231, 226, 220)', // dark:text-white -> gray-50
		onAccent: 'rgb(20, 17, 14)', // text on accent fills -> gray-950
		accent: 'rgb(132, 185, 230)',
		filled: 'rgb(132, 185, 230)', // dark:bg-white controls
		success: 'rgb(139, 205, 153)',
		codeBg: 'rgb(33, 29, 26)',
		selection: 'rgba(132, 185, 230, 0.18)'
	},
	'outis-light': {
		classes: ['light', 'outis-light'],
		themeColor: '#fbf9f5',
		bg: 'rgb(251, 249, 245)',
		text: 'rgb(54, 50, 45)',
		white: 'rgb(251, 249, 245)',
		onAccent: 'rgb(251, 249, 245)',
		accent: 'rgb(34, 102, 164)',
		filled: 'rgb(26, 88, 143)', // bg-black / bg-gray-900 controls -> blue-600
		success: 'rgb(43, 116, 64)',
		codeBg: 'rgb(243, 240, 234)',
		selection: 'rgba(34, 102, 164, 0.18)'
	},
	// Palette variants (src/outis-variants.css): Spark = DGX Spark skin, FT = Financial Times paper.
	'outis-dark-spark': {
		classes: ['dark', 'outis-dark', 'outis-spark'],
		themeColor: '#12200a',
		bg: 'rgb(18, 32, 10)',
		text: 'rgb(213, 226, 192)',
		white: 'rgb(227, 237, 208)',
		onAccent: 'rgb(15, 26, 6)',
		accent: 'rgb(118, 185, 0)',
		filled: 'rgb(118, 185, 0)',
		success: 'rgb(164, 225, 0)',
		codeBg: 'rgb(26, 42, 13)',
		selection: 'rgba(118, 185, 0, 0.22)'
	},
	'outis-light-ft': {
		classes: ['light', 'outis-light', 'outis-ft'],
		themeColor: '#fff1e0',
		bg: 'rgb(255, 241, 224)',
		text: 'rgb(51, 48, 46)',
		white: 'rgb(255, 241, 224)',
		onAccent: 'rgb(255, 241, 224)',
		accent: 'rgb(0, 91, 127)',
		filled: 'rgb(0, 77, 107)',
		success: 'rgb(47, 122, 89)',
		codeBg: 'rgb(245, 235, 221)',
		selection: 'rgba(0, 91, 127, 0.18)'
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

test('TH-1 a fresh browser boots in Outis-Dark', async ({ page }) => {
	await page.goto('/');
	const html = page.locator('html');
	await expect(html).toHaveClass(/\bdark\b/);
	await expect(html).toHaveClass(/\boutis-dark\b/);
	expect(await page.evaluate(() => localStorage.theme)).toBe('outis-dark');
	expect(await page.locator('meta[name="theme-color"]').first().getAttribute('content')).toBe(T['outis-dark'].themeColor);
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
	await expect(select.locator('option[value="outis-dark-spark"]')).toHaveCount(1);
	await expect(select.locator('option[value="outis-light-ft"]')).toHaveCount(1);
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
	expect(await rootVar(page, '--color-gray-900')).toBe('#2e2b26');
});

// --- Style is stock: the Outis themes differ from Dark only in colour (user's call, 2026-11-14) ---

// Everything that is "style, not colour", read from one chat page: faces, sizes, corners, strokes.
async function styleSnapshot(page: Page, api: any, theme: string) {
	await richChat(page, api, theme);
	await page.locator('#sidebar-chat-item').first().waitFor({ state: 'attached' }).catch(() => {});
	return page.evaluate(() => {
		const pick = (sel: string, prop: string) => {
			const e = document.querySelector(sel);
			return e ? getComputedStyle(e).getPropertyValue(prop).trim() : 'missing';
		};
		const probe = (cls: string, prop: string) => {
			const el = document.createElement('div');
			el.className = cls;
			el.textContent = 'probe';
			document.body.appendChild(el);
			const v = getComputedStyle(el).getPropertyValue(prop).trim();
			el.remove();
			return v;
		};
		const svg = document.querySelector('button svg');
		return {
			bodyFont: pick('body', 'font-family'),
			sansFont: probe('font-sans', 'font-family'),
			monoFont: probe('font-mono', 'font-family'),
			replySize: pick('.markdown-prose p', 'font-size'),
			h1: pick('.markdown-prose h1', 'font-size'),
			h2: pick('.markdown-prose h2', 'font-size'),
			h3: pick('.markdown-prose h3', 'font-size'),
			composer: pick('.input-prose', 'font-size'),
			editor: pick('div[class*="language-"] .cm-editor', 'font-size'),
			sidebarRow: pick('#sidebar-chat-item', 'font-size'),
			textSm: probe('text-sm', 'font-size'),
			textXs: probe('text-xs', 'font-size'),
			roundedLg: probe('rounded-lg', 'border-top-left-radius'),
			roundedXl: probe('rounded-xl', 'border-top-left-radius'),
			rounded2xl: probe('rounded-2xl', 'border-top-left-radius'),
			roundedFull: probe('rounded-full', 'border-top-left-radius'),
			codeBlock: pick('div:has(> div[class*="language-"])', 'border-top-left-radius'),
			strokeCap: svg ? getComputedStyle(svg).strokeLinecap : 'missing',
			strokeJoin: svg ? getComputedStyle(svg).strokeLinejoin : 'missing'
		};
	});
}

test('TH-32 switching from Outis Spark to Outis FT leaves no Spark class or dark grays', async ({ page }) => {
	await useTheme(page, 'dark');
	await page.goto('/?settings=general');
	for (const t of ['outis-dark-spark', 'outis-light-ft']) await chooseTheme(page, t);
	await expect(page.locator('html')).not.toHaveClass(/\b(outis-spark|outis-dark|dark)\b/);
	expect(await rootVar(page, '--color-gray-900')).toBe('#33302e');
	await chooseTheme(page, 'outis-dark');
	await expect(page.locator('html')).not.toHaveClass(/\b(outis-ft|outis-light)\b/);
	expect(await rootVar(page, '--color-blue-500')).toBe('#84b9e6');
});

test('TH-33 code blocks take the palette: accent caret and the variant syntax colours', async ({ page, api }) => {
	const want = {
		'outis-dark': { caret: 'rgb(132, 185, 230)', str: 'rgb(165, 214, 255)' },
		'outis-dark-spark': { caret: 'rgb(118, 185, 0)', str: 'rgb(184, 217, 138)' },
		'outis-light-ft': { caret: 'rgb(0, 91, 127)', str: 'rgb(39, 107, 77)' }
	};
	for (const [theme, w] of Object.entries(want)) {
		await richChat(page, api, theme);
		// CodeMirror hides the native caret and draws its own .cm-cursor once the editor has focus.
		await page.locator('div[class*="language-"] .cm-content').click();
		await expect
			.poll(() => css(page, 'div[class*="language-"] .cm-cursor', 'border-left-color'), { message: theme })
			.toBe(w.caret);
		const str = page.locator('div[class*="language-"] .cm-content span', { hasText: '"hi"' }).last();
		expect(await str.evaluate((e) => getComputedStyle(e).color), theme).toBe(w.str);
	}
});

test('TH-34 inline code is a code chip: code surface, hairline, code colour, 4px corners, 0.95em', async ({ page, api }) => {
	const want = {
		'outis-dark': { color: 'rgb(121, 192, 255)', bg: 'rgb(33, 29, 26)' },
		'outis-dark-spark': { color: 'rgb(194, 236, 92)', bg: 'rgb(26, 42, 13)' },
		'outis-light-ft': { color: 'rgb(0, 91, 127)', bg: 'rgb(245, 235, 221)' }
	};
	for (const [theme, w] of Object.entries(want)) {
		await richChat(page, api, theme);
		const code = page.locator('.markdown-prose p code').first();
		const s = await code.evaluate((e) => {
			const c = getComputedStyle(e), p = getComputedStyle(e.parentElement!);
			return { color: c.color, bg: c.backgroundColor, radius: c.borderTopLeftRadius, border: c.borderTopWidth, ratio: parseFloat(c.fontSize) / parseFloat(p.fontSize) };
		});
		expect(s.color, theme).toBe(w.color);
		expect(s.bg, theme).toBe(w.bg);
		expect(s.radius, theme).toBe('4px');
		expect(s.border, theme).toBe('1px');
		expect(Math.abs(s.ratio - 0.95), theme).toBeLessThan(0.01);
	}
});

test('TH-30 Outis-Dark and Outis-Light use the stock font, sizes, corners and icon strokes', async ({ page, api }) => {
	const stock = await styleSnapshot(page, api, 'dark');
	// Sanity: the stock theme really is rounded and not monospace, so equality below means something.
	expect(stock.roundedXl).not.toBe('0px');
	expect(stock.bodyFont).not.toMatch(/IBM Plex Mono/);
	for (const theme of THEMES) expect(await styleSnapshot(page, api, theme), theme).toEqual(stock);
});

test('TH-31 the font picker is gone; an old saved face is ignored', async ({ page }) => {
	await page.addInitScript(() => localStorage.setItem('outisFont', 'jetbrains-mono'));
	await useTheme(page, 'outis-dark');
	await page.goto('/?settings=general');
	await expect(page.getByRole('combobox', { name: 'Font' })).toHaveCount(0);
	expect(await page.locator('html').getAttribute('data-outis-font')).toBeNull();
	expect(await css(page, 'body', 'font-family')).not.toMatch(/JetBrains Mono|IBM Plex Mono/);
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
	const row = page.locator(`#sidebar-chat-item:has(a[href="/c/${chat.id}"])`).locator('xpath=..');
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
	// The app focuses the composer once it has loaded; tabbing before that loses focus to it
	// mid-check. Start from the composer so the Tabs below land on real buttons and stay there.
	await expect.poll(() => page.evaluate(() => document.activeElement?.id)).toBe('chat-input');

	// Keyboard focus on a button shows the accent ring.
	let outline = '';
	// Up to 80 Tabs: every chat the earlier specs create adds a sidebar link before the first button.
	for (let i = 0; i < 80 && !outline; i++) {
		await page.keyboard.press('Tab');
		outline = await page.evaluate(() => {
			const a = document.activeElement as HTMLElement | null;
			return a && a.tagName === 'BUTTON' ? getComputedStyle(a).outlineColor : '';
		});
	}
	// Poll: a button with a `transition` class (v0.13.3's Open Sidebar) fades its ring in.
	await expect
		.poll(
			() => page.evaluate(() => getComputedStyle(document.activeElement as HTMLElement).outlineColor),
			{ message: await page.evaluate(() => { const a = document.activeElement as HTMLElement; return `fv=${a.matches(':focus-visible')} ${a.outerHTML.slice(0, 200)}`; }) }
		)
		.toBe(T['outis-dark'].accent);

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
	expect(await probe(page, 'bg-blue-500 text-white', 'color')).toBe(T['outis-dark'].onAccent);
});

test('TH-20 dark:text-white renders as the palette off-white (Outis-Dark)', async ({ page }) => {
	await useTheme(page, 'outis-dark');
	await page.goto('/');
	expect(await probe(page, 'dark:text-white', 'color')).toBe(T['outis-dark'].white);
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

test('TH-25 emerald text classes resolve to the success green, not the accent', async ({ page }) => {
	await useTheme(page, 'outis-dark');
	await page.goto('/');
	for (const cls of ['text-emerald-500', 'text-emerald-600', 'text-emerald-700']) {
		expect(await probe(page, cls, 'color'), cls).toBe(T['outis-dark'].success);
	}
});

test('TH-26 light theme: the favicon is darkened and the splash is the page colour', async ({ page }) => {
	await useTheme(page, 'outis-light');
	await page.goto('/');
	expect(await css(page, 'img[src$="favicon.png"]', 'filter')).toBe('brightness(0.431)');
	expect(await probe(page, '', 'background-color', 'splash-screen')).toBe(T['outis-light'].bg);
});

test('TH-27 a formula is one colour, set apart from the prose, in both themes', async ({ page, api }) => {
	const chat = await api.chat({ title: 'TH-27', assistant: 'Inline $x = 1$ here.\n\n$$y \\le \\sum_i (x_i + 2.5) + \\log z$$\n\nEnd.' });
	const want = {
		'outis-dark': { math: 'rgb(240, 198, 116)', card: 'rgb(33, 29, 26)' },
		'outis-light': { math: 'rgb(122, 79, 0)', card: 'rgb(243, 240, 234)' }
	};
	const D = '.katex-display';
	for (const theme of ['outis-dark', 'outis-light'] as const) {
		await useTheme(page, theme);
		await page.goto(`/c/${chat.id}`);
		await expect(page.locator(D)).toHaveCount(1);
		// Variable, relation, digit, bracket, operator name, big operator: all the same colour.
		for (const sel of ['.mathnormal', '.mrel', '.mbin', '.mopen', '.op-symbol', '.mop:not(.op-symbol):not(.op-limits)']) {
			expect(await css(page, `${D} ${sel}`, 'color'), sel).toBe(want[theme].math);
		}
		const digit = await page.locator(`${D} .mord`).evaluateAll((els) =>
			els.filter((e) => !e.children.length && /^\d/.test(e.textContent || '')).map((e) => getComputedStyle(e).color)
		);
		expect(digit.length).toBeGreaterThan(0);
		expect(new Set(digit)).toEqual(new Set([want[theme].math]));
		expect(await css(page, D, 'background-color')).toBe(want[theme].card);
		expect(await css(page, '.markdown-prose p', 'color')).not.toBe(want[theme].math);
	}
});

test('TH-28 Texting Bubbles reads as a study thread in both Outis themes', async ({ page, api }) => {
	const ctx = (api as any).ctx;
	const src = readFileSync(join(__dirname, '../fixtures/texting_bubbles.py'), 'utf8');
	await ctx.delete('/api/v1/functions/id/texting_bubbles/delete').catch(() => null);
	const made = await ctx.post('/api/v1/functions/create', {
		data: { id: 'texting_bubbles', name: 'Texting Bubbles', content: src, meta: { description: 'TH-28' } }
	});
	expect(made.ok()).toBe(true);
	expect((await ctx.post('/api/v1/functions/id/texting_bubbles/toggle')).ok()).toBe(true);
	try {
		const md = '## Heading\n\nFirst paragraph.\n\n$$a = \\frac{b}{c}$$\n\n```python\nprint(1)\n```\n\nLast paragraph.';
		const chat = await api.chat({ title: 'TH-28', assistant: md });
		const P = '#response-content-container > div > .markdown-prose';
		const want = {
			'outis-dark': { rail: 'rgb(54, 50, 46)', heading: 'rgb(132, 185, 230)', formula: 'rgb(240, 198, 116)' },
			'outis-light': { rail: 'rgb(230, 226, 222)', heading: 'rgb(34, 102, 164)', formula: 'rgb(122, 79, 0)' }
		};
		for (const theme of ['outis-dark', 'outis-light'] as const) {
			await useTheme(page, theme);
			await page.goto(`/c/${chat.id}`);
			await expect(page.locator('[data-tb="on"]')).toHaveCount(1, { timeout: 20_000 });
			// No box per paragraph: transparent, square, hanging off the rail.
			expect(await css(page, `${P} > p`, 'background-color')).toBe('rgba(0, 0, 0, 0)');
			expect(await css(page, `${P} > p`, 'border-top-left-radius')).toBe('0px');
			expect(await css(page, `${P} > p`, 'border-left-width')).toBe('2px');
			expect(await css(page, `${P} > p`, 'border-left-color')).toBe(want[theme].rail);
			// Nodes by kind: accent for a heading, amber for a formula.
			expect(await css(page, `${P} > h2`, 'background-color', '::before')).toBe(want[theme].heading);
			expect(await css(page, `${P} > [data-tb-math]`, 'background-color', '::before')).toBe(want[theme].formula);
			expect(await css(page, `${P} > [data-tb-math]`, 'overflow-x')).toBe('visible');
			// Display maths spans the reply, so the formula sits centred.
			const [mathW, proseW] = await page.evaluate((p) => [
				document.querySelector(`${p} > [data-tb-math]`)!.getBoundingClientRect().width,
				document.querySelector(p)!.getBoundingClientRect().width
			], P);
			expect(mathW).toBeGreaterThan(proseW * 0.98);
		}
	} finally {
		await ctx.delete('/api/v1/functions/id/texting_bubbles/delete').catch(() => null);
	}
});

test('TH-29 reading ladder and measure: body text in its contrast band, text as wide as code', async ({ page, api }) => {
	const want = {
		'outis-dark': { body: 'rgb(215, 210, 203)', heading: 'rgb(231, 226, 220)', band: [11, 14] },
		'outis-light': { body: 'rgb(51, 48, 43)', heading: 'rgb(29, 26, 22)', band: [12, 17] },
		'outis-dark-spark': { body: 'rgb(205, 216, 186)', heading: 'rgb(227, 237, 208)', band: [10, 13] },
		'outis-light-ft': { body: 'rgb(51, 48, 46)', heading: 'rgb(51, 48, 46)', band: [11, 13] }
	};
	for (const theme of THEMES) {
		await richChat(page, api, theme);
		const P = '.markdown-prose p';
		const body = await css(page, P, 'color');
		expect(body).toBe(want[theme].body);
		expect(await css(page, '.markdown-prose h1', 'color')).toBe(want[theme].heading);
		const c = contrast(body, T[theme].bg);
		expect(c).toBeGreaterThan(want[theme].band[0]);
		expect(c).toBeLessThan(want[theme].band[1]);
		// The accent no longer outshines the text being read.
		if (theme === 'outis-dark') expect(contrast(T[theme].accent, T[theme].bg)).toBeLessThan(c);
		// No reading measure (user's choice 2026-10-05): a paragraph of the reply that holds the code block spans
		// that reply's full width. (The first .markdown-prose p on the page can sit in a narrower element.)
		const [maxW, textW, proseW] = await page.evaluate(() => {
			const prose = document.querySelector('div[class*="language-"]')!.closest('.markdown-prose')!;
			const el = prose.querySelector('p')!;
			const cs = getComputedStyle(prose);
			const inner = prose.getBoundingClientRect().width - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
			return [getComputedStyle(el).maxWidth, el.getBoundingClientRect().width, inner];
		});
		expect(['none', '100%']).toContain(maxW); // no ch cap (the reading rail sets 100%, which is the full column)
		expect(Math.abs(textW - proseW)).toBeLessThan(2);
	}
});
