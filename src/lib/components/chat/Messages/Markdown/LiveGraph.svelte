<script lang="ts">
	// Fork (live graph, 2026-11-15): a Graphviz chart drawn from its DOT source as HTML chips
	// over an SVG edge layer. Reflows to the column (ResizeObserver), folds subtrees and
	// clusters, colours by branch with the theme's diagram tokens. The Kroki picture it replaces
	// stays in the DOM behind the viewer's Picture button.
	import { onDestroy, onMount, tick } from 'svelte';
	import { parseDot, type DotGraph } from '$lib/utils/dot';
	import { layoutGraph, hueOf, type Layout } from '$lib/utils/graph-layout';

	export let source: string;

	const graph: DotGraph | null = parseDot(source);
	const hue = graph ? hueOf(graph) : new Map<string, number>();
	const labelOf = new Map((graph?.nodes ?? []).map((n) => [n.id, n.label]));
	const hasKids = new Set((graph?.edges ?? []).map((e) => e.from));
	const clusterOf = new Map((graph?.nodes ?? []).map((n) => [n.id, n.cluster]));

	let root: HTMLDivElement;
	let measureBox: HTMLDivElement;
	let folded = new Set<string>();
	let foldedClusters = new Set<string>();
	let layout: Layout | null = null;
	let width = 0;
	let ro: ResizeObserver | null = null;
	let reduced = false;

	const PAD = 12;
	const GAP = 24;
	// Chip width cap: a third of the column (a quarter in LR), tightened so the widest row still
	// fits with its gaps; never below 90px, so labels wrap rather than scroll where they can.
	let chipCap = 160;
	const capFor = (avail: number, horizontal: boolean, widestRow: number) => {
		const base = avail / (horizontal ? 4 : 3);
		const fit = widestRow > 0 ? (avail - (widestRow - 1) * GAP) / widestRow : base;
		return Math.max(90, Math.min(base, fit));
	};

	const depthOf = (id: string) => layout?.pos.get(id)?.rank ?? 0;
	const fillFor = (id: string) => {
		const h = hue.get(id) ?? 1;
		if (h === 0) return 'var(--outis-diagram-root-fill)';
		return depthOf(id) <= 1 ? `var(--outis-diagram-b${h}-fill)` : `var(--outis-diagram-b${h}-tint)`;
	};
	const borderFor = (id: string) => ((hue.get(id) ?? 1) === 0 ? 'var(--outis-diagram-root-border)' : `var(--outis-diagram-b${hue.get(id)}-border)`);
	const textFor = (id: string) => ((hue.get(id) ?? 1) === 0 ? 'var(--outis-diagram-root-text)' : 'var(--o-ink, inherit)');

	// Measure each chip's size at the current cap by rendering the labels in a hidden box.
	const measureAll = (): Map<string, { w: number; h: number }> => {
		const out = new Map<string, { w: number; h: number }>();
		if (!measureBox) return out;
		for (const el of measureBox.querySelectorAll<HTMLElement>('[data-measure]')) {
			el.style.maxWidth = `${chipCap}px`;
			const r = el.getBoundingClientRect();
			out.set(el.dataset.measure!, { w: Math.ceil(r.width), h: Math.ceil(r.height) });
		}
		return out;
	};

	const relayout = async () => {
		if (!graph || !root) return;
		await tick();
		let sizes = measureAll();
		// Members of a folded cluster hide behind its header chip: fold them as a group by
		// treating the cluster header as a pseudo node is more code than it is worth; instead
		// drop their ids from the graph passed to the layout.
		const hiddenByCluster = new Set<string>();
		for (const c of graph.clusters) if (foldedClusters.has(c.id)) c.nodes.forEach((n) => hiddenByCluster.add(n));
		const g: DotGraph = hiddenByCluster.size
			? { ...graph, nodes: graph.nodes.filter((n) => !hiddenByCluster.has(n.id)), edges: graph.edges.filter((e) => !hiddenByCluster.has(e.from) && !hiddenByCluster.has(e.to)) }
			: graph;
		const avail = Math.max(200, width - 2 * PAD);
		const run = () =>
			layoutGraph(g, { maxWidth: avail, measure: (id) => sizes.get(id) ?? { w: 120, h: 36 }, folded, gapX: GAP });
		chipCap = capFor(avail, false, 0);
		sizes = measureAll();
		let L = run();
		// Second pass: tighten the cap to the widest row so it fits without sideways scroll.
		const counts = new Map<number, number>();
		for (const p of L.pos.values()) counts.set(p.rank, (counts.get(p.rank) ?? 0) + 1);
		const widest = Math.max(0, ...counts.values());
		const cap2 = capFor(avail, L.horizontal, widest);
		if (cap2 < chipCap - 1) {
			chipCap = cap2;
			sizes = measureAll();
			L = run();
		}
		layout = L;
	};

	const toggle = (id: string) => {
		folded = new Set(folded);
		folded.has(id) ? folded.delete(id) : folded.add(id);
		relayout();
	};
	const toggleCluster = (id: string) => {
		foldedClusters = new Set(foldedClusters);
		foldedClusters.has(id) ? foldedClusters.delete(id) : foldedClusters.add(id);
		relayout();
	};

	onMount(() => {
		reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
		width = root.clientWidth;
		relayout();
		ro = new ResizeObserver(() => {
			const w = root.clientWidth;
			if (Math.abs(w - width) > 2) {
				width = w;
				relayout();
			}
		});
		ro.observe(root);
	});
	onDestroy(() => ro?.disconnect());

	const path = (pts: [number, number][], horizontal: boolean) => {
		const [x0, y0] = pts[0];
		const [x1, y1] = pts[pts.length - 1];
		if (horizontal) {
			const mx = (x0 + x1) / 2;
			return `M${x0},${y0} C${mx},${y0} ${mx},${y1} ${x1},${y1}`;
		}
		const my = (y0 + y1) / 2;
		return `M${x0},${y0} C${x0},${my} ${x1},${my} ${x1},${y1}`;
	};
	const clusterBox = (id: string) => {
		if (!layout) return null;
		const members = (graph?.clusters.find((c) => c.id === id)?.nodes ?? []).map((n) => layout!.pos.get(n)).filter(Boolean) as any[];
		if (!members.length) return null;
		const x = Math.min(...members.map((m) => m.x)) - 8;
		const y = Math.min(...members.map((m) => m.y)) - 8;
		const r = Math.max(...members.map((m) => m.x + m.w)) + 8;
		const b = Math.max(...members.map((m) => m.y + m.h)) + 8;
		return { x, y, w: r - x, h: b - y };
	};
	const small =
		'inline-flex h-5 items-center rounded px-1 text-[10px] leading-none border border-current/40 opacity-80 hover:opacity-100';
