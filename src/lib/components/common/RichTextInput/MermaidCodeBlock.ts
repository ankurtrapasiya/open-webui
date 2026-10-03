import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';

import DOMPurify from 'dompurify';

import { initMermaid, renderMermaidDiagram } from '$lib/utils';
import { renderDiagram } from '$lib/apis/utils';

let mermaid: any = null;

// Fences the server draws with the chat's Kroki filter. A mermaid mindmap goes there too: mind maps
// are always the PlantUML mindmap skill's drawing, never Mermaid's (the filter converts it).
const KROKI = new Set(['plantuml', 'puml', 'dot', 'graphviz']);
const isMermaidMindmap = (lang: string, text: string) =>
	lang === 'mermaid' && /^\s*mindmap\b/.test(text);
const isKroki = (lang: string, text: string) => KROKI.has(lang) || isMermaidMindmap(lang, text);

// A code block that also draws a ```mermaid / ```plantuml / ```dot block as a diagram underneath the
// (still editable) code. A Kroki drawing folds its code away behind a "Diagram source" toggle, as
// the chat does; a block created empty starts unfolded so its first lines are not hidden mid-typing.
export const MermaidCodeBlock = CodeBlockLowlight.extend({
	addNodeView() {
		return ({ node }) => {
			const dom = document.createElement('div');
			const pre = document.createElement('pre');
			const code = document.createElement('code');
			const preview = document.createElement('div');
			const toggle = document.createElement('button');
			pre.appendChild(code);
			dom.append(pre, preview, toggle);
			preview.contentEditable = 'false';
			preview.className = 'mermaid-diagram flex justify-center py-2';
			toggle.type = 'button';
			toggle.contentEditable = 'false';
			toggle.className =
				'diagram-source-toggle text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300';

			let current = node;
			let timer: ReturnType<typeof setTimeout> | undefined;
			let rendered = '';
			let open = !node.textContent.trim();

			const fold = () => {
				const drawn =
					isKroki(current.attrs.language, current.textContent) && preview.innerHTML !== '';
				pre.style.display = drawn && !open ? 'none' : '';
				toggle.style.display = drawn ? '' : 'none';
				toggle.textContent = `${open ? '▾' : '▸'} Diagram source`;
			};
			toggle.addEventListener('click', () => {
				open = !open;
				fold();
			});

			const render = async () => {
				const text = current.textContent;
				const lang = current.attrs.language;
				const kroki = isKroki(lang, text);
				if ((lang !== 'mermaid' && !kroki) || !text.trim()) {
					rendered = '';
					preview.innerHTML = '';
					fold();
					return;
				}
				if (text === rendered) return;
				rendered = text;
				try {
					let svg: string;
					if (kroki) {
						svg = DOMPurify.sanitize(await renderDiagram(localStorage.token, lang, text));
					} else {
						mermaid ??= await initMermaid();
						svg = await renderMermaidDiagram(mermaid, text);
					}
					// Typing may have moved on while mermaid was busy; keep only the latest result.
					if (rendered === text) preview.innerHTML = svg;
					fold();
				} catch {
					// Half-typed diagrams fail to parse; keep the last good drawing until it parses again.
				}
			};

			const sync = () => {
				const lang = current.attrs.language;
				code.className = lang ? `${this.options.languageClassPrefix}${lang}` : '';
				clearTimeout(timer);
				timer = setTimeout(render, 300);
			};
			sync();
			fold();

			return {
				dom,
				contentDOM: code,
				update: (updated) => {
					if (updated.type !== current.type) return false;
					current = updated;
					sync();
					return true;
				},
				// The toggle is a plain button; ProseMirror must not turn its click into a selection.
				stopEvent: (event) => toggle.contains(event.target as Node),
				// Writing the SVG into the preview must not make ProseMirror re-read the node.
				ignoreMutation: (mutation) =>
					mutation.type !== 'selection' && !code.contains(mutation.target),
				destroy: () => clearTimeout(timer)
			};
		};
	}
});
