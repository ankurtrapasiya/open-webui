// Marked instance for the TipTap rich-text editor (notes, prompt input).
//
// The chat view registers a KaTeX extension on the *global* `marked` whose renderer
// emits the bare LaTeX (rendering is done by a Svelte component). Anything else that
// calls `marked.parse` afterwards therefore loses the `$` delimiters and gets plain
// text. The editor uses this separate instance so it is immune to that, and turns
// `$..$` / `$$..$$` into the HTML that @tiptap/extension-mathematics parses.
import { Marked, type MarkedExtension } from 'marked';

const escapeAttr = (s: string) =>
	s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function tiptapMathExtension(): MarkedExtension {
	return {
		extensions: [
			{
				name: 'blockMath',
				level: 'block',
				start: (src) => src.indexOf('$$'),
				tokenizer(src) {
					const m = /^\$\$\s*\n?([\s\S]+?)\n?\s*\$\$(?:\n+|$)/.exec(src);
					if (m) return { type: 'blockMath', raw: m[0], latex: m[1].trim() };
				},
				renderer: (t) => `<div data-type="block-math" data-latex="${escapeAttr(t.latex)}"></div>\n`
			},
			{
				name: 'inlineMath',
				level: 'inline',
				start: (src) => src.indexOf('$'),
				tokenizer(src) {
					// $...$ on one line, no empty body, closing $ not followed by a digit (prices).
					const m = /^\$(?!\$)((?:\\.|[^\\\n$])+?)\$(?!\d)/.exec(src);
					if (m) return { type: 'inlineMath', raw: m[0], latex: m[1] };
				},
				renderer: (t) => `<span data-type="inline-math" data-latex="${escapeAttr(t.latex)}"></span>`
			}
		]
	};
}

// Shared with the global `marked.use(...)` in RichTextInput so both render lists the same way.
export const editorMarkedOptions: MarkedExtension = {
	breaks: true,
	gfm: true,
	renderer: {
		list(body, ordered, start) {
			if (body.includes('data-checked=')) return `<ul data-type="taskList">${body}</ul>`;
			const type = ordered ? 'ol' : 'ul';
			const startatt = ordered && start !== 1 ? ` start="${start}"` : '';
			return `<${type}${startatt}>${body}</${type}>`;
		},
		listitem(text, task, checked) {
			if (task) return `<li data-type="taskItem" data-checked="${checked ? 'true' : 'false'}">${text}</li>`;
			return `<li>${text}</li>`;
		}
	}
};

export const editorMarked = new Marked(editorMarkedOptions, tiptapMathExtension());
