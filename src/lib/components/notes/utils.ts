import DOMPurify from 'dompurify';
import { toast } from 'svelte-sonner';
import katex from 'katex';
import 'katex/dist/katex.min.css';

import { createNewNote } from '$lib/apis/notes';
import { safeImageUrl } from '$lib/utils/safeImageUrl';
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
