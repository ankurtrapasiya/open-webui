import { request, type APIRequestContext } from '@playwright/test';

export const ADMIN = { name: 'Regression Admin', email: 'admin@regression.test', password: 'regression-only' };

export const baseURL = () => process.env.OUTIS_BASE_URL ?? 'http://localhost:3099';

// Sign in as the admin, signing up first on a fresh database (the first user becomes admin).
export async function adminToken(): Promise<string> {
	const ctx = await request.newContext({ baseURL: baseURL() });
	try {
		let res = await ctx.post('/api/v1/auths/signin', { data: { email: ADMIN.email, password: ADMIN.password } });
		if (!res.ok()) res = await ctx.post('/api/v1/auths/signup', { data: ADMIN });
		if (!res.ok()) throw new Error(`admin sign-in failed: ${res.status()} ${await res.text()}`);
		return (await res.json()).token;
	} finally {
		await ctx.dispose();
	}
}

export class Api {
	constructor(
		private ctx: APIRequestContext,
		readonly token: string
	) {}

	static async create(token: string) {
		const ctx = await request.newContext({
			baseURL: baseURL(),
			extraHTTPHeaders: { Authorization: `Bearer ${token}` }
		});
		return new Api(ctx, token);
	}

	// Unwrapped request, for tests that assert on status codes or unusual endpoints.
	raw(method: 'GET' | 'POST' | 'DELETE', path: string, data?: unknown) {
		return this.ctx.fetch(path, { method, ...(data !== undefined ? { data } : {}) });
	}

	async dispose() {
		await this.ctx.dispose();
	}

	private async json(res: Awaited<ReturnType<APIRequestContext['get']>>) {
		if (!res.ok()) throw new Error(`${res.url()} → ${res.status()} ${await res.text()}`);
		return res.json();
	}

	async note(opts: { title: string; md?: string; folder?: string }) {
		const md = opts.md ?? '';
		return this.json(
			await this.ctx.post('/api/v1/notes/create', {
				data: {
					title: opts.title,
					data: { content: { json: null, html: '', md } },
					...(opts.folder !== undefined ? { meta: { folder: opts.folder } } : {}),
					access_grants: []
				}
			})
		);
	}

	// Merges into the user's `ui` settings (the endpoint replaces the whole object).
	async updateUiSettings(ui: Record<string, unknown>) {
		const current = (await this.json(await this.ctx.get('/api/v1/users/user/settings'))) ?? {};
		await this.json(
			await this.ctx.post('/api/v1/users/user/settings/update', {
				data: { ...current, ui: { ...(current.ui ?? {}), ...ui } }
			})
		);
	}

	// A note created with exactly the given body, for shapes `note()` would normalise.
	async rawNote(body: Record<string, unknown>) {
		return this.json(await this.ctx.post('/api/v1/notes/create', { data: { access_grants: [], ...body } }));
	}

	async getNote(id: string) {
		return this.json(await this.ctx.get(`/api/v1/notes/${id}`));
	}

	async updateNote(id: string, body: Record<string, unknown>) {
		return this.json(await this.ctx.post(`/api/v1/notes/${id}/update`, { data: body }));
	}

	async folders(): Promise<string[]> {
		return this.json(await this.ctx.get('/api/v1/notes/folders'));
	}

	async search(params: Record<string, string> = {}): Promise<{ items: any[]; total: number }> {
		return this.json(await this.ctx.get('/api/v1/notes/search', { params }));
	}

	// Raw response, so tests can assert on status codes as well as the count.
	deleteFolderRaw(path?: string) {
		return this.ctx.delete('/api/v1/notes/folders/delete', { params: path === undefined ? {} : { path } });
	}

	async deleteFolder(path: string): Promise<number> {
		return this.json(await this.deleteFolderRaw(path));
	}

	neighborsRaw(id: string, params: Record<string, string> = {}) {
		return this.ctx.get(`/api/v1/notes/${id}/neighbors`, { params });
	}

	async neighbors(id: string, params: Record<string, string> = {}) {
		return this.json(await this.neighborsRaw(id, params));
	}

	// Deletes every note the caller can see, so a test starts from a known set.
	async deleteAllNotes() {
		for (;;) {
			const { items } = await this.search({ permission: 'write' });
			if (!items.length) return;
			for (const n of items) await this.json(await this.ctx.delete(`/api/v1/notes/${n.id}/delete`));
		}
	}

