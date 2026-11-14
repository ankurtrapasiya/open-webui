import DOMPurify from 'dompurify';
import { toast } from 'svelte-sonner';
import katex from 'katex';
import 'katex/dist/katex.min.css';

import { createNewNote } from '$lib/apis/notes';
import { safeImageUrl } from '$lib/utils/safeImageUrl';
import { marked } from 'marked';
// @ts-expect-error The installed file-saver package has no type declarations.
import fileSaver from 'file-saver';
import type { NoteContent, NotePage, NotePageOperation } from '$lib/apis/notes';
import { editorMarked } from '$lib/utils/marked/editor-marked';


// TipTap's static serialisation (`editor.getHTML()`, which is what
// `note.data.content.html` holds) renders a math node from its schema, not
// from its live NodeView -- so every formula comes out as an empty
// `<span data-type="inline-math" data-latex="...">` / `<div data-type=
// "block-math" ...>` with no visible content. That is invisible on screen
// too, but nobody notices because the open editor's NodeView has already
// painted real KaTeX markup into the same element; a PDF built from the
// stored HTML has no such NodeView and prints a blank gap where every
// formula was. Rendering each placeholder here, the same way the NodeView
// does (see @tiptap/extension-mathematics), is what makes the export match
// what the editor shows.
const renderMathPlaceholders = (root: HTMLElement) => {
	root
		.querySelectorAll<HTMLElement>('[data-type="inline-math"], [data-type="block-math"]')
		.forEach((el) => {
			const latex = el.getAttribute('data-latex');
			if (!latex) return;
			try {
				katex.render(latex, el, {
					throwOnError: false,
					displayMode: el.dataset.type === 'block-math'
				});
			} catch {
				el.textContent = latex;
			}
		});
};

// Opened synchronously from the click, before anything is awaited, so it stays
// inside the click's user-gesture chain and popup blockers leave it alone.
export const openPrintWindow = () => window.open('', '_blank');

// Notes become PDFs by printing them (Save as PDF is one of the destinations the
// browser's own print dialog offers): real, selectable text, real KaTeX, the
// app's own styling. Upstream's downloadPdf() screenshotted the note instead, so
// the whole page was one raster image with no text layer at all.
//
// Printed into a blank popup window, not the app itself: the app's html/body sit
// inside the shell's `h-screen` scroll container, and a browser paginating a
// print job does not reach across a scroll container's clipped edge -- content
// past the first page is cut off (a `position: fixed` escape does not fix it in
// Chromium either). A popup's own document has no such ancestor.
//
// Every stylesheet the app uses is cloned into the popup's head rather than
// re-derived (Tailwind, katex.min.css, the outis theme, code-highlighting
// colours), so printing inherits the theme's next change instead of drifting
// from it. The theme is forced to the light palette: paper is white, and the
// dark palette would print as mostly invisible or as wasted ink.
export const printNote = (printWindow: Window, title: string, bodyHtml: string) => {
	const styleTags = Array.from(document.querySelectorAll('link[rel="stylesheet"], style'))
		.map((el) => el.outerHTML)
		.join('\n');
	const safeTitle = title.replace(/</g, '&lt;');

	printWindow.document.write(`<!doctype html>
<html class="light outis-light">
<head>
<meta charset="utf-8">
<title>${safeTitle}</title>
${styleTags}
<style>
	@page { margin: 1.5cm; }
	body {
		max-width: 47rem;
		margin: 0 auto;
		padding: 1rem;
	}
	pre, table, .tiptap-mathematics-render {
		break-inside: avoid;
	}
</style>
</head>
<body class="tiptap ProseMirror">
<h1 style="font-size: 1.5rem; font-weight: 600; margin-bottom: 1rem;">${safeTitle}</h1>
${bodyHtml}
</body>
</html>`);
	printWindow.document.close();

	printWindow.onafterprint = () => printWindow.close();

	// Every cloned <link rel="stylesheet"> re-fetches in the popup's own document
	// even when cached, and KaTeX's glyphs are @font-face fonts that load
	// asynchronously too -- printing a beat early produces wrong metrics and
	// stray boxes. `load` doesn't fire on <style>, so this waits on the links,
	// then on the fonts.
	const links = Array.from(printWindow.document.querySelectorAll('link[rel="stylesheet"]'));
	Promise.all(
		links.map(
			(link) =>
				new Promise((resolve) => {
					if ((link as HTMLLinkElement).sheet) resolve(null);
					else {
						link.addEventListener('load', () => resolve(null), { once: true });
						link.addEventListener('error', () => resolve(null), { once: true });
					}
				})
		)
	)
		.then(() => printWindow.document.fonts?.ready)
		.then(() => {
			printWindow.focus();
			printWindow.print();
		});
};

