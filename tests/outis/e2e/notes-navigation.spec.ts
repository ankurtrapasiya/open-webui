import type { Page } from '@playwright/test';
import { test, expect } from '../support/fixtures';

test.beforeEach(async ({ api }) => {
	await api.deleteAllNotes();
});

// Three notes whose titles sort a < b < c, created c, b, a so creation order differs from name order.
async function threeNotes(api: any, prefix: string, folder?: string) {
	const c = await api.note({ title: `${prefix}-c`, folder });
	const b = await api.note({ title: `${prefix}-b`, folder });
	const a = await api.note({ title: `${prefix}-a`, folder });
	return { a, b, c };
}

const byName = { order_by: 'name', direction: 'asc' };

async function useNameSort(page: Page) {
	await page.addInitScript(() => {
		localStorage.noteSortKey = 'name';
		localStorage.noteSortDirection = 'asc';
		localStorage.removeItem('noteFolder');
	});
}

const position = (page: Page) => page.getByText(/^\d+ \/ \d+$/);

test('NN-1 the middle note knows both neighbours, its index and the total', async ({ api }) => {
	const { a, b, c } = await threeNotes(api, 'NN1');
	const n = await api.neighbors(b.id, byName);
	expect(n.prev).toEqual({ id: a.id, title: 'NN1-a' });
	expect(n.next).toEqual({ id: c.id, title: 'NN1-c' });
	expect(n.index).toBe(1);
	expect(n.total).toBe(3);
});

test('NN-2 the first note has no previous and the last has no next', async ({ api }) => {
	const { a, c } = await threeNotes(api, 'NN2');
	expect((await api.neighbors(a.id, byName)).prev).toBeNull();
	expect((await api.neighbors(c.id, byName)).next).toBeNull();
});

test('NN-3 stepping order matches the list order for every sort', async ({ api }) => {
	const notes = [];
	for (const t of ['NN3-b', 'NN3-a', 'NN3-c']) {
		notes.push(await api.note({ title: t }));
		await new Promise((r) => setTimeout(r, 1100)); // distinct timestamps (second resolution)
	}
	await api.updateNote(notes[0].id, { title: 'NN3-b', data: { content: { json: null, html: '', md: 'touched' } } });

	for (const order_by of ['name', 'created_at', 'updated_at']) {
		for (const direction of ['asc', 'desc']) {
			const params = { order_by, direction };
			const list = (await api.search(params)).items.map((n: any) => n.id);
			const walked: string[] = [];
			let id: string | null = list[0];
			while (id) {
				walked.push(id);
				id = (await api.neighbors(id, params)).next?.id ?? null;
			}
			expect(walked, `${order_by} ${direction}`).toEqual(list);
		}
	}
});

test('NN-4 a folder limits the stepping to that folder', async ({ api }) => {
	const { b } = await threeNotes(api, 'NN4', 'NN4');
	const outside = await api.note({ title: 'NN4-outside' });
	expect((await api.neighbors(b.id, { ...byName, folder: 'NN4' })).total).toBe(3);
	expect((await api.neighborsRaw(outside.id, { ...byName, folder: 'NN4' })).status()).toBe(404);
});

test('NN-5 the neighbours response carries no note content', async ({ api }) => {
	const { b } = await threeNotes(api, 'NN5');
	const n = await api.neighbors(b.id, byName);
	expect(Object.keys(n).sort()).toEqual(['index', 'next', 'prev', 'total']);
	expect(Object.keys(n.prev).sort()).toEqual(['id', 'title']);
});

test('NN-6 the stepper shows the position and steps to the next note', async ({ page, api }) => {
	const { b, c } = await threeNotes(api, 'NN6');
	await useNameSort(page);
	await page.goto(`/notes/${b.id}`);
	await expect(position(page)).toHaveText('2 / 3');

	await page.getByRole('button', { name: 'Next note' }).click();

	await expect(page).toHaveURL(new RegExp(`/notes/${c.id}$`));
	await expect(position(page)).toHaveText('3 / 3');
	await expect(page.getByRole('button', { name: 'Next note' })).toBeDisabled();
});

test('NN-7 Alt+Down steps from the page, but not while typing in the editor', async ({ page, api }) => {
	const { b, c } = await threeNotes(api, 'NN7');
	await useNameSort(page);
	await page.goto(`/notes/${b.id}`);
	await expect(position(page)).toHaveText('2 / 3');

	// Typing in the editor: Alt+Down must not navigate.
	await page.locator(`#note-${b.id}`).click();
	await page.keyboard.press('Alt+ArrowDown');
	await expect(position(page)).toHaveText('2 / 3');
	await expect(page).toHaveURL(new RegExp(`/notes/${b.id}$`));

	// Focus on the page instead: Alt+Down opens the next note.
	await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
	await page.keyboard.press('Alt+ArrowDown');
	await expect(page).toHaveURL(new RegExp(`/notes/${c.id}$`));
});

test('NN-8 the list sort is remembered and the stepper follows it', async ({ page, api }) => {
	const { a, b } = await threeNotes(api, 'NN8');
	await page.goto('/notes');
	await page.evaluate(() => {
		localStorage.removeItem('noteSortKey');
		localStorage.removeItem('noteSortDirection');
		localStorage.removeItem('noteFolder');
	});
	await page.reload();
	await page.getByRole('button', { name: 'Title', exact: true }).click();
	await page.reload();
	expect(await page.evaluate(() => [localStorage.noteSortKey, localStorage.noteSortDirection])).toEqual(['name', 'asc']);

	// By name, a is first and b is second, although a was created last.
	await page.goto(`/notes/${b.id}`);
	await expect(position(page)).toHaveText('2 / 3');
	await page.getByRole('button', { name: 'Previous note' }).click();
	await expect(page).toHaveURL(new RegExp(`/notes/${a.id}$`));
});

test('NN-9 a single note shows no stepper', async ({ page, api }) => {
	const only = await api.note({ title: 'NN9-only' });
	await useNameSort(page);
	await page.goto(`/notes/${only.id}`);
	await expect(page.locator(`#note-${only.id}`)).toBeVisible();
	await expect(page.getByRole('button', { name: 'Next note' })).toHaveCount(0);
	await expect(position(page)).toHaveCount(0);
});
