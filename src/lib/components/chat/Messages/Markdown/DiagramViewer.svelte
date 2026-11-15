<script lang="ts">
	// Fork (diagram readability, 2026-11-15): every Kroki diagram opens as a whole-picture
	// overview fitted to the column, and zooms on demand. Native size in a sideways scroller
	// (the old wrapper) meant a 3200px Graphviz chart showed a quarter of itself; plain
	// fit-to-width made labels 5-7px. Overview first, detail on request.
	//
	// The transform lives on [data-diagram-stage], outside `.outis-diagram`, so chat export
	// (Navbar/Menu.svelte, Sidebar/ChatMenu.svelte clone `.outis-diagram > svg`) gets the
	// untransformed SVG. The wheel zooms only after a click (or with Ctrl/Cmd), so scrolling
	// the chat never gets stuck in a diagram.
	import { onMount, onDestroy, tick } from 'svelte';

	export let html: string;
	export let fullscreen = false;
	export let onClose: () => void = () => {};

	const MAX = 4; // times natural size
	let viewer: HTMLDivElement;
	let stage: HTMLDivElement;
	let natW = 0;
	let natH = 0;
	let fit = 1;
	let zoom = 1;
	let tx = 0;
	let ty = 0;
	let height = 0;
	let active = false;
	let showFull = false;
	let drag: { x: number; y: number; tx: number; ty: number } | null = null;
	let ro: ResizeObserver | null = null;

	$: zoomable = fit < 0.999 || fullscreen;

	const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

	const measure = () => {
		const svg = stage?.querySelector('svg');
		if (!svg) return false;
		const r = svg.getBoundingClientRect();
		natW = r.width / (zoom || 1);
		natH = r.height / (zoom || 1);
		return natW > 0 && natH > 0;
	};

	const toFit = () => {
		if (!viewer || !natW) return;
		const w = viewer.clientWidth;
		// The overview also has to fit the screen height, or a tall map is not "whole".
		const h = fullscreen ? window.innerHeight - 72 : window.innerHeight * 0.75;
		fit = Math.min(fullscreen ? 2 : 1, w / natW, h / natH);
		zoom = fit;
		height = fullscreen ? h : natH * fit;
		tx = (w - natW * fit) / 2;
		ty = fullscreen ? (h - natH * fit) / 2 : 0;
	};

	const zoomAt = (x: number, y: number, factor: number) => {
		const next = clamp(zoom * factor, Math.min(fit, 0.25), MAX);
		tx = x - ((x - tx) * next) / zoom;
		ty = y - ((y - ty) * next) / zoom;
		zoom = next;
	};

	const local = (e: MouseEvent) => {
		const r = viewer.getBoundingClientRect();
		return [e.clientX - r.left, e.clientY - r.top];
	};

	const onWheel = (e: WheelEvent) => {
		if (!zoomable || !(active || e.ctrlKey || e.metaKey)) return;
		e.preventDefault();
		const [x, y] = local(e);
		zoomAt(x, y, e.deltaY < 0 ? 1.1 : 1 / 1.1);
	};

	const onPointerDown = (e: PointerEvent) => {
		active = true;
		if ((e.target as HTMLElement).closest('button')) return;
		if (zoom > fit + 0.001) {
			drag = { x: e.clientX, y: e.clientY, tx, ty };
			viewer.setPointerCapture(e.pointerId);
		}
	};
	const onPointerMove = (e: PointerEvent) => {
		if (!drag) return;
		tx = drag.tx + e.clientX - drag.x;
		ty = drag.ty + e.clientY - drag.y;
	};
	const onPointerUp = () => (drag = null);

	const onDocPointerDown = (e: PointerEvent) => {
		if (viewer && !viewer.contains(e.target as Node)) active = false;
	};
	const onKey = (e: KeyboardEvent) => {
		if (e.key !== 'Escape') return;
		if (fullscreen) onClose();
		else active = false;
	};

	// HTMLToken sanitises and sets `html` after this component mounts, so measure whenever
	// it changes, not only on mount.
	const refit = async () => {
		await tick();
		zoom = 1;
		tx = ty = 0;
		await tick();
		if (measure()) toFit();
	};
	$: if (html !== undefined && viewer) refit();

	onMount(async () => {
		await refit();
		viewer.addEventListener('wheel', onWheel, { passive: false });
		document.addEventListener('pointerdown', onDocPointerDown);
		document.addEventListener('keydown', onKey);
		// The message may not be laid out yet at mount (the SVG measures 0x0), so the first
		// real size arrives here: measure then, and re-fit on later width changes while the
		// reader is still at the overview.
		ro = new ResizeObserver(() => {
			if (!natW && !measure()) return;
			if (Math.abs(zoom - fit) < 0.001) toFit();
		});
		ro.observe(viewer);
	});

	onDestroy(() => {
		viewer?.removeEventListener('wheel', onWheel);
		if (typeof document !== 'undefined') {
			document.removeEventListener('pointerdown', onDocPointerDown);
			document.removeEventListener('keydown', onKey);
		}
		ro?.disconnect();
	});

	const btn =
		'flex size-7 items-center justify-center rounded-lg border border-gray-200 bg-white/90 text-gray-600 hover:text-gray-900 dark:border-gray-700 dark:bg-gray-900/90 dark:text-gray-400 dark:hover:text-gray-100';
