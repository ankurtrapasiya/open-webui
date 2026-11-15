import { test, expect } from '@playwright/test';
import { parseMindmap, leaves, pathTo } from '../../../src/lib/utils/mindmap';

const wrap = (body: string) => `@startmindmap\n${body}\n@endmindmap`;
const labels = (n: any) => n.children.map((c: any) => c.label);

test('MP-1 * syntax with _ flag, [#colour] and <<tags>> parses to a tree', () => {
	const root = parseMindmap(wrap('* R\n** A <<b1>>\n***_ x <<b1s>>\n***[#red]_ y'))!;
	expect(root.label).toBe('R');
	expect(labels(root)).toEqual(['A']);
	expect(labels(root.children[0])).toEqual(['x', 'y']);
});

test('MP-2 +/- syntax: both sides are children in order', () => {
	const root = parseMindmap(wrap('+ R\n++ L\n-- Rt'))!;
	expect(labels(root)).toEqual(['L', 'Rt']);
});

test('MP-3 multi-line node joins lines; left side and <style> are skipped', () => {
	const root = parseMindmap(wrap('<style>\nmindmapDiagram {\n  node { Padding 8 }\n}\n</style>\n* R\n**:line1\nline2;\nleft side\n** B'))!;
	expect(labels(root)).toEqual(['line1 line2', 'B']);
});

test('MP-4 Creole markup is stripped from labels', () => {
	const root = parseMindmap(wrap('* R\n** **bold** and //it//'))!;
	expect(labels(root)).toEqual(['bold and it']);
});

test('MP-5 leaves() and pathTo()', () => {
	const root = parseMindmap(wrap('* R\n** A <<b1>>\n***_ x <<b1s>>\n***[#red]_ y'))!;
	expect(leaves(root).map((l) => l.label)).toEqual(['x', 'y']);
	expect(pathTo(root, leaves(root)[1])).toEqual(['R', 'A']);
	expect(leaves(parseMindmap(wrap('* alone'))!)).toEqual([]);
});

test('MP-6 no map gives null; a skipped depth attaches to the nearest ancestor', () => {
	expect(parseMindmap('no map here')).toBeNull();
	const root = parseMindmap(wrap('* R\n*** deep'))!;
	expect(labels(root)).toEqual(['deep']);
});
