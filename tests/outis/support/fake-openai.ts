import http from 'node:http';

// A scripted OpenAI-compatible server. The test container is pointed at it, so chat features
// that need a model turn can be exercised with no real model and no network. It records every
// request so tests can assert what Outis sent.
//
// Models:
//   fake-model  replies "Fake reply." — or, when tools are offered and the last user message is
//               `CALL <tool> <json args>`, calls that tool, then replies once the result is back.
//   fake-drop   hangs up without answering (a dead upstream).
//
// Control endpoints for tests: GET /__requests, POST /__reset.

export const FAKE_PORT = Number(process.env.OUTIS_FAKE_PORT ?? 3098);

type Msg = { role: string; content: unknown };

const text = (content: unknown): string =>
	typeof content === 'string'
		? content
		: Array.isArray(content)
			? content.map((p: any) => (typeof p === 'string' ? p : (p?.text ?? ''))).join('')
			: '';

function reply(body: any): { content?: string; toolCall?: { name: string; arguments: string } } {
	const messages: Msg[] = body.messages ?? [];
	const last = messages[messages.length - 1];
	if (last?.role === 'tool') return { content: 'Tool result received.' };
	const lastUser = [...messages].reverse().find((m) => m.role === 'user');
	const m = text(lastUser?.content).match(/CALL (\w+)\s*(\{.*\})?/s);
	if (m && (body.tools ?? []).some((t: any) => t.function?.name === m[1])) {
		return { toolCall: { name: m[1], arguments: m[2] ?? '{}' } };
	}
	return { content: 'Fake reply.' };
}

function sse(res: http.ServerResponse, chunks: object[]) {
	res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' });
	for (const c of chunks) res.write(`data: ${JSON.stringify(c)}\n\n`);
	res.end('data: [DONE]\n\n');
}

export function startFakeOpenAI(port = FAKE_PORT): Promise<http.Server> {
	const requests: { path: string; body: any }[] = [];

	const server = http.createServer((req, res) => {
		let raw = '';
		req.on('data', (d) => (raw += d));
		req.on('end', () => {
			const url = req.url ?? '';
			const body = raw ? JSON.parse(raw) : null;
			const json = (code: number, obj: unknown) => {
				res.writeHead(code, { 'Content-Type': 'application/json' });
				res.end(JSON.stringify(obj));
			};

			if (url === '/__requests') return json(200, requests);
			if (url === '/__reset') {
				requests.length = 0;
				return json(200, { ok: true });
			}
			if (url.endsWith('/models')) {
				return json(200, {
					object: 'list',
					data: ['fake-model', 'fake-drop'].map((id) => ({ id, object: 'model', owned_by: 'regression' }))
				});
			}
			if (!url.endsWith('/chat/completions')) return json(404, { error: 'not scripted' });

			requests.push({ path: url, body });
			if (body?.model === 'fake-drop') return req.socket.destroy();

			const r = reply(body);
			const id = `chatcmpl-${requests.length}`;
			const base = { id, object: 'chat.completion.chunk', created: 0, model: body.model };
			if (!body.stream) {
				return json(200, {
					id,
					object: 'chat.completion',
					created: 0,
					model: body.model,
					choices: [
						{
							index: 0,
							finish_reason: r.toolCall ? 'tool_calls' : 'stop',
							message: r.toolCall
								? { role: 'assistant', content: null, tool_calls: [{ id: 'call_1', type: 'function', function: r.toolCall }] }
								: { role: 'assistant', content: r.content }
						}
					],
					usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 }
				});
			}
			const chunks = r.toolCall
				? [
						{ ...base, choices: [{ index: 0, delta: { role: 'assistant', tool_calls: [{ index: 0, id: 'call_1', type: 'function', function: r.toolCall }] }, finish_reason: null }] },
						{ ...base, choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }] }
					]
				: [
						{ ...base, choices: [{ index: 0, delta: { role: 'assistant', content: r.content }, finish_reason: null }] },
						{ ...base, choices: [{ index: 0, delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } }
					];
			sse(res, chunks);
		});
	});

	return new Promise((resolve) => server.listen(port, '0.0.0.0', () => resolve(server)));
}

// Helpers for tests (they run in worker processes, so they talk to the server over HTTP).
const local = (path: string) => `http://127.0.0.1:${FAKE_PORT}${path}`;
export const fakeRequests = async (): Promise<{ path: string; body: any }[]> => (await fetch(local('/__requests'))).json();
export const fakeReset = async () => void (await fetch(local('/__reset'), { method: 'POST' }));
