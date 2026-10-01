import type { Page } from '@playwright/test';
import { test, expect } from '../support/fixtures';

// How an answer's code, HTML and media render inside the chat. Spec: specs/SPEC-chat-render.md.

async function openChat(page: Page, api: any, assistant: string, title: string) {
	const chat = await api.chat({ title, assistant });
	await page.goto(`/c/${chat.id}`);
	const message = page.locator('#response-content-container').last();
	await expect(message).toBeVisible();
	return message;
}

const fence = (lang: string, body: string) => '```' + lang + '\n' + body + '\n```';

test('CR-1 an html block runs inline in the message, and the side panel stays shut', async ({ page, api }) => {
	const html = '<!DOCTYPE html><html><head></head><body><h2 id="t">CR1 inline</h2><input type="range" id="s"></body></html>';
	const message = await openChat(page, api, `Here it is:\n\n${fence('html', html)}`, 'CR-1');
	const frame = message.locator('iframe[title="Interactive content"]');
	await expect(frame).toBeVisible();
	await expect(page.frameLocator('#response-content-container iframe[title="Interactive content"]').locator('#t')).toHaveText('CR1 inline');
	// The Artifacts panel's iframe is titled "Content"; it must not have opened by itself.
	await page.waitForTimeout(1000);
	await expect(page.locator('iframe[title="Content"]')).toHaveCount(0);
});

test('CR-2 the inline embed grows to its content height', async ({ page, api }) => {
	const html = '<!DOCTYPE html><html><head></head><body style="margin:0"><div style="height:900px">CR2 tall</div></body></html>';
	const message = await openChat(page, api, fence('html', html), 'CR-2');
	const frame = message.locator('iframe[title="Interactive content"]');
	await expect.poll(async () => (await frame.boundingBox())?.height ?? 0).toBeGreaterThan(850);
});

test('CR-3 an svg block renders inline too', async ({ page, api }) => {
	const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="80"><text id="cr3" x="10" y="40">CR3 svg</text></svg>';
	const message = await openChat(page, api, fence('svg', svg), 'CR-3');
	await expect(page.frameLocator('#response-content-container iframe[title="Interactive content"]').locator('#cr3')).toHaveText('CR3 svg');
});

test('CR-4 the embed is sandboxed: no same-origin access to the app', async ({ page, api }) => {
	const html = '<!DOCTYPE html><html><head></head><body><p id="r"></p><script>let r;try{r=parent.localStorage.token?"LEAK":"none"}catch(e){r="blocked"}document.getElementById("r").textContent=r</script></body></html>';
	await openChat(page, api, fence('html', html), 'CR-4');
	await expect(page.frameLocator('#response-content-container iframe[title="Interactive content"]').locator('#r')).toHaveText('blocked');
});

test('CR-5 code blocks open expanded even with "Collapse code blocks" switched on', async ({ page, api }) => {
	await api.updateUiSettings({ collapseCodeBlocks: true });
	try {
		const message = await openChat(page, api, fence('python', 'print("CR5 visible")\nx = 1'), 'CR-5');
		await expect(message.locator('pre code, .cm-content').first()).toContainText('CR5 visible');
		await expect(message.getByText(/hidden lines/)).toHaveCount(0);
	} finally {
		await api.updateUiSettings({ collapseCodeBlocks: false });
	}
});

test('CR-6 an html block keeps its code visible under the embed', async ({ page, api }) => {
	const message = await openChat(page, api, fence('html', '<p>CR6 code</p>'), 'CR-6');
	await expect(message.locator('iframe[title="Interactive content"]')).toBeVisible();
	await expect(message.locator('pre code, .cm-content').first()).toContainText('<p>CR6 code</p>');
});

test('CR-7 a one-line <video>url</video> becomes a player', async ({ page, api }) => {
	const message = await openChat(page, api, 'Watch this:\n<video>/api/v1/files/cr7-not-real/content</video>\nThen read on.', 'CR-7');
	// The resolved address, which is what the player loads (the attribute may carry newlines).
	await expect.poll(() => message.locator('video').evaluate((v: HTMLVideoElement) => v.src)).toMatch(/\/api\/v1\/files\/cr7-not-real\/content$/);
	await expect(message).toContainText('Then read on.');
});

