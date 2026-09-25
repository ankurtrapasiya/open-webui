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
