import { test, expect } from '@playwright/test';
import { parseDot } from '../../../src/lib/utils/dot';

const ids = (g: any) => g.nodes.map((n: any) => n.id);
const edges = (g: any) => g.edges.map((e: any) => `${e.from}>${e.to}${e.label ? ':' + e.label : ''}`);

test('DP-1 attributes, labels with \\n and a chain with a shared label', () => {
	const g = parseDot('digraph G { rankdir=LR; a [label="Alpha\\nOne"]; a -> b -> c [label="w"]; }')!;
	expect(g.directed).toBe(true);
	expect(g.rankdir).toBe('LR');
	expect(ids(g)).toEqual(['a', 'b', 'c']);
	expect(g.nodes[0].label).toBe('Alpha\nOne');
	expect(g.nodes[1].label).toBe('b');
	expect(edges(g)).toEqual(['a>b:w', 'b>c:w']);
});

test('DP-2 implicit nodes and {group} -> target', () => {
	const g = parseDot('digraph { a -> b; {b c} -> d; }')!;
	expect(ids(g)).toEqual(['a', 'b', 'c', 'd']);
	expect(edges(g)).toEqual(['a>b', 'b>d', 'c>d']);
});

test('DP-3 nested clusters', () => {
	const g = parseDot('digraph { subgraph cluster_x { label="X"; x1; x2; subgraph cluster_y { label="Y"; y1; } } x1 -> y1; }')!;
	expect(g.clusters.map((c: any) => [c.id, c.label, c.nodes, c.parent])).toEqual([
		['cluster_x', 'X', ['x1', 'x2', 'y1'], undefined], // outer clusters include inner members (review I2)
		['cluster_y', 'Y', ['y1'], 'cluster_x']
	]);
	expect(g.nodes.find((n: any) => n.id === 'y1')!.cluster).toBe('cluster_y');
});

test('DP-4 comments and attribute statements are not nodes; quoted ids', () => {
	const g = parseDot('// c\ndigraph { /* block */ node [shape=box]; edge [color=red]; graph [rankdir=TB]; # hash\n "quoted id" -> b; }')!;
	expect(ids(g)).toEqual(['quoted id', 'b']);
	expect(g.rankdir).toBe('TB');
});

test('DP-5 unsupported shapes are flagged', () => {
	expect(parseDot('digraph { a [shape=record, label="{x|y}"]; a -> b; }')!.unsupported).toBe('record');
	expect(parseDot('digraph { a [label=<<b>x</b>>]; a -> b; }')!.unsupported).toBe('html-label');
	expect(parseDot('digraph { a:p -> b; }')!.unsupported).toBe('ports');
	const many = 'digraph { ' + Array.from({ length: 61 }, (_, i) => `n${i};`).join(' ') + ' n0 -> n1; }';
	expect(parseDot(many)!.unsupported).toBe('too-many-nodes');
	expect(parseDot('graph { a; }')!.unsupported).toBe('no-edges');
});

test('DP-6 null for no graph; undirected edges', () => {
	expect(parseDot('not a graph')).toBeNull();
	const g = parseDot('graph { a -- b }')!;
	expect(g.directed).toBe(false);
	expect(edges(g)).toEqual(['a>b']);
	expect(g.unsupported).toBeUndefined();
});

test('DP-7 cluster membership counts nodes first seen outside the block, and nested members belong to the outer cluster too', () => {
	const g = parseDot('digraph { a -> b; subgraph cluster_1 { b; c; subgraph cluster_2 { d; } } }')!;
	const c1 = g.clusters.find((c) => c.id === 'cluster_1')!;
	const c2 = g.clusters.find((c) => c.id === 'cluster_2')!;
	expect(c1.nodes.sort()).toEqual(['b', 'c', 'd']);
	expect(c2.nodes).toEqual(['d']);
	expect(g.nodes.find((n) => n.id === 'b')!.cluster).toBe('cluster_1');
	expect(g.nodes.find((n) => n.id === 'd')!.cluster).toBe('cluster_2');
});

test('DP-8 rank=same groups are captured', () => {
	const g = parseDot('digraph { a -> b; a -> c; c -> d; { rank=same; b; d } }')!;
	expect(g.sameRank).toEqual([['b', 'd']]);
	expect(parseDot('digraph { a -> b }')!.sameRank).toEqual([]);
});
