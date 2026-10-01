import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { test, expect } from '../support/fixtures';

// outis-mneme's global "Format code" outlet filter (services/code-format/owui_filter.py): a finished
// reply's ```python blocks are saved Black-formatted. Guards the outlet path (inline outlet run,
// saved content). Skips without outis-mneme. Spec: specs/SPEC-chat-render.md (FM-1).
const SRC = `${process.env.OUTIS_MNEME_DIR ?? `${homedir()}/GithubProjects/outis-mneme`}/services/code-format/owui_filter.py`;
test.skip(!existsSync(SRC), `needs ${SRC}`);

test('FM-1 a reply\'s python block is saved Black-formatted; invalid snippets are left alone', async ({ page, api }) => {
	const ctx = (api as any).ctx;
	await ctx.delete('/api/v1/functions/id/format_code/delete').catch(() => null);
	await ctx.post('/api/v1/functions/create', { data: { id: 'format_code', name: 'Format code', content: readFileSync(SRC, 'utf8'), meta: { description: 'FM-1' } } });
	await ctx.post('/api/v1/functions/id/format_code/toggle');
	await ctx.post('/api/v1/functions/id/format_code/toggle/global');
	try {
		const reply = 'Code:\n\n```python\nevidence = lik*prior + false_pos*(1-prior)\n```\n\nBroken:\n\n```python\nfor x in\n```';
		const { chatId, messageId } = await api.startChat({ model: 'fake-model', content: 'ECHO\n' + reply });
		await api.waitForReply(chatId, messageId);
		await expect
			.poll(async () => (await api.getChat(chatId)).chat.history.messages[messageId].content)
			.toContain('evidence = lik * prior + false_pos * (1 - prior)');
		const saved = (await api.getChat(chatId)).chat.history.messages[messageId].content;
		expect(saved).toContain('```python\nfor x in\n```');
		await page.goto(`/c/${chatId}`);
		await expect(page.locator('#response-content-container').last()).toContainText('lik * prior');
	} finally {
		await ctx.delete('/api/v1/functions/id/format_code/delete').catch(() => null);
	}
});
