<script lang="ts">
	// Fork (recall mind map, 2026-11-15): a mind map as a live tree you can fold and recall.
	// Browse: branches collapse and expand. Recall mode: every leaf hides behind a "?" chip;
	// reveal it, then Knew it / Missed. A miss becomes a Review card (POST /api/v1/outis/recall).
	// No model call anywhere. Colours come from the theme's diagram tokens, so the tree matches
	// the Kroki picture it replaces (the `outis-diagram` class puts those tokens in scope).
	import { toast } from 'svelte-sonner';
	import { writable } from 'svelte/store';
	import RecallNode from './RecallNode.svelte';
	import { parseMindmap, leaves as allLeaves, pathTo, type MindNode } from '$lib/utils/mindmap';
	import { postRecall } from '$lib/apis/outis';

	export let source: string;

	type Result = 'knew' | 'missed';
	const root = parseMindmap(source);
	const branches = root?.children ?? [];
	// Same split as the Kroki filter: < 4 branches stay right; otherwise the second half goes left.
	const split = branches.length >= 4 ? Math.ceil(branches.length / 2) : branches.length;
	const right = branches.slice(0, split);
	const left = branches.slice(split);
	const leaves = root ? allLeaves(root) : [];
	const branchOf = new Map<MindNode, number>();
	branches.forEach((b, i) => {
		const idx = (i % 8) + 1;
		const mark = (n: MindNode) => {
			branchOf.set(n, idx);
			n.children.forEach(mark);
		};
		mark(b);
	});

	let mode: 'browse' | 'recall' = 'browse';
	// Depth 2 and deeper start folded: the overview is root + branches + their children.
	const initialFold = () => {
		const set = new Set<MindNode>();
		const walk = (n: MindNode, depth: number) => {
			if (depth >= 2 && n.children.length) set.add(n);
			n.children.forEach((c) => walk(c, depth + 1));
		};
		if (root) walk(root, 0);
		return set;
	};
	const collapsed = writable<Set<MindNode>>(initialFold());
	const revealed = writable<Set<MindNode>>(new Set());
	const results = writable<Map<MindNode, Result>>(new Map());
	let toasted = false;
	let mapEl: HTMLDivElement;

	$: known = [...$results.values()].filter((r) => r === 'knew').length;
	$: missed = [...$results.values()].filter((r) => r === 'missed').length;
	$: counter = leaves.length === 0 ? '0 to recall' : `known ${known} · missed ${missed}`;

	const toggle = (n: MindNode) =>
		collapsed.update((s) => {
			s.has(n) ? s.delete(n) : s.add(n);
			return new Set(s);
		});
	const setMode = (m: 'browse' | 'recall') => {
		mode = m;
	};
	const reveal = async (n: MindNode) => {
		revealed.update((s) => new Set(s).add(n));
		await Promise.resolve();
		(mapEl?.querySelector(`[data-node-id="${id(n)}"] [data-label]`) as HTMLElement | null)?.focus();
	};
	const record = async (n: MindNode, result: Result) => {
		results.update((m) => new Map(m).set(n, result));
		try {
			const r = await postRecall(localStorage.token, { root: root!.label, path: pathTo(root!, n), label: n.label, result });
			if (result === 'missed' && r.stored && !toasted) {
				toasted = true;
				toast.success('Saved to Review: My gaps');
			}
		} catch (e) {
			toast.error(`Recall not saved: ${(e as Error).message}`);
		}
	};
	const revealAll = () => revealed.set(new Set(leaves));
	const reset = () => {
		revealed.set(new Set());
		results.set(new Map());
	};
	const ids = new Map<MindNode, number>();
	const id = (n: MindNode) => {
		if (!ids.has(n)) ids.set(n, ids.size);
		return ids.get(n)!;
	};
	const onKey = (e: KeyboardEvent) => {
		if (e.key === 'Escape' && mode === 'recall') {
			setMode('browse');
			e.stopPropagation();
		}
	};

	const btn =
		'flex h-7 items-center gap-1 rounded-lg border border-gray-200 bg-white/90 px-2 text-xs text-gray-600 hover:text-gray-900 dark:border-gray-700 dark:bg-gray-900/90 dark:text-gray-400 dark:hover:text-gray-100';
</script>

{#if root}
	<!-- svelte-ignore a11y-no-static-element-interactions -->
	<div
		bind:this={mapEl}
		data-recall-map
		data-mode={mode}
		class="outis-diagram relative my-2 w-full overflow-x-auto rounded-xl p-3 text-sm"
		style="background: var(--o-page, transparent); color: var(--o-ink, inherit);"
		on:keydown={onKey}
	>
		<div class="mb-2 flex flex-wrap items-center gap-1" role="toolbar" aria-label="Recall">
			<button type="button" class={btn} aria-label="Recall mode" aria-pressed={mode === 'recall'} on:click={() => setMode(mode === 'recall' ? 'browse' : 'recall')}>
				<svg viewBox="0 0 24 24" class="size-3.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></svg>
				Recall
			</button>
			{#if mode === 'recall'}
				<button type="button" class={btn} aria-label="Reveal all" on:click={revealAll}>Reveal all</button>
				<button type="button" class={btn} aria-label="Reset" on:click={reset}>Reset</button>
				<span data-recall-count class="ml-1 text-xs" style="color: var(--o-muted, inherit);">{counter}</span>
			{/if}
		</div>

		<div class="flex items-start justify-center gap-4">
			{#if left.length}
				<div data-side="left" class="flex min-w-0 flex-1 flex-col items-end gap-3">
					{#each left as b (id(b))}
						<RecallNode node={b} depth={1} branch={branchOf.get(b) ?? 1} side="left" {mode} {collapsed} {revealed} {results} {id} onToggle={toggle} onReveal={reveal} onRecord={record} />
					{/each}
				</div>
			{/if}
			<div data-node data-depth="0" class="sticky top-2 shrink-0 self-center rounded-lg border-2 px-3 py-1.5 font-semibold" style="border-color: var(--outis-diagram-root-border); background: var(--outis-diagram-root-fill); color: var(--outis-diagram-root-text);">
				<span data-label={root.label}>{root.label}</span>
			</div>
			<div data-side="right" class="flex min-w-0 flex-1 flex-col items-start gap-3">
				{#each right as b (id(b))}
					<RecallNode node={b} depth={1} branch={branchOf.get(b) ?? 1} side="right" {mode} {collapsed} {revealed} {results} {id} onToggle={toggle} onReveal={reveal} onRecord={record} />
				{/each}
			</div>
		</div>
	</div>
{/if}
