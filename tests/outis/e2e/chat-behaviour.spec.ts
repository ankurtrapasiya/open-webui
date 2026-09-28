import type { Page } from '@playwright/test';
import { test, expect } from '../support/fixtures';
import { python } from '../support/container';

// --- Tool-result images -------------------------------------------------------------------

const PNG =
	'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

// One page reading "Outis report".
const PDF =
	'JVBERi0xLjQKMSAwIG9iago8PCAvVHlwZSAvQ2F0YWxvZyAvUGFnZXMgMiAwIFIgPj4KZW5kb2JqCjIgMCBvYmoKPDwgL1R5cGUgL1BhZ2VzIC9LaWRzIFszIDAgUl0gL0NvdW50IDEgPj4KZW5kb2JqCjMgMCBvYmoKPDwgL1R5cGUgL1BhZ2UgL1BhcmVudCAyIDAgUiAvTWVkaWFCb3ggWzAgMCAyMDAgMTAwXSAvQ29udGVudHMgNCAwIFIgL1Jlc291cmNlcyA8PCAvRm9udCA8PCAvRjEgNSAwIFIgPj4gPj4gPj4KZW5kb2JqCjQgMCBvYmoKPDwgL0xlbmd0aCA0MiA+PgpzdHJlYW0KQlQgL0YxIDEyIFRmIDIwIDUwIFRkIChPdXRpcyByZXBvcnQpIFRqIEVUCmVuZHN0cmVhbQplbmRvYmoKNSAwIG9iago8PCAvVHlwZSAvRm9udCAvU3VidHlwZSAvVHlwZTEgL0Jhc2VGb250IC9IZWx2ZXRpY2EgPj4KZW5kb2JqCnhyZWYKMCA2CjAwMDAwMDAwMDAgNjU1MzUgZiAKMDAwMDAwMDAwOSAwMDAwMCBuIAowMDAwMDAwMDU4IDAwMDAwIG4gCjAwMDAwMDAxMTUgMDAwMDAgbiAKMDAwMDAwMDI0MSAwMDAwMCBuIAowMDAwMDAwMzMzIDAwMDAwIG4gCnRyYWlsZXIKPDwgL1NpemUgNiAvUm9vdCAxIDAgUiA+PgpzdGFydHhyZWYKNDAzCiUlRU9GCg==';

const TOOL = `"""
title: Regression figures
"""


class Tools:
    def read_report(self, path: str = "") -> str:
        """
        Read a PDF report from disk.
        :param path: Path of the report file.
        """
        return "data:application/pdf;base64,${PDF}"

    def read_figure(self, path: str = "") -> str:
        """
        Read a figure image from disk.
        :param path: Path of the figure file.
        """
        return "data:image/png;base64,${PNG}"

    def read_photo(self, path: str = "") -> str:
        """
        Read a photo from disk.
        :param path: Path of the photo file.
        """
        return "data:image/jpeg;base64,${PNG}"
`;

test.beforeAll(async ({ api }) => {
	await api.tool('regression_figures', TOOL);
});

// Runs one tool call through a saved chat and returns the tool output item and the stored chat.
async function toolTurn(api: any, call: string, params: Record<string, unknown> = {}) {
	const { chatId, messageId } = await api.startChat({
		model: 'fake-model',
		content: `CALL ${call}`,
		tool_ids: ['regression_figures'],
		params
	});
	const { chat, message } = await api.waitForReply(chatId, messageId);
	const out = (message.output ?? []).find((o: any) => o.type === 'function_call_output');
	return { chatId, messageId, chat, message, out };
}

const fileId = (url: string) => url.match(/\/api\/v1\/files\/([^/]+)\/content/)![1];

test('CB-1 a tool image is stored once as a file and linked, not kept inline in the chat', async ({ api }) => {
	const { chat, out } = await toolTurn(api, 'read_figure {"path": "plots/figure1.png"}');
	expect(out, 'tool output').toBeTruthy();
	expect(out.files?.[0]?.url).toMatch(/^\/api\/v1\/files\/[^/]+\/content$/);
	expect(JSON.stringify(chat)).not.toContain('data:image');
});

