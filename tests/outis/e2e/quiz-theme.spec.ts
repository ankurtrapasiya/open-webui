import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { test, expect } from '../support/fixtures';

// outis-mneme's themed QuizUI tool (services/quizui/quizui.py) shown as a tool embed: it must take
// the Outis colours for whichever theme the app is in. Skips without outis-mneme.
// Spec: specs/SPEC-chat-render.md (QZ-1).
const SRC = `${process.env.OUTIS_MNEME_DIR ?? `${homedir()}/GithubProjects/outis-mneme`}/services/quizui/quizui.py`;
test.skip(!existsSync(SRC), `needs ${SRC}`);

test('QZ-1 the quiz embed uses Outis dark and light colours and follows a theme switch', async ({ page, api }) => {
	await api.tool('quizui', readFileSync(SRC, 'utf8'));
	const quiz = { title: 'QZ1', questions: [{ question: 'QZ1 question?', answer: 'right', distractors: ['wrong a', 'wrong b'] }] };
	const { chatId, messageId } = await api.startChat({ model: 'fake-model', content: `CALL generate_quiz ${JSON.stringify(quiz)}`, tool_ids: ['quizui'] });
	await api.waitForReply(chatId, messageId);
	await page.goto(`/c/${chatId}`);
	const body = page.frameLocator('iframe[title="Embedded Content"]').locator('body');
	await expect(body).toContainText('QZ1 question?');
	const bg = () => body.evaluate((b) => getComputedStyle(b).backgroundColor);
	const expected = { dark: 'rgb(21, 19, 17)', light: 'rgb(251, 249, 245)' }; // #151311, #fbf9f5
	for (const theme of ['dark', 'light', 'dark'] as const) {
		await page.evaluate((t) => document.documentElement.classList.toggle('dark', t === 'dark'), theme);
		await expect.poll(bg).toBe(expected[theme]);
	}
});
