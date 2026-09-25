import type { Page } from '@playwright/test';
import { test, expect } from '../support/fixtures';

async function openNote(page: Page, api: any, md: string, title: string) {
	const note = await api.note({ title, md });
	await page.goto(`/notes/${note.id}`);
	const editor = page.locator(`#note-${note.id}`);
	await expect(editor).toBeVisible();
	return { note, editor };
}

// --- The note editor's own markdown parser (editorMarked), checked through what it renders ---

test('NR-1 a $$ block becomes block math', async ({ page, api }) => {
	const { editor } = await openNote(page, api, 'Before\n\n$$\n\\frac1n\n$$\n\nAfter', 'NR-1');
	const block = editor.locator('[data-type="block-math"]');
	await expect(block).toHaveCount(1);
	await expect(block).toHaveAttribute('data-latex', '\\frac1n');
	await expect(block.locator('.katex')).not.toHaveCount(0);
});

test('NR-2 $x^2$ inside a sentence becomes inline math', async ({ page, api }) => {
	const { editor } = await openNote(page, api, 'a $x^2$ b', 'NR-2');
	const inline = editor.locator('[data-type="inline-math"]');
	await expect(inline).toHaveCount(1);
	await expect(inline).toHaveAttribute('data-latex', 'x^2');
});

test('NR-3 prices are not math', async ({ page, api }) => {
	const { editor } = await openNote(page, api, 'It costs $5 and $10 today', 'NR-3');
	await expect(editor).toContainText('$5 and $10');
	await expect(editor.locator('[data-type="inline-math"]')).toHaveCount(0);
});

test('NR-4 math containing < keeps it', async ({ page, api }) => {
	const { editor } = await openNote(page, api, 'where $a<b$ holds', 'NR-4');
	await expect(editor.locator('[data-type="inline-math"]')).toHaveAttribute('data-latex', 'a<b');
});

test('NR-5 a task list item renders unchecked', async ({ page, api }) => {
	const { editor } = await openNote(page, api, '- [ ] NR5 task', 'NR-5');
	await expect(editor.locator('[data-checked="false"]')).toHaveCount(1);
	await expect(editor.locator('input[type="checkbox"]')).not.toBeChecked();
});

test("NR-6 the chat's math support does not change how notes parse math", async ({ page, api }) => {
	// Rendering a chat registers the chat's KaTeX extension on the global markdown parser.
	const chat = await api.chat({ title: 'NR-6 chat', assistant: 'Chat math $y=mx$ here' });
	const note = await api.note({ title: 'NR-6 note', md: 'Note math $x^2$ here' });
	await page.goto(`/c/${chat.id}`);
	await expect(page.locator('.katex').first()).toBeVisible();

	// Client-side navigation keeps the same parser instance alive.
	await page.evaluate((id) => {
		const a = document.createElement('a');
		a.href = `/notes/${id}`;
		document.body.appendChild(a);
		a.click();
	}, note.id);
	await expect(page.locator(`#note-${note.id} [data-type="inline-math"]`)).toHaveAttribute('data-latex', 'x^2');
});

// --- Notes written by the chat, and round trips ---

test('NR-7 a note with math opens typeset, with no raw $ source showing', async ({ page, api }) => {
	const { editor } = await openNote(page, api, 'Bias $E(y)$ here\n\n$$\n\\frac1n\n$$', 'NR-7');
	expect(await editor.locator('.katex').count()).toBeGreaterThanOrEqual(2);
	await expect(editor).not.toContainText('$E(y)$');
});

test('NR-8 a note stored as {json: null, html: "", md} (how the chat writes it) opens with its text', async ({ page, api }) => {
	const { editor } = await openNote(page, api, 'NR8 body written by the chat', 'NR-8');
	await expect(editor).toContainText('NR8 body written by the chat');
});

test('NR-9 a note stored with only md, no json key, opens with its text', async ({ page, api }) => {
	const note = await api.rawNote({ title: 'NR-9', data: { content: { md: 'NR9 body with no json key' } } });
	await page.goto(`/notes/${note.id}`);
	await expect(page.locator(`#note-${note.id}`)).toContainText('NR9 body with no json key');
});

test('NR-10 editing and saving a note with math keeps the $ source in markdown', async ({ page, api }) => {
	const { note, editor } = await openNote(page, api, 'Area $x^2$ here\n\n$$\n\\frac1n\n$$\n\nEnd', 'NR-10');
	await editor.getByText('End').click();
	await page.keyboard.press('End');
	await page.keyboard.type(' edited');
	await page.keyboard.press('Control+s');
	await expect.poll(async () => (await api.getNote(note.id)).data.content.md).toContain('edited');
	const md = (await api.getNote(note.id)).data.content.md;
	expect(md).toContain('$x^2$');
	expect(md).toMatch(/\$\$\s*\\frac1n\s*\$\$/);
});

// --- Print to PDF ---

const noteMenu = (page: Page) => page.locator('span[aria-haspopup]:has(> div.p-1)');

async function choosePdf(page: Page) {
	await noteMenu(page).click();
	await page.getByText('Download', { exact: true }).click();
	await page.getByText('PDF document (.pdf)', { exact: true }).click();
}

test('NR-11 Download as PDF prints the live note in the light theme', async ({ page, api }) => {
	await openNote(page, api, 'Printed $x^2$ here', 'NR-11 printed note');
	await expect(page.locator('.katex').first()).toBeVisible();
	await page.evaluate(() => {
		const open = window.open.bind(window);
		window.open = (...args: any[]) => {
			const w = open(...args);
			if (w) w.print = () => ((window as any).__printed = w.document.documentElement.outerHTML);
			return w;
		};
	});
	await choosePdf(page);

	await expect.poll(() => page.evaluate(() => (window as any).__printed ?? null), { timeout: 20_000 }).not.toBeNull();
	const html: string = await page.evaluate(() => (window as any).__printed);
	expect(html).toMatch(/<html[^>]*class="[^"]*outis-light/);
	expect(html).toContain('NR-11 printed note</h1>');
	expect(html).toContain('katex');
	expect(html).toContain('@page');
});

test('NR-12 a blocked print window says so', async ({ page, api }) => {
	await openNote(page, api, 'Blocked print', 'NR-12');
	await page.evaluate(() => (window.open = () => null));
	await choosePdf(page);
	await expect(page.getByText('Could not open the print window. Check your popup blocker.')).toBeVisible();
});
