// Fork (live graph, 2026-11-15): a small layered ("Sugiyama-lite") layout for the DOT graphs the
// chat renders live. Dependency-free. Good for study charts (tens of nodes); dense graphs fall back
// to the Kroki picture before they get here (dot.ts flags > 60 nodes).
import type { DotGraph } from './dot';

export type Rect = { x: number; y: number; w: number; h: number; rank: number };
export type LaidEdge = { from: string; to: string; label?: string; points: [number, number][]; loop?: boolean; bulge?: number };
export type Layout = {
	width: number;
	height: number;
	horizontal: boolean;
	pos: Map<string, Rect>;
	edges: LaidEdge[];
	hidden: Set<string>;
	badges: Map<string, number>;
};
export type LayoutOpts = {
	maxWidth: number;
	measure: (id: string) => { w: number; h: number };
	folded?: Set<string>;
	gapX?: number;
	gapY?: number;
	vertical?: boolean; // force rows even for a small LR graph (when columns would not fit)
};

const uniq = <T>(xs: T[]) => [...new Set(xs)];

// Adjacency with cycles broken: a DFS marks back edges, which are reversed for ranking only.
function dag(graph: DotGraph, ids: string[]) {
	const out = new Map<string, string[]>(ids.map((i) => [i, []]));
	for (const e of graph.edges) if (out.has(e.from) && out.has(e.to) && e.from !== e.to) out.get(e.from)!.push(e.to);
	const state = new Map<string, number>(); // 0 new, 1 open, 2 done
	const fwd = new Map<string, string[]>(ids.map((i) => [i, []]));
	const visit = (u: string) => {
		state.set(u, 1);
		for (const v of out.get(u)!) {
			const s = state.get(v) ?? 0;
			if (s === 1) fwd.get(v)!.push(u); // back edge: reverse
			else {
				fwd.get(u)!.push(v);
				if (s === 0) visit(v);
			}
		}
		state.set(u, 2);
	};
	for (const i of ids) if (!state.get(i)) visit(i);
	return fwd;
}

function ranksOf(ids: string[], fwd: Map<string, string[]>, same: string[][] = []): Map<string, number> {
	const indeg = new Map(ids.map((i) => [i, 0]));
	for (const [, vs] of fwd) for (const v of vs) indeg.set(v, indeg.get(v)! + 1);
	const rank = new Map(ids.map((i) => [i, 0]));
	const queue = ids.filter((i) => indeg.get(i) === 0);
	while (queue.length) {
		const u = queue.shift()!;
		for (const v of fwd.get(u)!) {
			rank.set(v, Math.max(rank.get(v)!, rank.get(u)! + 1));
			indeg.set(v, indeg.get(v)! - 1);
			if (indeg.get(v) === 0) queue.push(v);
		}
	}
	// rank=same: members take the group's largest rank, then anything below them moves down.
	const groups = same.map((g) => g.filter((i) => rank.has(i))).filter((g) => g.length > 1);
	for (let pass = 0; pass < 8 && groups.length; pass++) {
		let changed = false;
		for (const g of groups) {
			const r = Math.max(...g.map((i) => rank.get(i)!));
			for (const i of g) if (rank.get(i) !== r) { rank.set(i, r); changed = true; }
		}
		for (const [u, vs] of fwd) for (const v of vs) if (rank.get(v)! <= rank.get(u)!) { rank.set(v, rank.get(u)! + 1); changed = true; }
		if (!changed) break;
	}
	return rank;
}

/** Nodes reachable only through a folded node (the folded node itself stays visible). */
export function hiddenBy(graph: DotGraph, folded: Set<string>): { hidden: Set<string>; badges: Map<string, number> } {
	const ids = graph.nodes.map((n) => n.id);
	const fwd = dag(graph, ids);
	const roots = ids.filter((i) => ![...fwd.values()].some((vs) => vs.includes(i)));
	// Reachable from the roots without passing *through* a folded node.
	const seen = new Set<string>();
	const stack = [...(roots.length ? roots : ids.slice(0, 1))];
	while (stack.length) {
		const u = stack.pop()!;
		if (seen.has(u)) continue;
		seen.add(u);
		if (folded.has(u)) continue;
		stack.push(...fwd.get(u)!);
	}
	const hidden = new Set(ids.filter((i) => !seen.has(i)));
	const badges = new Map<string, number>();
	for (const f of folded) {
		if (!fwd.has(f)) continue; // folded earlier, since removed from the graph (e.g. its cluster folded)
		// Count hidden nodes reachable from f.
		const s = new Set<string>();
		const st = [...fwd.get(f)!];
		while (st.length) {
			const u = st.pop()!;
			if (s.has(u) || !hidden.has(u)) continue;
			s.add(u);
			st.push(...fwd.get(u)!);
		}
		badges.set(f, s.size);
	}
	return { hidden, badges };
}

