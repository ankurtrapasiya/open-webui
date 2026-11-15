<script lang="ts">
	// A jargon tip: dotted-underlined term, plain meaning on hover/focus, tap toggles on touch.
	// Spec: tests/outis/specs/SPEC-jargon-tips.md. Markup mirrors renderTip() in tip-extension.ts.
	import type { Tokens } from 'marked';

	export let token: Tokens.Generic;

	let el: HTMLElement;
	let open = false;
	let shift = 0; // px the box moves left so it stays inside the viewport (16px gutter)

	function place() {
		const box = el?.querySelector<HTMLElement>('.o-tip-box');
		if (!box) return;
		shift = 0;
		box.style.setProperty('--o-tip-shift', '0px');
		const r = box.getBoundingClientRect();
		const over = r.right - (window.innerWidth - 16);
		if (over > 0) shift = Math.min(over, Math.max(0, r.left - 16));
		box.style.setProperty('--o-tip-shift', `${-shift}px`);
	}
	function close() {
		open = false;
	}
</script>

<!-- svelte-ignore a11y-no-noninteractive-tabindex -->
<span
	bind:this={el}
	class="o-tip"
	class:o-tip-ai={token.ai}
	class:o-tip-open={open}
	tabindex="0"
	on:mouseenter={place}
	on:focus={place}
	on:click={(e) => {
		e.stopPropagation();
		open = !open;
		if (open) place();
	}}
	on:keydown={(e) => {
		if (e.key === 'Escape') {
			close();
			el.blur();
		}
	}}
	on:blur={close}
	>{token.term}<span class="o-tip-box" role="tooltip"
		>{token.tip}{#if token.src}<span class="o-tip-src">{token.src}</span>{/if}</span
	></span
>
