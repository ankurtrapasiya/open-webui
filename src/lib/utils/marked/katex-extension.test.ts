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
