<script lang="ts">
	// Fork: one card per Outis theme, under the Theme select in Settings > General (2026-11-15).
	// The native <select> can only show text, so the themes get their icons here: each card is a
	// tile in that theme's own page colour with its mark drawn in its accent, plus three swatches.
	import { setTheme } from '$lib/utils/theme';

	export let selectedTheme: string;

	const THEMES = [
		{
			value: 'outis-dark',
			name: 'Outis Dark',
			hint: 'Night page',
			page: '#1a1713',
			accent: '#84b9e6',
			dots: ['#1a1713', '#84b9e6', '#f0c674'],
			// Crescent moon and a star: reading at night.
			paths: ['M20.5 14.2A8.5 8.5 0 1 1 9.8 3.5a7 7 0 0 0 10.7 10.7Z', 'M17.5 3.5v3M16 5h3']
		},
		{
			value: 'outis-light',
			name: 'Outis Light',
			hint: 'Day page',
			page: '#fbf9f5',
			accent: '#2266a4',
			dots: ['#fbf9f5', '#2266a4', '#7a4f00'],
			// Open book: the day page.
			paths: ['M12 6.5C10 5 7 4.6 3.5 5v13c3.5-.4 6.5 0 8.5 1.5 2-1.5 5-1.9 8.5-1.5V5C17 4.6 14 5 12 6.5Z', 'M12 6.5v13']
		},
		{
			value: 'outis-dark-spark',
			name: 'Outis Spark',
			hint: 'DGX green and gold',
			page: '#12200a',
			accent: '#76b900',
			dots: ['#12200a', '#76b900', '#cba35e'],
			// Honeycomb cell with a spark: the Spark's grille.
			paths: ['M12 2.8 20 7.4v9.2L12 21.2 4 16.6V7.4Z', 'M13 7l-3.5 5.5h3L11 17l3.5-5.5h-3Z']
		},
		{
			value: 'outis-light-ft',
			name: 'Outis FT',
			hint: 'Salmon paper',
			page: '#fff1e0',
			accent: '#005b7f',
			dots: ['#fff1e0', '#005b7f', '#d7263d'],
			// Folded newspaper.
			paths: ['M4 5.5h12v13a2 2 0 0 0 2 2H6a2 2 0 0 1-2-2Z', 'M16 9.5h4v9a2 2 0 0 1-4 0', 'M7 9h6M7 12.5h6M7 16h4']
		}
	];
</script>

<div class="grid grid-cols-2 sm:grid-cols-4 gap-2" role="radiogroup" aria-label="Outis themes" id="outis-theme-cards">
	{#each THEMES as t (t.value)}
		<button
			type="button"
			role="radio"
			aria-checked={selectedTheme === t.value}
			data-theme-card={t.value}
			class="flex items-center gap-2.5 rounded-xl border p-2 text-left transition {selectedTheme === t.value
				? 'border-blue-500'
				: 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'}"
			on:click={() => {
				selectedTheme = t.value;
				setTheme(t.value);
			}}
		>
			<span
				class="flex size-9 shrink-0 items-center justify-center rounded-lg"
				style="background: {t.page}; color: {t.accent}; box-shadow: inset 0 0 0 1px rgba(127, 127, 127, 0.25);"
			>
				<svg viewBox="0 0 24 24" class="size-5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
					{#each t.paths as d}<path {d} />{/each}
				</svg>
			</span>
			<span class="min-w-0">
				<span class="block text-xs font-medium truncate">{t.name}</span>
				<span class="block text-[11px] text-gray-500 truncate">{t.hint}</span>
				<span class="mt-1 flex gap-1" aria-hidden="true">
					{#each t.dots as c}<span class="size-2 rounded-full" style="background: {c}; box-shadow: 0 0 0 1px rgba(127, 127, 127, 0.3);"></span>{/each}
				</span>
			</span>
		</button>
	{/each}
</div>
