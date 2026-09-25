import type { Page } from '@playwright/test';
import { test, expect } from '../support/fixtures';

// Opens a note, types an edit, and tries to leave for the Notes list.
async function editThenLeave(page: Page, id: string) {
	await page.goto(`/notes/${id}`);
	const editor = page.locator(`#note-${id}`);
	await editor.click();
	await page.keyboard.press('End');
	await page.keyboard.type(' EDITED');
	await expect(page.getByRole('button', { name: 'Save', exact: true }).first()).toBeEnabled();
	await leave(page);
	return editor;
}

async function leave(page: Page) {
	// An in-app link, so SvelteKit's navigation guard (not a full page load) runs.
	await page.evaluate(() => {
		const a = document.createElement('a');
		a.href = '/notes';
		document.body.appendChild(a);
		a.click();
		a.remove();
	});
}

const saveDialog = (page: Page) => page.getByRole('dialog', { name: 'Save changes?' });

test('ND-4 leaving with unsaved changes asks first and stays on the note', async ({ page, api }) => {
	const note = await api.note({ title: 'ND-4 note', md: 'original' });
	await editThenLeave(page, note.id);
	await expect(saveDialog(page)).toBeVisible();
	await expect(page).toHaveURL(new RegExp(`/notes/${note.id}$`));
});

test('ND-5 Save in the dialog saves, then leaves', async ({ page, api }) => {
	const note = await api.note({ title: 'ND-5 note', md: 'original' });
	await editThenLeave(page, note.id);
	await saveDialog(page).getByRole('button', { name: 'Save' }).click();
	await expect(page).toHaveURL(/\/notes$/);
	expect((await api.getNote(note.id)).data.content.md).toContain('EDITED');
});

test('ND-6 Discard in the dialog leaves the stored note unchanged, then leaves', async ({ page, api }) => {
	const note = await api.note({ title: 'ND-6 note', md: 'original' });
	await editThenLeave(page, note.id);
	await saveDialog(page).getByRole('button', { name: 'Discard' }).click();
	await expect(page).toHaveURL(/\/notes$/);
	expect((await api.getNote(note.id)).data.content.md).toBe('original');
});

test('ND-9 Escape in the dialog keeps the user on the note with the draft intact', async ({ page, api }) => {
	const note = await api.note({ title: 'ND-9 escape', md: 'original' });
	const editor = await editThenLeave(page, note.id);
	await expect(saveDialog(page)).toBeVisible();

	await page.keyboard.press('Escape');

	await expect(saveDialog(page)).toBeHidden();
	await expect(page).toHaveURL(new RegExp(`/notes/${note.id}$`));
	await expect(editor).toContainText('EDITED');
	expect((await api.getNote(note.id)).data.content.md).toBe('original');

	// Still dirty, so leaving again asks again.
	await leave(page);
	await expect(saveDialog(page)).toBeVisible();
});

test('ND-9 a click outside the dialog keeps the user on the note with the draft intact', async ({ page, api }) => {
	const note = await api.note({ title: 'ND-9 outside', md: 'original' });
	const editor = await editThenLeave(page, note.id);
	await expect(saveDialog(page)).toBeVisible();

	await page.mouse.click(5, 5);

	await expect(saveDialog(page)).toBeHidden();
	await expect(page).toHaveURL(new RegExp(`/notes/${note.id}$`));
	await expect(editor).toContainText('EDITED');
	expect((await api.getNote(note.id)).data.content.md).toBe('original');
});
