import { describe, expect, it } from 'vitest';
import { editorMarked } from './editor-marked';

const parse = (md: string) => editorMarked.parse(md) as string;

describe('editor marked math', () => {
	it('inline math becomes a tiptap inline-math span', () => {
		expect(parse('risk $E(y_0 - \\hat f(x_0))^2$ here')).toContain(
			'<span data-type="inline-math" data-latex="E(y_0 - \\hat f(x_0))^2"></span>'
		);
	});
	it('block math becomes a tiptap block-math div', () => {
		expect(parse('$$\n\\frac1n \\sum_i x_i\n$$')).toContain(
			'<div data-type="block-math" data-latex="\\frac1n \\sum_i x_i"></div>'
		);
	});
	it('escapes attribute characters and keeps \\mid inside table cells', () => {
		const html = parse('| f | r |\n|---|---|\n| $p(y \\mid x) < 1$ | "p" |');
		expect(html).toContain('data-latex="p(y \\mid x) &lt; 1"');
		expect(html).toContain('<table>');
	});
	it('leaves prices alone', () => {
		expect(parse('costs $5 and $10 each')).not.toContain('inline-math');
	});
	it('still renders task lists like the global instance', () => {
		expect(parse('- [x] done')).toContain('data-type="taskList"');
	});
});
