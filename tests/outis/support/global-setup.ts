import { Api, adminToken } from './api';

// Creates the admin on a fresh database and hands its token to every test.
export default async function globalSetup() {
	const token = await adminToken();
	process.env.OUTIS_ADMIN_TOKEN = token;

	// A new admin gets the "What's New" modal over every page; turn it off.
	const api = await Api.create(token);
	await api.updateUiSettings({ showChangelog: false });
	await api.dispose();
}