// A note that is not open (the notes list menu) only has what is stored: its HTML,
// or for a markdown-only note (API, chat tool, bulk imports) its markdown, parsed
// the way the editor parses it on open. Math placeholders are rendered and pasted
// images resolved before printing. Code is not syntax-highlighted here; open the
// note and print from the editor for that.
export const storedNoteHtml = (note) => {
	const content = note.data?.content ?? {};
	const el = document.createElement('div');
	el.innerHTML = DOMPurify.sanitize(
		content.html || (content.md ? (editorMarked.parse(content.md) as string) : '')
	);
	renderMathPlaceholders(el);
	for (const img of el.querySelectorAll('img[src^="data://"]')) {
		const fileId = img.getAttribute('src').replace('data://', '');
		const file = (note.data?.files ?? []).find((f) => f.id === fileId);
		if (file) {
			img.setAttribute('src', safeImageUrl(file.url || ''));
		}
	}
	return el.innerHTML;
};


export const downloadNote = async (
	note: { title: string; data: { pages?: NotePage[]; content: NoteContent; files?: any[] } },
	format: string,
	pageId: string | null = null
) => {
	const pages = (
		note.data.pages ?? [
			{
				id: 'main',
				title: note.title,
				inherit_note_title: true,
				content: note.data.content,
				files: note.data.files
			}
		]
	).map((page) =>
		page.id === 'main' && page.inherit_note_title !== false ? { ...page, title: note.title } : page
	);
	const paths = new Map(tabRows(pages).map(({ page, path }) => [page.id, path]));
	const selected = pageId ? pages.filter((page) => page.id === pageId) : pages;
	if (!selected.length) throw new Error('Page no longer exists');
	const title = pageId && pageId !== 'main' ? `${note.title} - ${selected[0].title}` : note.title;
	const md =
		selected.length === 1
			? selected[0].content.md
			: selected.map((page) => `## ${paths.get(page.id)}\n\n${page.content.md}`).join('\n\n');
	if (format !== 'pdf') {
		fileSaver.saveAs(
			new Blob([md], { type: format === 'md' ? 'text/markdown' : 'text/plain' }),
			`${title}.${format}`
		);
		return;
	}
	const html = selected
		.map((page) => {
			const heading = document.createElement('h2');
			heading.textContent = paths.get(page.id) ?? page.title;
			return `<section data-note-page>${selected.length > 1 ? heading.outerHTML : ''}${page.content.html || marked.parse(page.content.md || '')}</section>`;
		})
		.join('');
	await downloadPdf({
		...note,
		title,
		data: {
			...note.data,
			content: { html, md }
		}
	});
};

