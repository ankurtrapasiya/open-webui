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
