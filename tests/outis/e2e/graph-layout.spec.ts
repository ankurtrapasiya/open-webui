import { test, expect } from '@playwright/test';
import { parseDot } from '../../../src/lib/utils/dot';
import { layoutGraph, hueOf } from '../../../src/lib/utils/graph-layout';

const M = () => ({ w: 120, h: 36 });
const lay = (src: string, extra: any = {}) => layoutGraph(parseDot(src)!, { maxWidth: 800, measure: M, ...extra });
const overlap = (a: any, b: any) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

test('GL-1 a chain gets one rank per node, rows stacked with the gap, edges bottom-centre to top-centre', () => {
	const L = lay('digraph { a -> b -> c }');
	expect([L.pos.get('a')!.rank, L.pos.get('b')!.rank, L.pos.get('c')!.rank]).toEqual([0, 1, 2]);
	expect(L.horizontal).toBe(false);
	expect(Math.round(L.height)).toBe(3 * 36 + 2 * 40);
	const a = L.pos.get('a')!, b = L.pos.get('b')!;
	const e = L.edges.find((e) => e.from === 'a' && e.to === 'b')!;
	expect(e.points[0]).toEqual([a.x + a.w / 2, a.y + a.h]);
	expect(e.points[e.points.length - 1]).toEqual([b.x + b.w / 2, b.y]);
});

test('GL-2 a random DAG has no overlapping chips and every edge goes down a rank', () => {
	let seed = 7;
	const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
	const edges: string[] = [];
	for (let k = 0; k < 20; k++) {
		const i = Math.floor(rnd() * 11), j = i + 1 + Math.floor(rnd() * (11 - i));
		edges.push(`n${i} -> n${j}`);
	}
	const L = lay(`digraph { ${edges.join('; ')} }`);
	const rects = [...L.pos.values()];
	for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) expect(overlap(rects[i], rects[j]), `${i} vs ${j}`).toBe(false);
	for (const e of L.edges) expect(L.pos.get(e.to)!.rank).toBeGreaterThan(L.pos.get(e.from)!.rank);
});

test('GL-3 folding hides only what is reachable solely through the folded node', () => {
	const D = 'digraph { a -> b; a -> c; b -> d; c -> d }';
	const foldB = lay(D, { folded: new Set(['b']) });
	expect([...foldB.hidden]).toEqual([]);
	expect(foldB.badges.get('b') ?? 0).toBe(0);
	const foldA = lay(D, { folded: new Set(['a']) });
	expect([...foldA.hidden].sort()).toEqual(['b', 'c', 'd']);
	expect(foldA.badges.get('a')).toBe(3);
	expect(foldA.pos.has('b')).toBe(false);
});

test('GL-4 a cycle lays out and keeps both edges', () => {
	const L = lay('digraph { a -> b; b -> a }');
	expect(L.edges.length).toBe(2);
	expect(L.pos.size).toBe(2);
});

test('GL-5 small LR graphs are horizontal; hues follow the root branches', () => {
	const lr5 = lay('digraph { rankdir=LR; a -> b -> c; a -> d; d -> e }');
	expect(lr5.horizontal).toBe(true);
	expect(lr5.pos.get('b')!.x).toBeGreaterThan(lr5.pos.get('a')!.x);
	const lr9 = lay('digraph { rankdir=LR; ' + Array.from({ length: 8 }, (_, i) => `n${i} -> n${i + 1}`).join('; ') + ' }');
	expect(lr9.horizontal).toBe(false);
	const h = hueOf(parseDot('digraph { root -> x; root -> y; x -> x1; y -> y1 }')!);
	expect([h.get('root'), h.get('x'), h.get('x1'), h.get('y'), h.get('y1')]).toEqual([0, 1, 1, 2, 2]);
	const two = hueOf(parseDot('digraph { s1 -> a; s2 -> b }')!);
	expect([...two.values()].every((v) => v >= 1)).toBe(true);
});