export const downloadPdf = async (note) => {
	const [{ default: jsPDF }, { default: html2canvas }] = await Promise.all([
		import('jspdf'),
		import('html2canvas-pro')
	]);

	// Define a fixed virtual screen size
	const virtualWidth = 1024; // Fixed width (adjust as needed)
	const virtualHeight = 1400; // Fixed height (adjust as needed)

	// STEP 1. Get a DOM node to render
	const html = DOMPurify.sanitize(note.data?.content?.html ?? '');
	const isDarkMode = document.documentElement.classList.contains('dark');

	let node;
	if (html instanceof HTMLElement) {
		node = html;
	} else {
		const virtualWidth = 800; // px, fixed width for cloned element

		// Clone and style
		node = document.createElement('div');

		// title node
		const titleNode = document.createElement('div');
		titleNode.textContent = note.title;
		titleNode.style.fontSize = '24px';
		titleNode.style.fontWeight = 'medium';
		titleNode.style.paddingBottom = '20px';
		titleNode.style.color = isDarkMode ? 'white' : 'black';
		node.appendChild(titleNode);

		const contentNode = document.createElement('div');

		contentNode.innerHTML = html;

		for (const img of contentNode.querySelectorAll('img[src^="data://"]')) {
			const fileId = img.getAttribute('src').replace('data://', '');
			const file = (note.data?.files ?? []).find((f) => f.id === fileId);
			if (file) {
				img.setAttribute('src', safeImageUrl(file.url || ''));
			}
		}

		node.appendChild(contentNode);

		node.classList.add('text-black');
		node.classList.add('dark:text-white');
		node.style.width = `${virtualWidth}px`;
		node.style.position = 'absolute';
		node.style.left = '-9999px';
		node.style.height = 'auto';
		node.style.padding = '40px 40px';

		console.log(node);
		document.body.appendChild(node);
	}

	await Promise.all(
		Array.from(node.querySelectorAll('img')).map((img) => img.decode().catch(() => {}))
	);

	// A4 page settings
	const pdf = new jsPDF('p', 'mm', 'a4');
	const pageWidthMM = 210; // A4 width in mm
	const pageHeightMM = 297; // A4 height in mm

	const pagePixelHeight = Math.floor((virtualWidth * pageHeightMM) / pageWidthMM);
	const rootTop = node.getBoundingClientRect().top;
	const contentHeight = Math.ceil(node.getBoundingClientRect().height);
	const pageBoundaries = Array.from(node.querySelectorAll('[data-note-page]'))
		.slice(1)
		.map((element) => Math.floor(element.getBoundingClientRect().top - rootTop));

	const blocks = [];
	const trackedElements = new Set();
	const collectBlocks = (element) => {
		const children = Array.from(element.children);
		const splittable =
			children.length > 0 &&
			(getComputedStyle(element).display === 'contents' ||
				(element.getBoundingClientRect().height > pagePixelHeight / 4 &&
					!Array.from(element.childNodes).some(
						(childNode) => childNode.nodeType === Node.TEXT_NODE && childNode.textContent?.trim()
					) &&
					children.every((child) => !getComputedStyle(child).display.startsWith('inline'))));

		if (element !== node) trackedElements.add(element);

		if (splittable) {
			children.forEach(collectBlocks);
		} else {
			const { top, bottom } = element.getBoundingClientRect();
			blocks.push({ element, top: top - rootTop, bottom: bottom - rootTop });
		}
	};
	collectBlocks(node);

	node.setAttribute('data-pdf-root', '');

	let offsetY = 0;
	let page = 0;

	while (offsetY < contentHeight) {
		const nextBoundary = pageBoundaries.find((top) => top > offsetY) ?? contentHeight;
		const sliceHeight = Math.min(pagePixelHeight, contentHeight - offsetY, nextBoundary - offsetY);
		const sliceBlocks = blocks.filter(
			(block) => block.bottom > offsetY && block.top < offsetY + sliceHeight
		);

		const keptElements = new Set();
		for (const { element } of sliceBlocks) {
			for (let current = element; current && current !== node; current = current.parentElement) {
				keptElements.add(current);
			}
		}

		const anchor = sliceBlocks.find((block) => block.bottom > block.top);
		anchor?.element.setAttribute('data-pdf-anchor', '');

		const canvas = await html2canvas(node, {
			useCORS: true,
			logging: false,
			backgroundColor: isDarkMode ? '#000' : '#fff',
			scale: 2, // Keep at 1x to avoid unexpected enlargements
			width: virtualWidth, // Set fixed virtual screen width
			windowWidth: virtualWidth, // Ensure consistent rendering
			windowHeight: virtualHeight,
			height: sliceHeight,
			y: offsetY,
			ignoreElements: (element) =>
				(element.parentElement === document.body &&
					element !== node &&
					!['STYLE', 'LINK'].includes(element.tagName)) ||
				(trackedElements.has(element) && !keptElements.has(element)),
			onclone: (clonedDocument) => {
				const clonedRoot = clonedDocument.querySelector('[data-pdf-root]');
				const clonedAnchor = clonedDocument.querySelector('[data-pdf-anchor]');
				if (!clonedRoot || !clonedAnchor) return;

				const spacer = clonedDocument.createElement('div');
				clonedRoot.prepend(spacer);

				let spacerHeight = 0;
				for (let pass = 0; pass < 2; pass++) {
					spacerHeight +=
						anchor.top -
						(clonedAnchor.getBoundingClientRect().top - clonedRoot.getBoundingClientRect().top);
					spacer.style.height = `${spacerHeight}px`;
				}
			}
		});

		anchor?.element.removeAttribute('data-pdf-anchor');

		const imgData = canvas.toDataURL('image/jpeg', 0.7);
		const imgHeightMM = (sliceHeight * pageWidthMM) / virtualWidth;

		if (page > 0) pdf.addPage();

		if (isDarkMode) {
			pdf.setFillColor(0, 0, 0);
			pdf.rect(0, 0, pageWidthMM, pageHeightMM, 'F'); // black bg
		}

		pdf.addImage(imgData, 'JPEG', 0, 0, pageWidthMM, imgHeightMM);

		offsetY += sliceHeight;
		page++;
	}

	// Remove hidden node if needed
	if (!(html instanceof HTMLElement)) {
		document.body.removeChild(node);
	}

	pdf.save(`${note.title}.pdf`);
};

