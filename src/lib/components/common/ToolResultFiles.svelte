<script lang="ts">
	// The images and PDFs a tool returned, each with its full download link. Drawn by a lone
	// ToolCallDisplay, or by ConsecutiveDetailsGroup for all its calls so a collapsed group
	// does not hide them.
	import { getContext } from 'svelte';
	import type { Writable } from 'svelte/store';
	import type { i18n as i18nType } from 'i18next';
	import Image from './Image.svelte';
	import PDFViewer from './PDFViewer.svelte';
	import { copyToClipboard } from '$lib/utils';

	const i18n = getContext<Writable<i18nType>>('i18n');

	export let id = '';
	export let files: unknown = [];

	// A tool's PDF opens on request: rendering every page up front is heavy.
	let openPdfs: Record<number, boolean> = {};
	const isImage = (file: any) =>
		file.type === 'image' || (file?.content_type ?? '').startsWith('image/');
	const isPdf = (file: any) => file?.content_type === 'application/pdf';
	// Full link, so a figure or report can be copied out or downloaded; none for an inline data: fallback.
	const fileHref = (url: string) =>
		url.startsWith('data:') ? '' : new URL(url, window.location.origin).href;
</script>

{#if Array.isArray(files)}
	{#each files as file, idx}
		{#if typeof file === 'string'}
			{#if file.startsWith('data:image/')}
				<Image id={`${id}-tool-call-result-${idx}`} src={file} alt="Image" />
			{/if}
		{:else if typeof file === 'object' && file?.url}
			{#if isImage(file)}
				<Image id={`${id}-tool-call-result-${idx}`} src={file.url} alt="Image" />
			{:else if isPdf(file)}
				<button
					class="tool-result-pdf-toggle text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition"
					on:click={() => (openPdfs[idx] = !openPdfs[idx])}
				>
					{openPdfs[idx] ? $i18n.t('Hide') : $i18n.t('View')}
					{file.name ?? 'PDF'}
				</button>
				{#if openPdfs[idx]}
					<PDFViewer url={file.url} className="tool-result-pdf w-full h-[70vh] rounded-lg" />
				{/if}
			{/if}
			{#if fileHref(file.url) && (isImage(file) || isPdf(file))}
				<div class="tool-result-file-link flex items-center gap-2 text-xs text-gray-500 min-w-0">
					<a
						class="truncate underline"
						href={fileHref(file.url)}
						download={file.name ?? ''}
						title={$i18n.t('Download')}>{fileHref(file.url)}</a
					>
					<button
						class="shrink-0 hover:text-gray-700 dark:hover:text-gray-300 transition"
						on:click={() => copyToClipboard(fileHref(file.url))}>{$i18n.t('Copy')}</button
					>
				</div>
			{/if}
		{/if}
	{/each}
{/if}
