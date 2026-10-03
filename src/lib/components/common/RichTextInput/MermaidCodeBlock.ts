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

// A code block that also draws a ```mermaid / ```plantuml / ```dot block as a diagram underneath the
// (still editable) code.
export const MermaidCodeBlock = CodeBlockLowlight.extend({
	addNodeView() {
		return ({ node }) => {
			const dom = document.createElement('div');
			const pre = document.createElement('pre');
			const code = document.createElement('code');
			const preview = document.createElement('div');
			pre.appendChild(code);
			dom.append(pre, preview);
			preview.contentEditable = 'false';
			preview.className = 'mermaid-diagram flex justify-center py-2';

			let current = node;
			let timer: ReturnType<typeof setTimeout> | undefined;
			let rendered = '';

			const render = async () => {
				const text = current.textContent;
				const lang = current.attrs.language;
				const kroki = KROKI.has(lang) || isMermaidMindmap(lang, text);
				if ((lang !== 'mermaid' && !kroki) || !text.trim()) {
					rendered = '';
					preview.innerHTML = '';
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

			return {
				dom,
				contentDOM: code,
				update: (updated) => {
					if (updated.type !== current.type) return false;
					current = updated;
					sync();
					return true;
				},
				// Writing the SVG into the preview must not make ProseMirror re-read the node.
				ignoreMutation: (mutation) =>
					mutation.type !== 'selection' && !code.contains(mutation.target),
				destroy: () => clearTimeout(timer)
			};
		};
	}
});
