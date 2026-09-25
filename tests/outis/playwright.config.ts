import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.OUTIS_BASE_URL ?? 'http://localhost:3099';

// The suite creates and deletes data freely, so it must never reach the live instance.
if (/:3001\b|\.ts\.net/.test(baseURL)) {
	throw new Error(`Refusing to run against the live instance: ${baseURL}`);
}

export default defineConfig({
	testDir: './e2e',
	fullyParallel: false,
	workers: 1,
	retries: 0,
	timeout: 60_000,
	reporter: [['list']],
	globalSetup: './support/global-setup.ts',
	use: {
		baseURL,
		...devices['Desktop Chrome'],
		viewport: { width: 1400, height: 900 },
		trace: 'retain-on-failure'
	}
});