	// A saved chat with one question and one fixed assistant reply; no model is called.
	async chat(opts: { title: string; user?: string; assistant: string; followUps?: string[] }) {
		const u = crypto.randomUUID();
		const a = crypto.randomUUID();
		const ts = Math.floor(Date.now() / 1000);
		const model = 'regression-model';
		const messages = {
			[u]: { id: u, parentId: null, childrenIds: [a], role: 'user', content: opts.user ?? 'Question', timestamp: ts, models: [model] },
			[a]: { id: a, parentId: u, childrenIds: [], role: 'assistant', content: opts.assistant, model, modelIdx: 0, done: true, timestamp: ts, ...(opts.followUps ? { followUps: opts.followUps } : {}) }
		};
		return this.json(
			await this.ctx.post('/api/v1/chats/new', {
				data: {
					chat: {
						title: opts.title,
						models: [model],
						history: { currentId: a, messages },
						messages: [messages[u], messages[a]],
						timestamp: Date.now()
					}
				}
			})
		);
	}

	// Creates or replaces a workspace tool (Python source).
	async tool(id: string, content: string) {
		await this.ctx.delete(`/api/v1/tools/id/${id}/delete`).catch(() => null);
		return this.json(
			await this.ctx.post('/api/v1/tools/create', { data: { id, name: id, content, meta: { description: id } } })
		);
	}

	async skill(id: string, name: string, content: string) {
		await this.ctx.delete(`/api/v1/skills/id/${id}/delete`).catch(() => null);
		return this.json(
			await this.ctx.post('/api/v1/skills/create', { data: { id, name, description: name, content, is_active: true } })
		);
	}

	async setSuggestions(suggestions: { title: [string, string]; content: string }[]) {
		return this.json(await this.ctx.post('/api/v1/configs/suggestions', { data: { suggestions } }));
	}

	// Starts a new saved chat the way the UI does (background task, streamed over the socket)
	// and returns its ids. Use waitForReply to read the result.
	async startChat(opts: { model: string; content: string; tool_ids?: string[]; params?: Record<string, unknown> }) {
		const mid = crypto.randomUUID();
		const uid = crypto.randomUUID();
		const res = await this.json(
			await this.ctx.post('/api/chat/completions', {
				data: {
					stream: true,
					model: opts.model,
					messages: [{ role: 'user', content: opts.content }],
					params: opts.params ?? {},
					...(opts.tool_ids ? { tool_ids: opts.tool_ids } : {}),
					features: {},
					id: mid,
					message_ids: [{ model_id: opts.model, message_id: mid, modelIdx: 0 }],
					parent_id: null,
					user_message: {
						id: uid, parentId: null, childrenIds: [mid], role: 'user', content: opts.content,
						timestamp: Math.floor(Date.now() / 1000), models: [opts.model]
					},
					background_tasks: {},
					session_id: `regression-${mid.slice(0, 8)}`
				}
			})
		);
		return { chatId: res.chat_id as string, messageId: mid };
	}

	async getChat(id: string) {
		return this.json(await this.ctx.get(`/api/v1/chats/${id}`));
	}

	// Polls the saved chat until the assistant message satisfies `done` (default: finished).
	async waitForReply(chatId: string, messageId: string, done = (m: any) => m?.done === true) {
		const deadline = Date.now() + 60_000;
		for (;;) {
			const chat = await this.getChat(chatId);
			const m = chat.chat?.history?.messages?.[messageId];
			if (done(m)) return { chat, message: m };
			if (Date.now() > deadline) throw new Error(`reply never finished: ${JSON.stringify(m)?.slice(0, 500)}`);
			await new Promise((r) => setTimeout(r, 500));
		}
	}

	async resolveToolCall(chatId: string, messageId: string, callId: string) {
		return this.json(
			await this.ctx.post(`/api/v1/chats/${chatId}/messages/${messageId}/resolve`, {
				data: { call_id: callId, action: 'approve' }
			})
		);
	}

	async file(id: string) {
		return this.json(await this.ctx.get(`/api/v1/files/${id}`));
	}

	// Creates (or signs in) a plain user and returns an Api acting as that user.
	async userApi(email: string): Promise<Api> {
		const password = 'regression-only';
		const res = await this.ctx.post('/api/v1/auths/add', {
			data: { name: email.split('@')[0], email, password, role: 'user' }
		});
		let token: string;
		if (res.ok()) {
			token = (await res.json()).token;
		} else {
			const ctx = await request.newContext({ baseURL: baseURL() });
			const r = await ctx.post('/api/v1/auths/signin', { data: { email, password } });
			token = (await this.json(r)).token;
			await ctx.dispose();
		}
		return Api.create(token);
	}
}
