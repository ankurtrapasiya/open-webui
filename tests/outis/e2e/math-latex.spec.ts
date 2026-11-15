import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { test, expect } from '../support/fixtures';
import { fakeRequests, fakeReset } from '../support/fake-openai';

// outis-mneme's global "Math as LaTeX" filter (outis-owui plugins/math-latex/owui_filter.py): every model,
// in every chat, gets the rule to write maths as LaTeX. Guards the global-filter path (inlet on
// all models). Skips without outis-owui. Spec: specs/SPEC-chat-render.md (ML-1).
const SRC = `${process.env.OUTIS_OWUI_DIR ?? `${homedir()}/GithubProjects/outis-owui`}/plugins/math-latex/owui_filter.py`;
test.skip(!existsSync(SRC), `needs ${SRC}`);

test('ML-1 a global filter puts the LaTeX rule in the system message, once, for any model', async ({ api }) => {
	const ctx = (api as any).ctx;
	await ctx.delete('/api/v1/functions/id/math_as_latex/delete').catch(() => null);
	await ctx.post('/api/v1/functions/create', {
		data: { id: 'math_as_latex', name: 'Math as LaTeX', content: readFileSync(SRC, 'utf8'), meta: { description: 'ML-1' } }
	});
	await ctx.post('/api/v1/functions/id/math_as_latex/toggle');
	await ctx.post('/api/v1/functions/id/math_as_latex/toggle/global');
	try {
		await fakeReset();
		const { chatId, messageId } = await api.startChat({ model: 'fake-model', content: 'what is the integral of x squared' });
		await api.waitForReply(chatId, messageId);
		const sent = (await fakeRequests()).filter((r) => r.path.endsWith('/chat/completions')).pop()!;
		const system = sent.body.messages.filter((m: any) => m.role === 'system').map((m: any) => String(m.content)).join('\n');
		expect(system).toContain('[math-as-latex]');
		expect(system.split('[math-as-latex]').length - 1).toBe(1);
	} finally {
		await ctx.delete('/api/v1/functions/id/math_as_latex/delete').catch(() => null);
	}
});

// ML-2 (issue outis-owui#28): the rule must forbid a formula in backticks, which show as raw text, also in a table cell.
test('ML-2 the LaTeX rule forbids backticked formulas, tables included', () => {
	expect(readFileSync(SRC, 'utf8')).toContain('Never wrap a formula in backticks, in a table cell either');
});

// ML-3: notes read $ and $$, not \( \) or \[ \] (which the editor turns into bare brackets).
test('ML-3 the LaTeX rule tells models to write note maths with $ and $$', () => {
	expect(readFileSync(SRC, 'utf8')).toContain('In a NOTE (write_note, replace_note_content)');
});
