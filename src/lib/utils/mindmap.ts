// Fork (recall mind map, 2026-11-15): a PlantUML mind map source -> a plain tree.
// Dependency-free so the Playwright suite can import it directly (tests/outis/e2e/mindmap-parse.spec.ts).
// Handles `*` and `+`/`-` depth markers, the `_` boxless flag, `[#colour]`, `<<tags>>`,
// multi-line `:…;` nodes, `left side`/direction lines (ignored), `<style>` blocks (skipped) and
// basic Creole (`**bold**`, `//italic//`, `""mono""`, `--strike--`, `__under__`).

export type MindNode = { label: string; children: MindNode[] };

const NODE = /^\s*([*+-]+)(?:\[#[^\]]*\])?([_:]?)\s*(.*?)\s*$/;

function clean(text: string): string {
	return text
		.replace(/<<[^>]*>>/g, '')
		.replace(/\*\*(.+?)\*\*/g, '$1')
		.replace(/\/\/(.+?)\/\//g, '$1')
		.replace(/""(.+?)""/g, '$1')
		.replace(/--(.+?)--/g, '$1')
		.replace(/__(.+?)__/g, '$1')
		.replace(/\s+/g, ' ')
		.trim();
}

export function parseMindmap(source: string): MindNode | null {
	const lines = source.split(/\r?\n/);
	let inMap = false;
	let inStyle = false;
	let root: MindNode | null = null;
	const stack: { depth: number; node: MindNode }[] = [];
	let i = 0;
	while (i < lines.length) {
		const line = lines[i++];
		const low = line.trim().toLowerCase();
		if (low.startsWith('@startmindmap')) {
			inMap = true;
			continue;
		}
		if (low.startsWith('@endmindmap')) break;
		if (low.startsWith('<style')) inStyle = true;
		if (inStyle) {
			if (low.includes('</style')) inStyle = false;
			continue;
		}
		if (!inMap) continue;
		const m = NODE.exec(line);
		if (!m) continue;
		const depth = m[1].length;
		let text = m[3];
		if (m[2] === ':') {
			// Multi-line node: collect until the line ending with `;`.
			const parts = [text];
			while (!parts[parts.length - 1].endsWith(';') && i < lines.length) parts.push(lines[i++].trim());
			text = parts.join(' ').replace(/;$/, '');
		}
		const label = clean(text);
		if (!label) continue;
		const node: MindNode = { label, children: [] };
		if (!root || depth === 1) {
			if (!root) {
				root = node;
				stack.length = 0;
				stack.push({ depth: 1, node });
			}
			continue;
		}
		while (stack.length > 1 && stack[stack.length - 1].depth >= depth) stack.pop();
		stack[stack.length - 1].node.children.push(node);
		stack.push({ depth, node });
	}
	return root;
}

export function leaves(node: MindNode): MindNode[] {
	const out: MindNode[] = [];
	const walk = (n: MindNode, isRoot: boolean) => {
		if (!isRoot && n.children.length === 0) out.push(n);
		n.children.forEach((c) => walk(c, false));
	};
	walk(node, true);
	return out;
}

export function pathTo(root: MindNode, target: MindNode): string[] {
	const walk = (n: MindNode, trail: string[]): string[] | null => {
		if (n === target) return trail;
		for (const c of n.children) {
			const found = walk(c, [...trail, n.label]);
			if (found) return found;
		}
		return null;
	};
	return walk(root, []) ?? [];
}
