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
}