export const createNoteHandler = async (
	title: string,
	md?: string,
	html?: string,
	folder?: string | null
) => {
	//  $i18n.t('New Note'),
	const res = await createNewNote(localStorage.token, {
		// YYYY-MM-DD
		title: title,
		data: {
			content: {
				json: null,
				html: html || md || '',
				md: md || ''
			}
		},
		meta: folder ? { folder } : null,
		access_grants: []
	}).catch((error) => {
		toast.error(`${error}`);
		return null;
	});

	if (res) {
		return res;
	}
};

type Tab = Pick<NotePage, 'id' | 'title' | 'parent_id'>;

export function tabRows<T extends Tab>(pages: T[], collapsed = new Set<string>()) {
	const children = new Map<string | null, T[]>();
	for (const page of pages) {
		const parent = page.parent_id ?? null;
		if (!children.has(parent)) children.set(parent, []);
		children.get(parent)!.push(page);
	}
	const rows: {
		page: T;
		depth: number;
		path: string;
		hasChildren: boolean;
		position: number;
		siblings: number;
	}[] = [];
	const stack = (children.get(null) ?? [])
		.map((page, index, roots) => ({
			page,
			depth: 0,
			path: page.title,
			position: index + 1,
			siblings: roots.length
		}))
		.reverse();
	while (stack.length) {
		const row = stack.pop()!;
		const nested = children.get(row.page.id) ?? [];
		rows.push({ ...row, hasChildren: nested.length > 0 });
		if (!collapsed.has(row.page.id)) {
			stack.push(
				...nested
					.map((page, index) => ({
						page,
						depth: row.depth + 1,
						path: `${row.path} / ${page.title}`,
						position: index + 1,
						siblings: nested.length
					}))
					.reverse()
			);
		}
	}
	return rows;
}

export function tabAncestors(pages: Tab[], id: string) {
	const lookup = new Map(pages.map((page) => [page.id, page]));
	const ancestors: string[] = [];
	let parent = lookup.get(id)?.parent_id;
	while (parent && !ancestors.includes(parent)) {
		ancestors.unshift(parent);
		parent = lookup.get(parent)?.parent_id;
	}
	return ancestors;
}

export function tabBranchIds(pages: Tab[], id: string) {
	const children = new Map<string, string[]>();
	for (const page of pages) {
		if (page.parent_id) {
			if (!children.has(page.parent_id)) children.set(page.parent_id, []);
			children.get(page.parent_id)!.push(page.id);
		}
	}
	const ids = new Set<string>();
	const stack = [id];
	while (stack.length) {
		const next = stack.pop()!;
		if (ids.has(next)) continue;
		ids.add(next);
		stack.push(...(children.get(next) ?? []));
	}
	return ids;
}

export function siblingMove(
	pages: Tab[],
	id: string,
	direction: number
): Omit<NotePageOperation, 'revision'> | null {
	const page = pages.find((page) => page.id === id);
	if (!page || page.id === 'main') return null;
	const parent_id = page.parent_id ?? null;
	const siblings = pages.filter(
		(page) => page.id !== 'main' && (page.parent_id ?? null) === parent_id
	);
	const index = siblings.findIndex((page) => page.id === id);
	const next = index + direction;
	if (next < 0 || next >= siblings.length) return null;
	return {
		action: 'move',
		page_id: id,
		parent_id,
		before_id: siblings[direction < 0 ? next : next + 1]?.id ?? null
	};
}

export type PageDropPosition = 'before' | 'inside' | 'after';

export function pageDropMove(
	pages: Tab[],
	id: string,
	targetId: string,
	position: PageDropPosition
): Omit<NotePageOperation, 'revision'> | null {
	const target = pages.find((page) => page.id === targetId);
	if (
		id === 'main' ||
		!pages.some((page) => page.id === id) ||
		!target ||
		tabBranchIds(pages, id).has(targetId) ||
		(targetId === 'main' && position === 'before')
	)
		return null;
	const parent_id = position === 'inside' ? targetId : (target.parent_id ?? null);
	const siblings = pages.filter((page) => (page.parent_id ?? null) === parent_id && page.id !== id);
	return {
		action: 'move',
		page_id: id,
		parent_id,
		before_id:
			position === 'before'
				? targetId
				: position === 'after'
					? (siblings[siblings.findIndex((page) => page.id === targetId) + 1]?.id ?? null)
					: null
	};
}

export function contentFiles(content: NoteContent | undefined) {
	const files = new Map<string, { id: string; type: string; name: string; size: number }>();
	const stack = content?.json ? [content.json] : [];
	while (stack.length) {
		const node = stack.pop();
		if (node?.type === 'fileAttachment' && node.attrs?.id) {
			files.set(node.attrs.id, { ...node.attrs, type: 'file' });
		}
		stack.push(...(node?.content ?? []).slice().reverse());
	}
	return [...files.values()];
}