/** Branch index per node (spec decision 2): 0 = root tokens, 1..8 = the root child's branch. */
export function hueOf(graph: DotGraph): Map<string, number> {
	const ids = graph.nodes.map((n) => n.id);
	const fwd = dag(graph, ids);
	const indeg = new Map(ids.map((i) => [i, 0]));
	for (const [, vs] of fwd) for (const v of vs) indeg.set(v, indeg.get(v)! + 1);
	const roots = ids.filter((i) => indeg.get(i) === 0);
	const hue = new Map<string, number>();
	// Clusters take the first hues; branches outside them continue after (review: no reuse).
	let next = graph.clusters.length + 1;
	const paint = (start: string, h: number) => {
		const q = [start];
		while (q.length) {
			const u = q.shift()!;
			if (hue.has(u)) continue;
			hue.set(u, h);
			q.push(...fwd.get(u)!);
		}
	};
	if (graph.clusters.length) {
		graph.clusters.forEach((c, i) => c.nodes.forEach((n) => hue.set(n, (i % 8) + 1)));
	}
	if (roots.length === 1 && !graph.clusters.length) {
		const r = roots[0];
		hue.set(r, 0);
		for (const child of fwd.get(r)!) {
			if (hue.has(child)) continue;
			paint(child, ((next++ - 1) % 8) + 1);
		}
	} else {
		for (const r of roots) if (!hue.has(r)) paint(r, ((next++ - 1) % 8) + 1);
	}
	for (const i of ids) if (!hue.has(i)) hue.set(i, 1);
	return hue;
}

