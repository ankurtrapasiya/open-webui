import { existsSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { homedir } from 'node:os';
import { test, expect } from '../support/fixtures';
import { container } from '../support/container';

// The explainer_video tool from outis-mneme (services/manim-render/owui_video.py) run against
// the live manim-render service, which this test container joins on its internal network.
// Guards the Open WebUI APIs the tool leans on (tool calls, upload_file_handler, message files,
// file streaming). Skips when outis-mneme or manim-render is not on this machine.
// Spec: specs/SPEC-explainer-video.md.

const SRC = `${process.env.OUTIS_MNEME_DIR ?? `${homedir()}/GithubProjects/outis-mneme`}/services/manim-render/owui_video.py`;
const NET = process.env.OUTIS_MANIM_NETWORK ?? 'llama-server_manim';

const networkUp = () => {
	try {
		return execFileSync('docker', ['network', 'inspect', NET, '-f', '{{len .Containers}}'], { encoding: 'utf8' }).trim() !== '0';
	} catch {
		return false;
	}
};

test.skip(!existsSync(SRC) || !networkUp(), `needs ${SRC} and the ${NET} network with manim-render`);

test.beforeAll(async ({ api }) => {
	try {
		execFileSync('docker', ['network', 'connect', NET, container()], { stdio: 'ignore' });
	} catch {
		// already connected (beforeAll re-runs after a failed test)
	}
	await api.tool('explainer_video', readFileSync(SRC, 'utf8'));
});

async function turn(api: any, args: object) {
	const { chatId, messageId } = await api.startChat({
		model: 'fake-model', content: `CALL explainer_video ${JSON.stringify(args)}`, tool_ids: ['explainer_video']
	});
	const { message } = await api.waitForReply(chatId, messageId);
	const out = (message.output ?? []).find((o: any) => o.type === 'function_call_output');
	return { message, text: JSON.stringify(out?.output ?? out) };
}

test('EV-1 slides come back as an mp4 attached to the message that a browser plays', async ({ api, page }) => {
	const slides = [{ title: 'EV1', bullets: ['one point'] }];
	const { message, text } = await turn(api, { slides, title: 'ev1 test' });
	const id = text.match(/<video>\/api\/v1\/files\/([0-9a-f-]+)\/content<\/video>/)?.[1];
	expect(id, text).toBeTruthy();
	expect((message.files ?? []).map((f: any) => f.name)).toContain('ev1-test.mp4');

	await page.goto('/');
	// A real login sets this cookie; <video src> sends it, not the localStorage token.
	await page.context().addCookies([{ name: 'token', value: process.env.OUTIS_ADMIN_TOKEN!, url: page.url() }]);
	const meta: any = await page.evaluate(
		(u) =>
			new Promise((ok) => {
				const v = document.createElement('video');
				v.onloadedmetadata = () => ok({ duration: v.duration, width: v.videoWidth });
				v.onerror = () => ok({ error: v.error?.code });
				v.src = u;
			}),
		`/api/v1/files/${id}/content`
	);
	expect(meta.duration, JSON.stringify(meta)).toBeGreaterThan(0);
});

test('EV-2 a formula that is not valid LaTeX comes back as an error the model can fix', async ({ api }) => {
	const { text } = await turn(api, { slides: [{ title: 'EV2', formula: '\\frac{1' }] });
	expect(text).toContain('RENDER FAILED');
	expect(text).toContain('LaTeX');
});
