type ModelLike = { info?: { meta?: { terminalId?: string | null } } } | undefined;

/**
 * The terminal a chat keeps when the model it switches to has no terminal of its own.
 * A terminal some other model is bound to (Planner's planner-terminal, QF Lab's qflab-terminal)
 * is dropped, so it does not leak into unrelated models; a terminal the user picked stays.
 */
export const carriedTerminal = (
	selected: string | null,
	currentModels: ModelLike[],
	allModels: ModelLike[]
): string | null => {
	if (!selected) return null;
	const boundTo = (models: ModelLike[]) =>
		models.some((m) => m?.info?.meta?.terminalId === selected);
	return boundTo(allModels) && !boundTo(currentModels) ? null : selected;
};