test('CR-8 the same tag on its own lines still works', async ({ page, api }) => {
	const message = await openChat(page, api, '<video>\n/api/v1/files/cr8-not-real/content\n</video>', 'CR-8');
	await expect.poll(() => message.locator('video').evaluate((v: HTMLVideoElement) => v.src)).toMatch(/\/api\/v1\/files\/cr8-not-real\/content$/);
});

test('CR-9 a chat video plays inside the message, not full-screen (playsinline, for iOS Safari)', async ({ page, api }) => {
	const message = await openChat(page, api, '<video>/api/v1/files/cr9-not-real/content</video>', 'CR-9');
	await expect(message.locator('video')).toHaveAttribute('playsinline', '');
	await expect(message.locator('video')).toHaveAttribute('controls', '');
});

const EMBED_TOOL = `"""
title: Regression embed
"""
from fastapi.responses import HTMLResponse


class Tools:
    def tall_embed(self) -> HTMLResponse:
        """
        Show a tall embedded page.
        """
        return HTMLResponse(
            content='<!doctype html><html><body style="margin:0"><div id="cr10" style="height:700px">CR10 tall</div></body></html>',
            headers={"Content-Disposition": "inline"},
        )
`;

test('CR-10 a tool embed (HTMLResponse) grows to its content, not the 150px iframe default', async ({ page, api }) => {
	await api.tool('regression_embed', EMBED_TOOL);
	const { chatId, messageId } = await api.startChat({ model: 'fake-model', content: 'CALL tall_embed', tool_ids: ['regression_embed'] });
	await api.waitForReply(chatId, messageId);
	await page.goto(`/c/${chatId}`);
	const frame = page.locator('iframe[title="Embedded Content"]');
	await expect(page.frameLocator('iframe[title="Embedded Content"]').locator('#cr10')).toHaveText('CR10 tall');
	await expect.poll(async () => (await frame.boundingBox())?.height ?? 0).toBeGreaterThan(650);
});

test('CR-11 an embed is told the Outis theme (data-outis-theme) and follows a theme switch', async ({ page, api }) => {
	const html =
		'<!DOCTYPE html><html><head></head><body><p id="t"></p><script>setInterval(() => (document.getElementById("t").textContent = document.documentElement.dataset.outisTheme), 50)</script></body></html>';
	await openChat(page, api, fence('html', html), 'CR-11');
	const t = page.frameLocator('#response-content-container iframe[title="Interactive content"]').locator('#t');
	const appTheme = await page.evaluate(() => (document.documentElement.classList.contains('dark') ? 'dark' : 'light'));
	await expect(t).toHaveText(appTheme);
	const other = appTheme === 'dark' ? 'light' : 'dark';
	await page.evaluate((o) => document.documentElement.classList.toggle('dark', o === 'dark'), other);
	await expect(t).toHaveText(other);
});

test('CR-12 a multi-line display equation with a lone "=" line renders as math, not a heading', async ({ page, api }) => {
	const content = [
		'Bellman equation, \\(v = r + \\gamma P v\\):',
		'\\[',
		'\\begin{bmatrix} 1 - 0.8\\gamma & -0.2\\gamma \\\\ -0.3\\gamma & 1 - 0.7\\gamma \\end{bmatrix}',
		'\\begin{bmatrix} v_1 \\\\ v_2 \\end{bmatrix}',
		'=',
		'\\begin{bmatrix} 1 \\\\ 2 \\end{bmatrix}',
		'\\]',
		'',
		'Rewards:',
		'$$',
		'r = \\begin{bmatrix} 1 \\\\ 2 \\end{bmatrix}',
		'$$',
		'',
		'```python',
		'x = 1',
		'```'
	].join('\n');
	const message = await openChat(page, api, content, 'CR-12');
	await expect(message.locator('.katex-display')).toHaveCount(2);
	await expect(message.locator('.katex-error')).toHaveCount(0);
	await expect(message.locator('h1, h2')).toHaveCount(0);
	expect(await message.innerText()).not.toMatch(/\\begin\{bmatrix\}/);
	await expect(message.locator('pre code, .cm-content').first()).toContainText('x = 1');
});
