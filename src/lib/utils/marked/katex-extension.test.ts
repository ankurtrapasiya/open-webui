import { describe, expect, it } from 'vitest';
import { marked } from 'marked';
import katex from 'katex';
import markedKatex from './katex-extension';

marked.use(markedKatex());

const mathTokens = (md: string) => {
	const out = [];
	marked.walkTokens(marked.lexer(md), (t) => {
		if (t.type === 'inlineKatex' || t.type === 'blockKatex') out.push(t);
	});
	return out;
};

describe('katex extension display mode', () => {
	it('one-line \\[ ... \\] is display math, so \\tag renders', () => {
		const [t] = mathTokens('\\[ \\Pr[T \\ge c] \\le e^{-c} \\tag{20.23} \\]');
		expect(t.displayMode).toBe(true);
		expect(() => katex.renderToString(t.text, { displayMode: t.displayMode, throwOnError: true })).not.toThrow();
	});
	it('\\( ... \\) and $ ... $ stay inline', () => {
		expect(mathTokens('see \\(x^2\\) and $y$ here').map((t) => t.displayMode)).toEqual([false, false]);
	});
});

describe('katex extension: dropped thousands separator', () => {
	const renders = (md: string) =>
		mathTokens(md).every((t) => {
			katex.renderToString(t.text, { displayMode: t.displayMode, throwOnError: true });
			return true;
		});
	it('10{000{000 (unbalanced) is repaired to 10{,}000{,}000 and renders', () => {
		const md = '$$\\text{CVA} = €100{000{000 - €97{000{000 = €3{000{000$$\n\n- **Risk-free value:** $€1{000,000 \\times 0.95 = €950,000$';
		expect(mathTokens(md)[0].text).toContain('100{,}000{,}000');
		expect(renders(md)).toBe(true);
	});
	it('balanced braces are left alone', () => {
		const [t] = mathTokens('$x^{100} + 1{,}000$');
		expect(t.text).toBe('x^{100} + 1{,}000');
	});
});
