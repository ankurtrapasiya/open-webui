<script lang="ts">
	// One node of the recall mind map, recursive. State lives in the parent's stores so every
	// level reacts to collapse / reveal / record; this file only draws and forwards clicks.
	import type { Writable } from 'svelte/store';
	import type { MindNode } from '$lib/utils/mindmap';

	export let node: MindNode;
	export let depth: number;
	export let branch: number; // 1..8, picks the hue
	export let side: 'left' | 'right';
	export let mode: 'browse' | 'recall';
	export let collapsed: Writable<Set<MindNode>>;
	export let revealed: Writable<Set<MindNode>>;
	export let results: Writable<Map<MindNode, 'knew' | 'missed'>>;
	export let id: (n: MindNode) => number;
	export let onToggle: (n: MindNode) => void;
	export let onReveal: (n: MindNode) => void;
	export let onRecord: (n: MindNode, r: 'knew' | 'missed') => void;

	$: leaf = node.children.length === 0;
	$: isCollapsed = $collapsed.has(node);
	$: hidden = mode === 'recall' && leaf && !$revealed.has(node);
	$: result = $results.get(node);
	$: hue = `var(--outis-diagram-b${branch}-border)`;
	$: fill = depth === 1 ? `var(--outis-diagram-b${branch}-fill)` : `var(--outis-diagram-b${branch}-tint)`;
	$: resultColor = result === 'knew' ? 'var(--color-green-500)' : result === 'missed' ? 'var(--color-red-500)' : hue;

	const small =
		'inline-flex h-6 items-center rounded-md border px-1.5 text-[11px] border-gray-300 text-gray-600 hover:text-gray-900 dark:border-gray-600 dark:text-gray-300 dark:hover:text-gray-100';
</script>

<div
	data-node
	data-node-id={id(node)}
	data-node-label={node.label}
	data-depth={depth}
	data-leaf={leaf ? '' : undefined}
	data-result={result}
	class="flex flex-col {side === 'left' ? 'items-end' : 'items-start'} gap-1"
>
	<div class="flex items-center gap-1.5 {side === 'left' ? 'flex-row-reverse' : ''}">
		{#if hidden}
			<button
				type="button"
				data-chip
				aria-label="Reveal"
				class="h-7 rounded-md border border-dashed px-2 text-xs"
				style="border-color: {hue}; color: var(--o-muted, inherit); min-width: max(3ch, {node.label.length + 1}ch);"
				on:click={() => onReveal(node)}>?</button
			>
		{:else}
			<!-- svelte-ignore a11y-no-noninteractive-tabindex -->
			<span
				data-label={node.label}
				tabindex={mode === 'recall' && leaf ? 0 : -1}
				class="rounded-md border-l-[3px] px-2 py-0.5 {depth === 1 ? 'font-medium' : ''} {depth >= 2 ? 'border-y border-r' : 'border'}"
				style="border-color: {resultColor}; background: {depth <= 1 ? fill : 'transparent'}; color: var(--o-ink, inherit);"
				on:keydown={(e) => {
					if (mode !== 'recall' || !leaf || result) return;
					if (e.key === 'k') onRecord(node, 'knew');
					else if (e.key === 'm') onRecord(node, 'missed');
				}}>{node.label}</span
			>
		{/if}
		{#if !leaf}
			<button type="button" class={small} aria-label={isCollapsed ? 'Expand' : 'Collapse'} on:click={() => onToggle(node)}>
				<svg viewBox="0 0 24 24" class="size-3 transition {isCollapsed ? '' : 'rotate-90'}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6" /></svg>
			</button>
		{/if}
		{#if mode === 'recall' && leaf && !hidden && !result}
			<button type="button" class={small} aria-label="Knew it" style="color: var(--color-green-500)" on:click={() => onRecord(node, 'knew')}>Knew it</button>
			<button type="button" class={small} aria-label="Missed" style="color: var(--color-red-500)" on:click={() => onRecord(node, 'missed')}>Missed</button>
		{/if}
	</div>
	{#if !leaf && !isCollapsed}
		<div class="flex flex-col gap-1 {side === 'left' ? 'mr-3 border-r pr-3' : 'ml-3 border-l pl-3'}" style="border-color: {hue};">
			{#each node.children as child (id(child))}
				<svelte:self node={child} depth={depth + 1} {branch} {side} {mode} {collapsed} {revealed} {results} {id} {onToggle} {onReveal} {onRecord} />
			{/each}
		</div>
	{/if}
</div>
