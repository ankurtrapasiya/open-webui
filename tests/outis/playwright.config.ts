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
	// A fresh container loads each page's code on first use, which can take several seconds.
	expect: {
		timeout: 15_000,
		// Golden screenshots (VIS-3) are only compared on the deploy machine, so one flat folder and a small tolerance
		// for anti-aliasing. Update with scripts/outis-visual-update.sh after reading the diff.
		toHaveScreenshot: { maxDiffPixelRatio: 0.02, animations: 'disabled' }
	},
	snapshotPathTemplate: '{testDir}/../visual-baselines/{arg}{ext}',
	reporter: [['list']],
	globalSetup: './support/global-setup.ts',
	use: {
		baseURL,
		...devices['Desktop Chrome'],
		viewport: { width: 1400, height: 900 },
		trace: 'retain-on-failure'
	}
});