test('CB-2 the stored image is named after the file the tool read', async ({ api }) => {
	const { out } = await toolTurn(api, 'read_figure {"path": "plots/figure1.png"}');
	expect((await api.file(fileId(out.files[0].url))).meta.name).toBe('figure1.png');
});

test('CB-3 name fallbacks: no path gives the tool name; the extension follows the image type', async ({ api }) => {
	const noPath = await toolTurn(api, 'read_figure {}');
	expect((await api.file(fileId(noPath.out.files[0].url))).meta.name).toBe('read_figure.png');

	const jpeg = await toolTurn(api, 'read_photo {"path": "shots/cam.png"}');
	expect((await api.file(fileId(jpeg.out.files[0].url))).meta.name).toBe('cam.jpg');
});

test('CB-4 the reader sees the image in the chat', async ({ page, api }) => {
	const { chatId, out } = await toolTurn(api, 'read_figure {"path": "plots/figure1.png"}');
	await page.goto(`/c/${chatId}`);
	await expect(page.locator(`img[src="${out.files[0].url}"]`).first()).toBeVisible();
});

test('CB-5 [KNOWN BUG] with tool approval, the approved call shows and names the image too', async ({ api }) => {
	// Not automated yet: after an approval over the API the call stays `queued` with no output;
	// finishing it appears to need the browser. The bug itself (image hidden and named
	// generated-image.png on the approval path) is still recorded in SPEC-chat-behaviour.md.
	test.fixme(true, 'approval resume cannot be driven from the API yet');
	test.fail(true, 'drain_approved_tool_calls still hides the image and names it generated-image.png');
	// Approval only applies when the admin turns tool permissions on.
	const setPermissions = async (on: boolean) => {
		const config = await (await api.raw('GET', '/api/v1/chats/config')).json();
		const res = await api.raw('POST', '/api/v1/chats/config', { ...config, ENABLE_TOOL_PERMISSIONS: on });
		expect(res.ok(), await res.text()).toBe(true);
	};
	await setPermissions(true);
	try {
		await approvedTurn(api);
	} finally {
		await setPermissions(false);
	}
});

// --- Tool-result PDFs and download links -----------------------------------------------------

test('CB-16 a tool PDF is stored once as a file named after the path, and the model gets a summary', async ({ api }) => {
	const { chat, out } = await toolTurn(api, 'read_report {"path": "out/report.pdf"}');
	expect(out.files?.[0]?.url).toMatch(/^\/api\/v1\/files\/[^/]+\/content$/);
	expect(out.files[0].content_type).toBe('application/pdf');
	expect((await api.file(fileId(out.files[0].url))).meta.name).toBe('report.pdf');
	expect(JSON.stringify(chat)).not.toContain('data:application/pdf');
	expect(JSON.stringify(out.output)).toContain('PDF stored and shown to the user');
});

test('CB-17 the reader opens the PDF inline in the chat', async ({ page, api }) => {
	const { chatId } = await toolTurn(api, 'read_report {"path": "out/report.pdf"}');
	await page.goto(`/c/${chatId}`);
	await page.locator('.tool-result-pdf-toggle', { hasText: 'report.pdf' }).first().click();
	await expect(page.locator('.tool-result-pdf').getByText('Outis report')).toBeVisible();
});

test('CB-18 a tool image and a tool PDF each show their full download URL', async ({ page, api }) => {
	for (const call of ['read_figure {"path": "plots/figure1.png"}', 'read_report {"path": "out/report.pdf"}']) {
		const { chatId, out } = await toolTurn(api, call);
		await page.goto(`/c/${chatId}`);
		const href = new URL(out.files[0].url, page.url()).href;
		const link = page.locator(`.tool-result-file-link a[href="${href}"]`).first();
		await expect(link).toHaveText(href);
		await expect(link).toHaveAttribute('download', /\.(png|pdf)$/);
	}
});

