import { test as base, expect } from '@playwright/test';
import { Api } from './api';

type Fixtures = { api: Api };

// `page` starts signed in as the admin; `api` talks to the same instance as the admin.
export const test = base.extend<Fixtures>({
	api: async ({}, use) => {
		const api = await Api.create(process.env.OUTIS_ADMIN_TOKEN!);
		await use(api);
		await api.dispose();
	},
	page: async ({ page }, use) => {
		const token = process.env.OUTIS_ADMIN_TOKEN!;
		await page.addInitScript((t) => localStorage.setItem('token', t), token);
		await use(page);
	}
});

export { expect };
