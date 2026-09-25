import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { request } from '@playwright/test';
import { test, expect } from '../support/fixtures';
import { bundleContains, image } from '../support/container';

test('BR-1 the instance reports its name as Outis', async ({ api }) => {
	expect((await (await api.raw('GET', '/api/config')).json()).name).toBe('Outis');
});

test('BR-2 the installed-app manifest is named Outis', async ({ api }) => {
	const m = await (await api.raw('GET', '/manifest.json')).json();
	expect(m.name).toBe('Outis');
	expect(m.short_name).toBe('Outis');
});

test('BR-3 browser search integration is named Outis', async ({ api }) => {
	expect(await (await api.raw('GET', '/opensearch.xml')).text()).toContain('<ShortName>Outis');
});

test('BR-4 a WEBUI_NAME override is used exactly, with no upstream suffix', async () => {
	test.setTimeout(240_000);
	const name = `outis-br4-${process.pid}`;
	const port = 3097;
	execFileSync('docker', [
		'run', '-d', '--name', name, '-p', `127.0.0.1:${port}:8080`,
		'-e', 'WEBUI_NAME=Foo', '-e', 'WEBUI_SECRET_KEY=regression-only', '-e', 'ENABLE_OLLAMA_API=false',
		image()
	]);
	try {
		const ctx = await request.newContext({ baseURL: `http://127.0.0.1:${port}` });
		await expect
			.poll(async () => (await ctx.get('/health').catch(() => null))?.status() ?? 0, { timeout: 200_000, intervals: [3000] })
			.toBe(200);
		expect((await (await ctx.get('/api/config')).json()).name).toBe('Foo');
		await ctx.dispose();
	} finally {
		execFileSync('docker', ['rm', '-f', '-v', name]);
	}
});

test('BR-5 a dead model connection reports "Outis: Server Connection Error"', async ({ api }) => {
	const res = await api.raw('POST', '/api/chat/completions', {
		model: 'fake-drop',
		stream: false,
		messages: [{ role: 'user', content: 'BR-5' }]
	});
	expect(res.ok()).toBe(false);
	expect((await res.json()).detail).toContain('Outis: Server Connection Error');
});

test('BR-6 the page title and the sign-in page say Outis', async ({ page, browser, baseURL }) => {
	await page.goto('/');
	await expect(page).toHaveTitle('Outis');

	const anon = await browser.newPage({ baseURL });
	await anon.goto('/auth');
	await expect(anon.getByText(/Outis/).first()).toBeVisible();
	await anon.close();
});

test('BR-7 [KNOWN BUG] the leftover static web manifest is named Outis', async ({ api }) => {
	test.fail(true, 'static/static/site.webmanifest still says "Open WebUI"; the live manifest is /manifest.json (BR-2)');
	const m = await (await api.raw('GET', '/static/site.webmanifest')).json();
	expect(m.name).toBe('Outis');
});

test('BR-8 [KNOWN BUG] community sharing is described as the Open WebUI community', async () => {
	test.fail(true, 'the rebrand changed it to "Outis community", but it means the upstream community');
	expect(bundleContains('share chats with the Outis community')).toBe(false);
});

test('BR-9 the page shell is titled Outis before the app loads', async ({ api }) => {
	expect(await (await api.raw('GET', '/')).text()).toContain('<title>Outis</title>');
});

test('BR-10 the rebranded settings descriptions are in the built app', async () => {
	const rebranded = [
		'Outis uses faster-whisper internally.',
		'Outis uses SpeechT5 and CMU Arctic speaker embeddings.',
		'Map LDAP groups to Outis groups.',
		'Map OAuth claims to Outis groups.',
		'Map OAuth claims to Outis roles.',
		'Select how Outis authenticates with the Jupyter server.',
		'Discover how to use Outis and seek support from the community.'
	];
	// Presence only: the bundle ships every language, and some still carry upstream's English.
	for (const s of rebranded) expect(bundleContains(s), s).toBe(true);
});

// Strings the UI renders that name "Open WebUI" on purpose: they refer to the upstream project,
// its community or its company, not to this instance. A new upstream string that names the
// instance fails BR-11, so the next rebase decides: rebrand it or add it here.
const UPSTREAM_REFERENCES = new Set([
	'Do you want to sync your usage stats with Open WebUI Community?',
	'Forward cookies from your Open WebUI request to this server.', // names the instance; candidate to rebrand
	'Help us translate Open WebUI!',
	'Made by Open WebUI Community',
	'Open WebUI version',
	'Redirecting you to Open WebUI Community',
	'Running Open WebUI for a team?',
	'Share to Open WebUI Community',
	'By supporting the project through sponsorship or an enterprise license, you help us stay independent, ship new features faster, improve stability, and grow Open WebUI for the long haul.',
	'Event names may change as Open WebUI evolves. Use broad patterns like user.* for integrations that should continue across new related events.',
	'MCP support is experimental and its specification changes often, which can lead to incompatibilities. OpenAPI specification support is directly maintained by the Open WebUI team, making it the more reliable option for compatibility.',
	'Participate in community leaderboards and evaluations! Syncing aggregated usage stats helps drive research and improvements to Open WebUI. Your privacy is paramount: no message content is ever shared.',
	'You have more than 50 users, which often means this workspace is supporting organizational use. Open WebUI is free to use as-is, with no restrictions or hidden limits, and we want to keep it that way.',
	'Your entire contribution will go directly to the plugin developer; Open WebUI does not take any percentage. However, the chosen funding platform might have its own fees.'
]);

function sourceFiles(dir: string): string[] {
	return readdirSync(dir).flatMap((f) => {
		const p = join(dir, f);
		return statSync(p).isDirectory() ? sourceFiles(p) : /\.(svelte|ts)$/.test(f) ? [p] : [];
	});
}

test('BR-11 every UI string naming "Open WebUI" is a known upstream reference', async () => {
	const src = resolve(__dirname, '../../../src');
	const found = new Set<string>();
	for (const file of sourceFiles(src)) {
		const text = readFileSync(file, 'utf8');
		for (const m of text.matchAll(/i18n\.t\(\s*(['"`])((?:(?!\1).)*Open WebUI(?:(?!\1).)*)\1/gs)) found.add(m[2]);
	}
	expect([...found].filter((s) => !UPSTREAM_REFERENCES.has(s)).sort()).toEqual([]);
});
