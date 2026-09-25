import { Api, adminToken } from './api';
import { startFakeOpenAI } from './fake-openai';

// Starts the fake model server, creates the admin on a fresh database, and hands its token to
// every test. Returns the teardown that stops the fake server.
export default async function globalSetup() {
	const fake = await startFakeOpenAI();

	const token = await adminToken();
	process.env.OUTIS_ADMIN_TOKEN = token;

	// A new admin gets the "What's New" modal over every page; turn it off.
	const api = await Api.create(token);
	await api.updateUiSettings({ showChangelog: false });
	await api.dispose();

	return () => new Promise<void>((resolve) => fake.close(() => resolve()));
}
