import { test, expect } from '../support/fixtures';

test.beforeEach(async ({ api }) => {
	await api.deleteAllNotes();
});

const folderOf = async (api: any, id: string) => (await api.getNote(id)).meta?.folder ?? null;

test('NF-1 folder paths are normalised on create', async ({ api }) => {
	const cases: [string, string | null][] = [
		[' a / /b/ ', 'a/b'],
		['/', null],
		['', null],
		['   ', null]
	];
	for (const [input, stored] of cases) {
		const note = await api.note({ title: `NF-1 ${JSON.stringify(input)}`, folder: input });
		expect(await folderOf(api, note.id), `folder ${JSON.stringify(input)}`).toBe(stored);
	}
});

test('NF-2 the folder list is distinct, sorted and has no empty paths', async ({ api }) => {
	await api.note({ title: 'NF-2 a', folder: 'Zeta' });
	await api.note({ title: 'NF-2 b', folder: 'Alpha/Sub' });
	await api.note({ title: 'NF-2 c', folder: 'Alpha/Sub' });
	await api.note({ title: 'NF-2 d' });
	await api.note({ title: 'NF-2 e', folder: '/' });
	expect(await api.folders()).toEqual(['Alpha/Sub', 'Zeta']);
});

test('NF-3 searching a folder includes its subfolders but not a prefix sibling', async ({ api }) => {
	await api.note({ title: 'NF-3 in', folder: 'ML' });
	await api.note({ title: 'NF-3 sub', folder: 'ML/Murphy' });
	await api.note({ title: 'NF-3 sibling', folder: 'ML4T' });
	await api.note({ title: 'NF-3 unfiled' });
	const titles = (await api.search({ folder: 'ML' })).items.map((n) => n.title).sort();
	expect(titles).toEqual(['NF-3 in', 'NF-3 sub']);
});

test('NF-4 deleting a folder removes its subfolders but not a prefix sibling', async ({ api }) => {
	await api.note({ title: 'NF-4 a', folder: 'ML' });
	await api.note({ title: 'NF-4 b', folder: 'ML/Murphy' });
	await api.note({ title: 'NF-4 c', folder: 'ML4T' });
	await api.note({ title: 'NF-4 d' });

	expect(await api.deleteFolder('ML')).toBe(2);

	expect(await api.folders()).toEqual(['ML4T']);
	const left = (await api.search()).items.map((n) => n.title).sort();
	expect(left).toEqual(['NF-4 c', 'NF-4 d']);
});

test('NF-5 deleting "/" deletes nothing, and a missing path is rejected', async ({ api }) => {
	await api.note({ title: 'NF-5 a', folder: 'Keep' });
	expect(await api.deleteFolder('/')).toBe(0);
	expect((await api.deleteFolderRaw()).status()).toBe(422);
	expect((await api.search()).items).toHaveLength(1);
});

test("NF-6 a plain user cannot delete another user's notes through folder delete", async ({ api }) => {
	const note = await api.note({ title: 'NF-6 admin note', folder: 'Shared' });
	const other = await api.userApi('nf6@regression.test');
	try {
		expect(await other.deleteFolder('Shared')).toBe(0);
	} finally {
		await other.dispose();
	}
	expect((await api.getNote(note.id)).title).toBe('NF-6 admin note');
});

test('NF-7 moving a note to "/" takes it out of every folder', async ({ api }) => {
	const note = await api.note({ title: 'NF-7 note', folder: 'Somewhere' });
	await api.updateNote(note.id, { title: 'NF-7 note', meta: { folder: '/' } });
	expect(await folderOf(api, note.id)).toBeNull();
	expect(await api.folders()).toEqual([]);
});

test('NF-8 a new empty folder survives a reload and is kept once it holds a note', async ({ page, api }) => {
	await page.goto('/notes');
	await page.locator('button[aria-label="Open create menu"]').click();
	await page.getByRole('menuitem', { name: 'New folder' }).or(page.getByText('New folder', { exact: true })).first().click();
	const dialog = page.getByRole('dialog', { name: 'New folder' });
	await dialog.locator('textarea').fill('NF8');
	await dialog.getByRole('button', { name: 'Create' }).click();

	await page.reload();
	expect(await page.evaluate(() => JSON.parse(localStorage.noteEmptyFolders ?? '[]'))).toContain('NF8');
	await expect(page.getByRole('button', { name: 'NF8' }).first()).toBeVisible();

	// Once a note lives there, the server knows the folder and the local copy is dropped.
	await api.note({ title: 'NF-8 note', folder: 'NF8' });
	await page.reload();
	await expect(page.getByRole('button', { name: 'NF8' }).first()).toBeVisible();
	expect(await page.evaluate(() => JSON.parse(localStorage.noteEmptyFolders ?? '[]'))).not.toContain('NF8');
});

test('NF-9 move a note into a nested folder, then delete that folder from the folder bar', async ({ page, api }) => {
	const note = await api.note({ title: 'NF-9 note' });
	await page.goto('/notes');

	const row = page.getByRole('button', { name: 'Open note' }).filter({ hasText: 'NF-9 note' });
	await row.hover();
	await row.locator('button[aria-label="Note Menu"]').click();
	await page.getByText('Move to folder', { exact: true }).click();
	const move = page.getByRole('dialog', { name: 'Move to folder' });
	await move.locator('textarea').fill('NF9/Sub');
	await move.getByRole('button', { name: 'Move' }).click();

	await expect.poll(async () => (await api.getNote(note.id)).meta?.folder).toBe('NF9/Sub');

	// Open the nested folder through the chips, then delete it with the trash button.
	await page.getByRole('button', { name: 'NF9', exact: true }).first().click();
	await page.getByRole('button', { name: 'Sub', exact: true }).first().click();
	await page.getByRole('button', { name: 'Delete folder' }).click();
	await page.getByRole('dialog', { name: 'Delete folder?' }).getByRole('button', { name: 'Confirm' }).click();

	await expect(page.getByText('Deleted 1 notes')).toBeVisible();
	expect(await page.evaluate(() => localStorage.noteFolder)).toBe('NF9');
	expect((await api.search()).items).toHaveLength(0);
});

test('NF-10 deleting folder "a_b" does not delete notes in "aXb"', async ({ api }) => {
	await api.note({ title: 'NF-10 target', folder: 'a_b' });
	const bystander = await api.note({ title: 'NF-10 bystander', folder: 'aXb' });
	await api.deleteFolder('a_b');
	expect((await api.search()).items.map((n) => n.id)).toContain(bystander.id);
});
