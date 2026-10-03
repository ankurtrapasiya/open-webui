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

test('NR-13 a $$ block renders in display mode, so an equation number (\\tag) works', async ({ page, api }) => {
	const { editor } = await openNote(page, api, 'Before\n\n$$p(n) ::= n^2 + n + 41. \\tag{1.1}$$\n\nAfter', 'NR-13');
	const block = editor.locator('[data-type="block-math"]');
	await expect(block.locator('.katex-display')).toHaveCount(1);
	await expect(block.locator('.katex-error')).toHaveCount(0);
	await expect(block).toContainText('(1.1)');
});

test('NR-14 a ```mermaid block draws its diagram under the code, and saving keeps the source', async ({ page, api }) => {
	const src = 'graph TD\n  R[NR14 root] --> A[Alpha]\n  R --> B[Beta]';
	const { note, editor } = await openNote(page, api, `Before\n\n\`\`\`mermaid\n${src}\n\`\`\`\n\nEnd`, 'NR-14');
	await expect(editor.locator('.mermaid-diagram svg')).toBeVisible();
	await expect(editor.locator('.mermaid-diagram svg')).toContainText('NR14 root');
	await expect(editor.locator('pre code.language-mermaid')).toContainText('R[NR14 root]');

	// Editing the code redraws the diagram.
	await editor.locator('pre code.language-mermaid').getByText('Beta').click();
	await page.keyboard.press('End');
	await page.keyboard.press('Enter');
	await page.keyboard.type('  R --> G[Gamma]');
	await expect(editor.locator('.mermaid-diagram svg')).toContainText('Gamma');

	await page.keyboard.press('Control+s');
	await expect.poll(async () => (await api.getNote(note.id)).data.content.md).toContain('Gamma');
	expect((await api.getNote(note.id)).data.content.md).toMatch(/```mermaid\s*\ngraph TD/);
});

// The server draws plantuml / dot / mermaid-mindmap with the installed `kroki_diagram_renderer`
// filter. The suite has no Kroki, so a stub filter stands in: it draws "<lang>: <source>" as text.
const KROKI_STUB = `
import html, re
from pydantic import BaseModel

class Filter:
    class Valves(BaseModel):
        pass

    def __init__(self):
        self.valves = self.Valves()

    def outlet(self, body, __user__=None):
        m = body["messages"][-1]
        lang, src = re.search(r"\`\`\`(\\w+)\\n(.*?)\`\`\`", m["content"], re.S).groups()
        text = html.escape(lang + ": " + src.replace("\\n", " "))
        svg = f'<svg xmlns="http://www.w3.org/2000/svg"><text y="20">{text}</text></svg>'
        m["content"] = f'<div class="outis-diagram">{svg}</div>\\n\\n' + m["content"]
        return body
`;

test('NR-18 a mermaid mindmap and a plantuml block in a note are drawn by the Kroki filter', async ({ page, api }) => {
	const ctx = (api as any).ctx;
	await ctx.delete('/api/v1/functions/id/kroki_diagram_renderer/delete').catch(() => null);
	const made = await ctx.post('/api/v1/functions/create', {
		data: { id: 'kroki_diagram_renderer', name: 'Kroki stub', content: KROKI_STUB, meta: { description: 'NR-18' } }
	});
	expect(made.ok()).toBe(true);
	try {
		const md = 'Map\n\n```mermaid\nmindmap\n  root((NR18 root))\n    Alpha\n```\n\nUML\n\n```plantuml\n@startuml\nNR18a -> NR18b\n@enduml\n```';
		const { note, editor } = await openNote(page, api, md, 'NR-18');
		const drawings = editor.locator('.mermaid-diagram .outis-diagram svg');
		await expect(drawings).toHaveCount(2);
		await expect(drawings.nth(0)).toContainText('mermaid: mindmap');
		await expect(drawings.nth(0)).toContainText('NR18 root');
		await expect(drawings.nth(1)).toContainText('plantuml: @startuml');
		// No Mermaid drawing of the mindmap: Mermaid's own svg carries an aria-roledescription.
		await expect(editor.locator('.mermaid-diagram svg[aria-roledescription]')).toHaveCount(0);
		expect((await api.getNote(note.id)).data.content.md).toMatch(/```mermaid\s*\nmindmap/);
	} finally {
		await ctx.delete('/api/v1/functions/id/kroki_diagram_renderer/delete').catch(() => null);
	}
});

test('NR-15 an ordinary code block gets no diagram', async ({ page, api }) => {
	const { editor } = await openNote(page, api, '```python\nprint("NR15")\n```', 'NR-15');
	await expect(editor.locator('pre code')).toContainText('print("NR15")');
	await expect(editor.locator('.mermaid-diagram svg')).toHaveCount(0);
});

// A 1600x1200 PNG made in the browser and stored as an Open WebUI file; returns its URL.
async function bigImage(page: Page): Promise<string> {
	await page.goto('/');
	return page.evaluate(async () => {
		const c = document.createElement('canvas');
		c.width = 1600;
		c.height = 1200;
		const g = c.getContext('2d')!;
		g.fillStyle = '#2563eb';
		g.fillRect(0, 0, 1600, 1200);
		const blob: Blob = await new Promise((ok) => c.toBlob((b) => ok(b!), 'image/png'));
		const form = new FormData();
		form.append('file', new File([blob], 'big.png', { type: 'image/png' }));
		const r = await fetch('/api/v1/files/?process=false', {
			method: 'POST',
			headers: { Authorization: `Bearer ${localStorage.token}` },
			body: form
		});
		return `/api/v1/files/${(await r.json()).id}/content`;
	});
}

test('NR-16 a large image fills the note width instead of a 288px thumbnail', async ({ page, api }) => {
	const url = await bigImage(page);
	await page.context().addCookies([{ name: 'token', value: process.env.OUTIS_ADMIN_TOKEN!, url: page.url() }]);
	const { editor } = await openNote(page, api, `Map\n\n![NR16 map](${url})\n\nEnd`, 'NR-16');
	const img = editor.locator('img[alt="NR16 map"]');
	await expect.poll(() => img.evaluate((i: HTMLImageElement) => i.naturalWidth)).toBe(1600);
	const box = (await img.boundingBox())!;
	const width = (await editor.boundingBox())!.width;
	expect(box.width).toBeGreaterThan(width * 0.9);
	expect(box.height).toBeGreaterThan(400);
});

test('NR-17 clicking a note image opens it full-screen with zoom', async ({ page, api }) => {
	const url = await bigImage(page);
	await page.context().addCookies([{ name: 'token', value: process.env.OUTIS_ADMIN_TOKEN!, url: page.url() }]);
	const { editor } = await openNote(page, api, `![NR17 map](${url})`, 'NR-17');
	await editor.locator('img[alt="NR17 map"]').click();
	const full = page.locator('body > div img[alt="NR17 map"]').last();
	await expect(full).toBeVisible();
	const vp = page.viewportSize()!;
	expect((await full.boundingBox())!.height).toBeGreaterThan(vp.height * 0.6);
	await page.keyboard.press('Escape');
	await expect(page.locator('img[alt="NR17 map"]')).toHaveCount(1);
});