test('CB-19 images from several tool calls in one turn show without expanding the tool-call group', async ({ page, api }) => {
	// ml4t-env's figures arrive this way: one file() call per figure, all in the same turn.
	const { chatId, message } = await toolTurn(api, 'read_figure {"path": "plots/a.png"}\nCALL read_figure {"path": "plots/b.png"}');
	const stored = (message.output ?? []).filter((o: any) => o.type === 'function_call_output' && o.files?.length);
	expect(stored, 'both calls stored an image').toHaveLength(2);
	await page.goto(`/c/${chatId}`);
	const images = page.locator('img[src^="/api/v1/files/"]');
	await expect(images).toHaveCount(2);
	for (const img of await images.all()) await expect(img).toBeVisible();
});

async function approvedTurn(api: any) {
	const { chatId, messageId } = await api.startChat({
		model: 'fake-model',
		content: 'CALL read_figure {"path": "plots/approved.png"}',
		tool_ids: ['regression_figures'],
		params: { tool_approval_mode: 'ask' }
	});
	const paused = await api.waitForReply(chatId, messageId, (m: any) =>
		(m?.output ?? []).some((o: any) => o.type === 'function_call' && ['pending', 'queued', 'requires_approval'].includes(o.status))
	);
	const call = paused.message.output.find((o: any) => o.type === 'function_call');
	await api.resolveToolCall(chatId, messageId, call.call_id ?? call.id);
	const { message } = await api.waitForReply(chatId, messageId, (m: any) =>
		(m?.output ?? []).some((o: any) => o.type === 'function_call_output')
	);
	const out = message.output.find((o: any) => o.type === 'function_call_output');
	expect(out.files?.[0]?.url).toMatch(/^\/api\/v1\/files\//);
	expect((await api.file(fileId(out.files[0].url))).meta.name).toBe('approved.png');
}

// --- Documents sent once ------------------------------------------------------------------

const sourceContext = (sources: unknown) =>
	python<string>(
		`import json; from open_webui.utils.middleware import get_source_context as g; ` +
			`print(json.dumps(g(json.loads(${JSON.stringify(JSON.stringify(sources))}))))`
	);

const src = (id: string, docs: string[]) => ({
	source: { id, name: `${id}.md` },
	document: docs,
	metadata: docs.map(() => ({ source: id }))
});

const count = (haystack: string, needle: string) => haystack.split(needle).length - 1;

test('CB-6 the same document arriving twice is sent once', async () => {
	const out = sourceContext([src('f1', ['BODY-X']), src('f1', ['BODY-X'])]);
	expect(count(out, '>BODY-X</source>')).toBe(1);
	expect(out).toContain('<source id="1"');
});

test('CB-7 two different chunks of one document are both sent', async () => {
	const out = sourceContext([src('f1', ['CHUNK-A', 'CHUNK-B'])]);
	expect(count(out, '>CHUNK-A</source>')).toBe(1);
	expect(count(out, '>CHUNK-B</source>')).toBe(1);
});

test('CB-8 the same text from two different documents is sent for each, numbered 1 and 2', async () => {
	const out = sourceContext([src('f1', ['SAME']), src('f2', ['SAME'])]);
	expect(count(out, '>SAME</source>')).toBe(2);
	expect(out).toContain('<source id="1"');
	expect(out).toContain('<source id="2"');
});

// --- Skills persist across messages ---------------------------------------------------------

async function newChatWithSkill(page: Page, api: any) {
	await api.skill('regression-skill', 'Regression Skill', 'Always answer briefly.');
	await page.goto('/?model=fake-model');
	await page.locator('button[aria-label="Integrations"]').click();
	await page.getByRole('button', { name: /^Skills/ }).click();
	await page.getByRole('button', { name: /Regression Skill/ }).click();
	await page.keyboard.press('Escape');
	await expect(page.locator('button[aria-label="Available Skills"]')).toHaveText('1');
}

async function send(page: Page, text: string) {
	const req = page.waitForRequest((r) => r.url().endsWith('/api/chat/completions') && r.method() === 'POST');
	await page.locator('#chat-input').click();
	await page.keyboard.type(text);
	await page.keyboard.press('Enter');
	return (await req).postDataJSON();
}

test('CB-9 a selected skill is sent with every message, not just the first', async ({ page, api }) => {
	await newChatWithSkill(page, api);
	expect((await send(page, 'first message')).skill_ids).toContain('regression-skill');
	await expect(page.getByText('Fake reply.').first()).toBeVisible();
	await expect(page.locator('button[aria-label="Available Skills"]')).toHaveText('1');
	expect((await send(page, 'second message')).skill_ids).toContain('regression-skill');
	await expect(page.locator('button[aria-label="Available Skills"]')).toHaveText('1');
});

test('CB-10 a new chat starts with no skills selected', async ({ page, api }) => {
	await newChatWithSkill(page, api);
	await send(page, 'hello');
	await expect(page).toHaveURL(/\/c\//);
	await page.locator('a#sidebar-new-chat-button:visible, a[aria-label="New Chat"]:visible').first().click();
	await expect(page).not.toHaveURL(/\/c\//);
	await expect(page.locator('button[aria-label="Available Skills"]')).toHaveCount(0);
});

// --- Composer suggestions -------------------------------------------------------------------

async function composerWithSuggestions(page: Page, api: any) {
	await api.updateUiSettings({ showFormattingToolbar: true, insertSuggestionPrompt: true });
	await api.setSuggestions(
		Array.from({ length: 8 }, (_, i) => ({
			title: [`Suggestion ${i + 1}`, 'regression'] as [string, string],
			content: `Plain suggestion number ${i + 1}`
		}))
	);
	await page.goto('/?model=fake-model');
	await expect(page.getByText('Suggestion 8')).toBeVisible();
}

test.afterAll(async ({ api }) => {
	await api.updateUiSettings({ showFormattingToolbar: false, insertSuggestionPrompt: false });
});

test('CB-11 all eight suggestions show without scrolling the list', async ({ page, api }) => {
	await composerWithSuggestions(page, api);
	const list = page.locator('[role="list"]:has(button[role="listitem"])');
	for (let i = 1; i <= 8; i++) await expect(page.getByText(`Suggestion ${i}`, { exact: true })).toBeVisible();
	// Poll: the chips slide up 6px as they fade in, which briefly adds to scrollHeight.
	await expect.poll(() => list.evaluate((e) => e.scrollHeight <= e.clientHeight)).toBe(true);
});

test('CB-12 focusing the empty composer does not pop up the formatting menu', async ({ page, api }) => {
	await composerWithSuggestions(page, api);
	await page.locator('#chat-input').click();
	await expect(page.locator('#floating-menu')).toHaveCount(0);
});

test('CB-13 clicking a suggestion puts the cursor at the end instead of selecting the prompt', async ({ page, api }) => {
	await composerWithSuggestions(page, api);
	await page.getByText('Suggestion 3', { exact: true }).click();
	await expect(page.locator('#chat-input')).toContainText('Plain suggestion number 3');
	const sel = await page.evaluate(() => {
		const s = getSelection()!;
		return { collapsed: s.isCollapsed, atEnd: s.focusOffset === (s.focusNode?.textContent?.length ?? -1) };
	});
	expect(sel).toEqual({ collapsed: true, atEnd: true });
	await expect(page.locator('#bubble-menu')).toBeHidden();
});

test('CB-14 selecting typed text still shows the formatting menu', async ({ page, api }) => {
	await composerWithSuggestions(page, api);
	await page.locator('#chat-input').click();
	await page.keyboard.type('Some words to format');
	await page.keyboard.press('Control+a');
	await expect(page.locator('#bubble-menu')).toBeVisible();
});

test('CB-15 a long suggestion pool shows 20 at random and typing searches all of it', async ({ page, api }) => {
	await api.updateUiSettings({ showFormattingToolbar: true, insertSuggestionPrompt: true });
	const n = (i: number) => String(i).padStart(2, '0');
	await api.setSuggestions(
		Array.from({ length: 30 }, (_, i) => ({
			title: [`Pool item ${n(i + 1)}`, 'regression'] as [string, string],
			content: `Pool prompt ${n(i + 1)}`
		}))
	);
	await page.goto('/?model=fake-model');
	const chips = page.locator('button[role="listitem"]');
	await expect(chips).toHaveCount(20);
	const first = await chips.allTextContents();
	let reshuffled = false;
	for (let tries = 0; tries < 5 && !reshuffled; tries++) {
		await page.reload();
		await expect(chips).toHaveCount(20);
		reshuffled = (await chips.allTextContents()).join() !== first.join();
	}
	expect(reshuffled).toBe(true);
	const hidden = Array.from({ length: 30 }, (_, i) => `Pool item ${n(i + 1)}`).find(
		(t) => !first.some((c) => c.includes(t))
	)!;
	await page.locator('#chat-input').click();
	await page.keyboard.type(hidden.replace('item', 'prompt'));
	await expect(page.getByText(hidden, { exact: true })).toBeVisible();
});

// --- Wrap long lines in code blocks ---------------------------------------------------------

async function wideCodeChat(page: Page, api: any) {
	const line = 'x = "' + 'a'.repeat(400) + '"';
	const chat = await api.chat({ title: 'Wrap', assistant: 'Code:\n\n```python\n' + line + '\n```\n' });
	await page.goto(`/c/${chat.id}`);
	const scroller = page.locator('div[class*="language-"] .cm-scroller');
	await expect(scroller).toHaveCount(1);
	return scroller;
}

const overflows = (el: any) => el.evaluate((e: HTMLElement) => e.scrollWidth > e.clientWidth);

test('CB-20 a long line in a code block scrolls sideways by default', async ({ page, api }) => {
	const scroller = await wideCodeChat(page, api);
	expect(await overflows(scroller)).toBe(true);
	await expect(page.locator('.wrap-code-button')).toHaveText('Wrap');
});

test('CB-21 Wrap fits the long line to the block', async ({ page, api }) => {
	const scroller = await wideCodeChat(page, api);
	const button = page.locator('.wrap-code-button');
	await button.click();
	await expect(button).toHaveText('No wrap');
	await expect(button).toHaveAttribute('aria-pressed', 'true');
	await expect(page.locator('div[class*="language-"] .cm-content')).toHaveClass(/cm-lineWrapping/);
	expect(await overflows(scroller)).toBe(false);
});

test('CB-22 the wrap choice is remembered and can be turned off', async ({ page, api }) => {
	let scroller = await wideCodeChat(page, api);
	await page.locator('.wrap-code-button').click();
	await page.reload();
	scroller = page.locator('div[class*="language-"] .cm-scroller');
	await expect(page.locator('.wrap-code-button')).toHaveText('No wrap');
	expect(await overflows(scroller)).toBe(false);
	await page.locator('.wrap-code-button').click();
	await expect(page.locator('.wrap-code-button')).toHaveText('Wrap');
	expect(await overflows(scroller)).toBe(true);
	expect(await page.evaluate(() => localStorage.getItem('outis-wrap-code'))).toBe('false');
});

// --- BibTeX files load as text ---------------------------------------------------------------

test('CB-23 a .bib file is read as text even when Docling is the extraction engine', () => {
	const out = python<{ text: string }>(`
import json, tempfile
from open_webui.retrieval.loaders.main import Loader
f = tempfile.NamedTemporaryFile('w', suffix='.bib', delete=False)
f.write('@article{k, title={Outis bib}}\\n'); f.close()
docs = Loader(engine='docling', DOCLING_SERVER_URL='http://127.0.0.1:9').load('references.bib', 'application/octet-stream', f.name)
print(json.dumps({'text': docs[0].page_content}))
`);
	expect(out.text).toContain('Outis bib');
});
