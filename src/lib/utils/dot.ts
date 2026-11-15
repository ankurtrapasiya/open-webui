// Fork (live graph, 2026-11-15): a small Graphviz DOT parser, dependency-free so the Playwright
// suite imports it directly. Covers what study charts use: graph/digraph, quoted and bare ids,
// edge chains and {group} endpoints, node/edge/graph attribute statements, nested clusters,
// comments, labels with \n \l \r. Anything the live view cannot draw well is reported in
// `unsupported` and the viewer then offers no Graph button.

export type DotNode = { id: string; label: string; cluster?: string };
export type DotEdge = { from: string; to: string; label?: string };
export type DotCluster = { id: string; label: string; nodes: string[]; parent?: string };
export type DotGraph = {
	directed: boolean;
	rankdir: 'TB' | 'LR' | 'BT' | 'RL';
	nodes: DotNode[];
	edges: DotEdge[];
	clusters: DotCluster[];
	unsupported?: 'record' | 'html-label' | 'ports' | 'too-many-nodes' | 'no-edges';
};

type Tok = { t: 'id' | 'str' | 'html' | 'p'; v: string };

function tokenize(src: string): Tok[] {
	const out: Tok[] = [];
	let i = 0;
	const n = src.length;
	while (i < n) {
		const c = src[i];
		if (/\s/.test(c)) {
			i++;
			continue;
		}
		if (c === '/' && src[i + 1] === '/') {
			while (i < n && src[i] !== '\n') i++;
			continue;
		}
		if (c === '#') {
			// `#` comments run to the end of the line (outside strings; colours are quoted in DOT).
			while (i < n && src[i] !== '\n') i++;
			continue;
		}
		if (c === '/' && src[i + 1] === '*') {
			const e = src.indexOf('*/', i + 2);
			i = e === -1 ? n : e + 2;
			continue;
		}
		if (c === '"') {
			let j = i + 1;
			let s = '';
			while (j < n && src[j] !== '"') {
				if (src[j] === '\\' && j + 1 < n) {
					const d = src[j + 1];
					if (d === '"') s += '"';
					else if (d === 'n' || d === 'l' || d === 'r') s += '\n';
					else if (d === '\\') s += '\\';
					else s += '\\' + d;
					j += 2;
				} else s += src[j++];
			}
			out.push({ t: 'str', v: s });
			i = j + 1;
			continue;
		}
		if (c === '<') {
			let depth = 0;
			let j = i;
			do {
				if (src[j] === '<') depth++;
				else if (src[j] === '>') depth--;
				j++;
			} while (j < n && depth > 0);
			out.push({ t: 'html', v: src.slice(i, j) });
			i = j;
			continue;
		}
		if (c === '-' && (src[i + 1] === '>' || src[i + 1] === '-')) {
			out.push({ t: 'p', v: src.slice(i, i + 2) });
			i += 2;
			continue;
		}
		if ('{}[];,=:'.includes(c)) {
			out.push({ t: 'p', v: c });
			i++;
			continue;
		}
		let j = i;
		while (j < n && !/[\s{}\[\];,=:"<]/.test(src[j]) && !(src[j] === '-' && (src[j + 1] === '>' || src[j + 1] === '-'))) j++;
		if (j === i) {
			i++;
			continue;
		}
		out.push({ t: 'id', v: src.slice(i, j) });
		i = j;
	}
	return out;
}

const KEYWORDS = new Set(['node', 'edge', 'graph', 'subgraph', 'strict', 'digraph']);

export function parseDot(source: string): DotGraph | null {
	const toks = tokenize(source);
	let p = 0;
	const peek = (k = 0) => toks[p + k];
	const next = () => toks[p++];
	const isP = (v: string, k = 0) => peek(k)?.t === 'p' && peek(k).v === v;

	// Header: [strict] (graph|digraph) [id] {
	if (peek()?.t === 'id' && peek().v.toLowerCase() === 'strict') next();
	const head = peek();
	if (!head || head.t !== 'id' || !/^(di)?graph$/i.test(head.v)) return null;
	next();
	const directed = /^digraph$/i.test(head.v);
	if (peek() && !isP('{')) next(); // graph name
	if (!isP('{')) return null;

	const g: DotGraph = { directed, rankdir: 'TB', nodes: [], edges: [], clusters: [] };
	const byId = new Map<string, DotNode>();
	const flag = (u: DotGraph['unsupported']) => {
		if (!g.unsupported) g.unsupported = u;
	};
	const ensure = (id: string, cluster: string | undefined, label?: string) => {
		let nd = byId.get(id);
		if (!nd) {
			nd = { id, label: label ?? id };
			if (cluster) nd.cluster = cluster;
			byId.set(id, nd);
			g.nodes.push(nd);
		} else if (label !== undefined) nd.label = label;
		if (cluster && !nd.cluster) nd.cluster = cluster;
		return nd;
	};

	// Attribute list: [k=v, k=v]* ; returns a map (string values only).
	const attrs = (): Record<string, string> => {
		const a: Record<string, string> = {};
		while (isP('[')) {
			next();
			while (p < toks.length && !isP(']')) {
				const k = next();
				if (isP('=')) {
					next();
					const v = next();
					if (v) {
						if (v.t === 'html') {
							if (k.v === 'label') flag('html-label');
							a[k.v] = v.v;
						} else a[k.v] = v.v;
					}
				}
				if (isP(',') || isP(';')) next();
			}
			if (isP(']')) next();
		}
		return a;
	};

	// Statement list inside braces; `cluster` is the innermost cluster id.
	// Returns the endpoints when the block is used as an edge endpoint group.
	const block = (cluster: string | undefined): string[] => {
		const endpoints: string[] = [];
		if (!isP('{')) return endpoints;
		next();
		while (p < toks.length && !isP('}')) {
			const ends = statement(cluster);
			endpoints.push(...ends);
			if (isP(';') || isP(',')) next();
		}
		if (isP('}')) next();
		return endpoints;
	};

	// `left (-> right)+ [attrs]`: every left endpoint joins every right endpoint; a right side
	// may be a {group}. The attribute list at the end applies to every edge of the chain.
	const edgeChain = (start: string[], cluster: string | undefined): string[] => {
		let left = start;
		const chainEdges: DotEdge[] = [];
		while (isP('->') || isP('--')) {
			next();
			let right: string[];
			if (isP('{')) right = block(cluster);
			else {
				const r = next();
				right = [r.v];
				if (isP(':')) {
					flag('ports');
					next();
					if (peek() && !isP('->') && !isP('--') && !isP('[') && !isP(';')) next();
				}
				ensure(r.v, cluster);
			}
			for (const a of left) for (const b of right) chainEdges.push({ from: a, to: b });
			left = right;
		}
		const edgeAttrs = attrs();
		for (const e of chainEdges) {
			if (edgeAttrs.label) e.label = edgeAttrs.label;
			g.edges.push(e);
		}
		return start;
	};

	const statement = (cluster: string | undefined): string[] => {
		const t = peek();
		if (!t) return [];
		if (isP('{')) {
			const ends = block(cluster);
			return isP('->') || isP('--') ? edgeChain(ends, cluster) : ends;
		}
		if (t.t === 'id' && t.v.toLowerCase() === 'subgraph') {
			next();
			let id = '';
			if (peek() && !isP('{')) id = next().v;
			const isCluster = /^cluster/i.test(id);
			let c: DotCluster | undefined;
			if (isCluster) {
				c = { id, label: id, nodes: [] };
				if (cluster) c.parent = cluster;
				g.clusters.push(c);
			}
			const before = g.nodes.length;
			const ends = block(isCluster ? id : cluster);
			if (c) c.nodes = g.nodes.slice(before).filter((n) => n.cluster === id).map((n) => n.id);
			return ends;
		}
		if (t.t === 'id' && (t.v === 'node' || t.v === 'edge' || t.v === 'graph')) {
			next();
			const a = attrs();
			if (t.v === 'graph' && a.rankdir) g.rankdir = norm(a.rankdir);
			if (t.v === 'node' && /record/i.test(a.shape ?? '')) flag('record');
			if (t.v === 'graph' && a.label !== undefined && cluster) {
				const c = g.clusters.find((x) => x.id === cluster);
				if (c) c.label = a.label;
			}
			return [];
		}
		// id = value  (graph attribute like rankdir=LR, or label="…" inside a cluster)
		if ((t.t === 'id' || t.t === 'str') && isP('=', 1)) {
			next();
			next();
			const v = next();
			if (t.v === 'rankdir' && v) g.rankdir = norm(v.v);
			if (t.v === 'label' && v && cluster) {
				const c = g.clusters.find((x) => x.id === cluster);
				if (c) c.label = v.v;
			}
			return [];
		}
		// node or edge statement
		if (t.t !== 'id' && t.t !== 'str') {
			next();
			return [];
		}
		const first = next().v;
		ensure(first, cluster); // before any right-hand side, so node order follows first appearance
		if (isP(':')) {
			flag('ports');
			next();
			if (peek() && !isP('->') && !isP('--') && !isP('[') && !isP(';')) next();
		}
		if (isP('->') || isP('--')) return edgeChain([first], cluster);
		const a = attrs();
		if (/record/i.test(a.shape ?? '')) flag('record');
		ensure(first, cluster, a.label !== undefined ? a.label : undefined);
		return [first];
	};

	block(undefined);
	for (const e of g.edges) {
		ensure(e.from, undefined);
		ensure(e.to, undefined);
	}
	if (g.nodes.length > 60) flag('too-many-nodes');
	if (!g.directed && g.edges.length === 0) flag('no-edges');
	return g;
}

function norm(v: string): DotGraph['rankdir'] {
	const u = v.toUpperCase();
	return u === 'LR' || u === 'BT' || u === 'RL' ? u : 'TB';
}
