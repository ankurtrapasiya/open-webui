import type { Page } from '@playwright/test';
import { test, expect } from '../support/fixtures';
import { python } from '../support/container';

// --- Tool-result images -------------------------------------------------------------------

const PNG =
	'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

const TOOL = `"""
title: Regression figures
"""


class Tools:
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
	expect(await list.evaluate((e) => e.scrollHeight <= e.clientHeight)).toBe(true);
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

test('CB-15 a long suggestion pool shows 12 at random and typing searches all of it', async ({ page, api }) => {
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
	await expect(chips).toHaveCount(12);
	const first = await chips.allTextContents();
	let reshuffled = false;
	for (let tries = 0; tries < 5 && !reshuffled; tries++) {
		await page.reload();
		await expect(chips).toHaveCount(12);
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