</script>

<!-- svelte-ignore a11y-no-static-element-interactions -->
<div
	bind:this={viewer}
	data-diagram-viewer
	data-zoom={zoom.toFixed(2)}
	class="group relative my-2 w-full overflow-hidden {zoom > fit + 0.001 ? 'cursor-grab' : ''}"
	style="height: {height ? `${height}px` : 'auto'}; touch-action: {active ? 'none' : 'pan-y'};"
	on:pointerdown={onPointerDown}
	on:pointermove={onPointerMove}
	on:pointerup={onPointerUp}
	on:pointercancel={onPointerUp}
	on:dblclick={(e) => {
		if (!zoomable) return;
		const [x, y] = local(e);
		zoomAt(x, y, 2);
	}}
>
	<div
		bind:this={stage}
		data-diagram-stage
		class="absolute left-0 top-0 w-max origin-top-left"
		style="transform: translate({tx}px, {ty}px) scale({zoom});"
	>
		{@html html}
	</div>

	<div
		class="absolute right-2 top-2 flex gap-1 opacity-0 transition group-hover:opacity-100 group-focus-within:opacity-100"
	>
		{#if zoomable}
			<button type="button" class={btn} aria-label="Zoom out" on:click={() => zoomAt(viewer.clientWidth / 2, height / 2, 1 / 1.25)}>
				<svg viewBox="0 0 24 24" class="size-4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M5 12h14" /></svg>
			</button>
			<button type="button" class={btn} aria-label="Zoom in" on:click={() => zoomAt(viewer.clientWidth / 2, height / 2, 1.25)}>
				<svg viewBox="0 0 24 24" class="size-4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14" /></svg>
			</button>
			<button type="button" class={btn} aria-label="Fit diagram" on:click={toFit}>
				<svg viewBox="0 0 24 24" class="size-4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" /></svg>
			</button>
		{/if}
		{#if fullscreen}
			<button type="button" class={btn} aria-label="Close" on:click={onClose}>
				<svg viewBox="0 0 24 24" class="size-4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
			</button>
		{:else}
			<button type="button" class={btn} aria-label="Full screen" on:click={() => (showFull = true)}>
				<svg viewBox="0 0 24 24" class="size-4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 4H4v5M15 4h5v5M9 20H4v-5M15 20h5v-5" /></svg>
			</button>
		{/if}
	</div>
</div>

{#if showFull}
	<div
		role="dialog"
		aria-modal="true"
		aria-label="Diagram"
		class="fixed inset-0 z-[9999] bg-white p-4 dark:bg-gray-900"
	>
		<svelte:self {html} fullscreen onClose={() => (showFull = false)} />
	</div>
{/if}