export function layoutGraph(graph: DotGraph, opts: LayoutOpts): Layout {
	const gapX = opts.gapX ?? 24;
	const gapY = opts.gapY ?? 40;
	const folded = opts.folded ?? new Set<string>();
	const { hidden, badges } = hiddenBy(graph, folded);
	const ids = graph.nodes.map((n) => n.id).filter((i) => !hidden.has(i));
	const horizontal = !opts.vertical && (graph.rankdir === 'LR' || graph.rankdir === 'RL') && graph.nodes.length <= 8;
	const fwd = dag({ ...graph, edges: graph.edges.filter((e) => !hidden.has(e.from) && !hidden.has(e.to)) }, ids);
	const rank = ranksOf(ids, fwd, graph.sameRank ?? []);
	const maxRank = Math.max(0, ...rank.values());
	const rows: string[][] = Array.from({ length: maxRank + 1 }, () => []);
	for (const i of ids) rows[rank.get(i)!].push(i);

	// Order within rows: barycenter of neighbours, 4 sweeps down and up.
	const back = new Map<string, string[]>(ids.map((i) => [i, []]));
	for (const [u, vs] of fwd) for (const v of vs) back.get(v)!.push(u);
	const index = new Map<string, number>();
	const reindex = () => rows.forEach((r) => r.forEach((id, k) => index.set(id, k)));
	reindex();
	const bary = (id: string, nbrs: string[]) => {
		const ks = nbrs.filter((n) => index.has(n)).map((n) => index.get(n)!);
		return ks.length ? ks.reduce((a, b) => a + b, 0) / ks.length : index.get(id)!;
	};
	// Members of one cluster stay together within a row (review I3): sort by cluster first.
	const clusterIdx = new Map<string, number>();
	graph.clusters.forEach((c, i) => c.nodes.forEach((n) => { if (!clusterIdx.has(n)) clusterIdx.set(n, i); }));
	const ci = (id: string) => clusterIdx.get(id) ?? -1;
	for (let sweep = 0; sweep < 4; sweep++) {
		const down = sweep % 2 === 0;
		const order = down ? rows.keys() : [...rows.keys()].reverse();
		for (const r of order) {
			const nb = down ? back : fwd;
			rows[r].sort((a, b) => ci(a) - ci(b) || bary(a, nb.get(a)!) - bary(b, nb.get(b)!) || index.get(a)! - index.get(b)!);
			reindex();
		}
	}

	// Measure, then place. In TB, ranks are rows (y); in LR, ranks are columns (x).
	const size = new Map(ids.map((i) => [i, opts.measure(i)]));
	const pos = new Map<string, Rect>();
	const main = horizontal ? 'h' : 'w'; // extent along the row (perpendicular to rank direction)
	const rowExtent = rows.map((r) => r.reduce((s, id) => s + size.get(id)![main], 0) + Math.max(0, r.length - 1) * gapX);
	const total = Math.max(0, ...rowExtent);
	let along = 0; // y in TB, x in LR
	rows.forEach((r, ri) => {
		const thick = Math.max(0, ...r.map((id) => (horizontal ? size.get(id)!.w : size.get(id)!.h)));
		// First pass: pack from the left; second: pull towards neighbours' mean where room allows.
		let cursor = (total - rowExtent[ri]) / 2;
		const starts: number[] = [];
		for (const id of r) {
			starts.push(cursor);
			cursor += size.get(id)![main] + gapX;
		}
		if (ri > 0) {
			const want = r.map((id, k) => {
				const nb = back.get(id)!.filter((n) => pos.has(n));
				if (!nb.length) return starts[k];
				const mean = nb.reduce((s, n) => s + (horizontal ? pos.get(n)!.y + pos.get(n)!.h / 2 : pos.get(n)!.x + pos.get(n)!.w / 2), 0) / nb.length;
				return mean - size.get(id)![main] / 2;
			});
			// Enforce left-to-right order with gaps, keeping within [0, total].
			let prevEnd = -Infinity;
			for (let k = 0; k < r.length; k++) {
				const s = Math.max(want[k], prevEnd + gapX, 0);
				starts[k] = s;
				prevEnd = s + size.get(r[k])![main];
			}
			const over = prevEnd - total;
			if (over > 0) for (let k = 0; k < r.length; k++) starts[k] = Math.max(0, starts[k] - over);
			for (let k = r.length - 2; k >= 0; k--) starts[k] = Math.min(starts[k], starts[k + 1] - gapX - size.get(r[k])![main]);
			if (starts[0] < 0) {
				const shift = -starts[0];
				for (let k = 0; k < r.length; k++) starts[k] += shift;
			}
		}
		r.forEach((id, k) => {
			const { w, h } = size.get(id)!;
			pos.set(id, horizontal ? { x: along, y: starts[k], w, h, rank: ri } : { x: starts[k], y: along, w, h, rank: ri });
		});
		along += thick + gapY;
	});
	let width = horizontal ? along - gapY : Math.max(total, ...[...pos.values()].map((p) => p.x + p.w));
	let height = horizontal ? Math.max(total, ...[...pos.values()].map((p) => p.y + p.h)) : along - gapY;

	const edges: LaidEdge[] = [];
	for (const e of graph.edges) {
		const a = pos.get(e.from), b = pos.get(e.to);
		if (!a || !b) continue;
		const backward = rank.get(e.from)! >= rank.get(e.to)!;
		if (backward) {
			// A back edge (or self-loop) leaves and re-enters from the outer side, bowing out past
			// the chips it spans, so a loop reads as a loop and never hides under a forward edge.
			if (horizontal) {
				const p0: [number, number] = [a.x + a.w / 2, a.y + a.h];
				const p1: [number, number] = [b.x + b.w / 2, b.y + b.h];
				const bulge = Math.max(a.y + a.h, b.y + b.h) + 32;
				edges.push({ from: e.from, to: e.to, label: e.label, points: [p0, p1], loop: true, bulge });
			} else {
				const p0: [number, number] = [a.x + a.w, a.y + a.h / 2];
				const p1: [number, number] = [b.x + b.w, b.y + b.h / 2];
				const bulge = Math.max(a.x + a.w, b.x + b.w) + 32;
				edges.push({ from: e.from, to: e.to, label: e.label, points: [p0, p1], loop: true, bulge });
			}
			continue;
		}
		const p0: [number, number] = horizontal ? [a.x + a.w, a.y + a.h / 2] : [a.x + a.w / 2, a.y + a.h];
		const p1: [number, number] = horizontal ? [b.x, b.y + b.h / 2] : [b.x + b.w / 2, b.y];
		edges.push({ from: e.from, to: e.to, label: e.label, points: [p0, p1] });
	}
	// Room for the loops' bulge on the outer side.
	const loopExtent = Math.max(0, ...edges.filter((e) => e.loop).map((e) => e.bulge! + 8));
	if (horizontal) height = Math.max(height, loopExtent);
	else width = Math.max(width, loopExtent);
	return { width, height, horizontal, pos, edges, hidden, badges };
}