</script>

{#if graph}
	<div
		bind:this={root}
		data-live-graph
		data-horizontal={layout?.horizontal ? 'true' : 'false'}
		class="outis-diagram relative my-2 w-full overflow-hidden rounded-xl text-sm"
		style="background: var(--o-page, transparent); color: var(--o-ink, inherit); padding: {PAD}px; height: {layout ? layout.height + 2 * PAD + 28 : 80}px; transition: {reduced ? 'none' : 'height 200ms ease'};"
	>
		<!-- Hidden measuring copies: same classes as the chips, so sizes match. -->
		<div bind:this={measureBox} aria-hidden="true" class="pointer-events-none absolute left-0 top-0 opacity-0" style="visibility: hidden;">
			{#each graph.nodes as n (n.id)}
				<div data-measure={n.id} class="inline-block whitespace-pre-wrap break-words rounded-lg border px-2.5 py-1 text-sm leading-snug" style="border-left-width: 3px;">{n.label}{#if hasKids.has(n.id)}<span class="ml-6"></span>{/if}</div>
			{/each}
		</div>

		{#if layout}
			{@const L = layout}
			{@const cx = (L.horizontal ? 0 : Math.max(0, (width - 2 * PAD - L.width) / 2))}
			<div class="relative" style="width: {Math.max(L.width, width - 2 * PAD)}px; height: {L.height + 28}px;">
				<!-- Cluster frames and headers -->
				{#each graph.clusters as c (c.id)}
					{@const box = clusterBox(c.id)}
					{#if box || foldedClusters.has(c.id)}
						<div
							class="absolute rounded-xl border border-dashed"
							style="left: {cx + (box?.x ?? 0)}px; top: {(box?.y ?? 0) + 28}px; width: {box?.w ?? 0}px; height: {box?.h ?? 0}px; border-color: color-mix(in srgb, var(--outis-diagram-line) 60%, transparent); display: {box ? 'block' : 'none'};"
						></div>
						<div
							data-gcluster={c.id}
							class="absolute flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs"
							style="left: {cx + (box?.x ?? 0)}px; top: {(box?.y ?? 0) + 28 - 22}px; color: var(--o-muted, inherit); background: var(--o-page, transparent);"
						>
							<span>{c.label}</span>
							<button type="button" class={small} aria-label={foldedClusters.has(c.id) ? 'Unfold' : 'Fold'} on:click={() => toggleCluster(c.id)}>{foldedClusters.has(c.id) ? `+${c.nodes.length}` : '–'}</button>
						</div>
					{/if}
				{/each}

				<svg data-edges class="pointer-events-none absolute left-0 top-0" style="width: {Math.max(L.width, width - 2 * PAD)}px; height: {L.height + 28}px; overflow: visible;" aria-hidden="true">
					<defs>
						<marker id="lg-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
							<path d="M0,0 L10,5 L0,10 z" fill="context-stroke" />
						</marker>
					</defs>
					{#each L.edges as e (e.from + '→' + e.to)}
						<path
							data-edge="{e.from}→{e.to}"
							d={path(e.points.map(([x, y]) => [x + cx, y + 28]), L.horizontal)}
							fill="none"
							stroke="color-mix(in srgb, {borderFor(e.to)} 70%, transparent)"
							stroke-width="1.5"
							marker-end={graph.directed ? 'url(#lg-arrow)' : undefined}
						/>
						{#if e.label}
							{@const [mx, my] = [(e.points[0][0] + e.points[e.points.length - 1][0]) / 2 + cx, (e.points[0][1] + e.points[e.points.length - 1][1]) / 2 + 28]}
							<foreignObject x={mx - 60} y={my - 10} width="120" height="20" style="overflow: visible;">
								<div data-elabel class="mx-auto w-max max-w-[120px] truncate rounded px-1 text-[11px]" style="background: var(--o-page, transparent); color: var(--o-muted, inherit);">{e.label}</div>
							</foreignObject>
						{/if}
					{/each}
				</svg>

				{#each [...L.pos] as [id, p] (id)}
					<div
						data-gnode={id}
						data-rank={p.rank}
						data-hue={hue.get(id) ?? 1}
						title={labelOf.get(id)}
						class="absolute flex items-start gap-1.5 whitespace-pre-wrap break-words rounded-lg border px-2.5 py-1 text-sm leading-snug"
						style="left: {p.x + cx}px; top: {p.y + 28}px; width: {p.w}px; min-height: {p.h}px; border-color: {borderFor(id)}; border-left-width: 3px; background: {fillFor(id)}; color: {textFor(id)}; transition: {reduced ? 'none' : 'left 200ms ease, top 200ms ease'}; {clusterOf.get(id) ? '' : ''}"
					>
						<span class="min-w-0 flex-1">{labelOf.get(id)}</span>
						{#if hasKids.has(id)}
							<button type="button" class="{small} mt-0.5 shrink-0" aria-label={folded.has(id) ? 'Unfold' : 'Fold'} on:click={() => toggle(id)}>
								{#if folded.has(id) && (L.badges.get(id) ?? 0) > 0}
									<span data-badge>+{L.badges.get(id)}</span>
								{:else}
									<svg viewBox="0 0 24 24" class="size-3 transition {folded.has(id) ? '' : 'rotate-90'}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6" /></svg>
								{/if}
							</button>
						{/if}
					</div>
				{/each}
			</div>
		{/if}
	</div>
{/if}
