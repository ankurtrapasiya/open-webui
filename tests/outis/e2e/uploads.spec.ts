import { test, expect } from '../support/fixtures';

// Live uploads go to extract-router, which hands documents to Docling. The suite has neither, so
// Docling at a port nothing listens on stands in: anything still routed there fails the upload.
test('UP-1 a CSV labelled as Excel is read locally even with Docling as the engine', async ({ api }) => {
	const ctx = (api as any).ctx;
	const before = await (await ctx.get('/api/v1/retrieval/config')).json();
	const set = (engine: string, url: string) =>
		ctx.post('/api/v1/retrieval/config/update', {
			data: { CONTENT_EXTRACTION_ENGINE: engine, DOCLING_SERVER_URL: url }
		});
	expect((await set('docling', 'http://127.0.0.1:9')).ok()).toBe(true);
	try {
		const res = await ctx.post('/api/v1/files/?process_in_background=false', {
			multipart: {
				file: {
					name: 'UP1-holdings.csv',
					mimeType: 'application/vnd.ms-excel',
					buffer: Buffer.from('ticker,shares,price\nUPAAA,10,1.5\nUPBBB,20,2.5\n')
				}
			}
		});
		expect(res.ok(), await res.text()).toBe(true);
		const file = await api.file((await res.json()).id);
		expect(file.data.status).toBe('completed');
		expect(file.data.content).toContain('ticker: UPAAA');
	} finally {
		await set(before.CONTENT_EXTRACTION_ENGINE ?? '', before.DOCLING_SERVER_URL ?? '');
	}
});
