import { describe, expect, it } from 'vitest';
import { carriedTerminal } from './terminalCarry';

const planner = { info: { meta: { terminalId: 'planner-terminal' } } };
const qwen = { info: { meta: {} } };
const all = [planner, qwen];

describe('carriedTerminal (CB-32)', () => {
	it("drops another model's bound terminal when switching to a model without one", () => {
		expect(carriedTerminal('planner-terminal', [qwen], all)).toBeNull();
	});
	it('keeps a terminal the user picked that no model is bound to', () => {
		expect(carriedTerminal('my-terminal', [qwen], all)).toBe('my-terminal');
	});
	it('keeps the bound terminal on the model that owns it', () => {
		expect(carriedTerminal('planner-terminal', [planner], all)).toBe('planner-terminal');
	});
	it('stays empty when nothing is selected', () => {
		expect(carriedTerminal(null, [qwen], all)).toBeNull();
	});
});
