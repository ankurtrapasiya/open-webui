<script context="module" lang="ts">
	// contentWindows of embeds rendered here; Chat.svelte trusts prompt messages from these
	const embedWindows = new Set<Window>();

	export const isEmbedWindow = (source: unknown): boolean => embedWindows.has(source as Window);
</script>

<script lang="ts">
	import { onDestroy, onMount, tick } from 'svelte';
	import { config } from '$lib/stores';
	import { injectCsp } from '$lib/utils/csp';

	// Props
	export let src: string | null = null; // URL or raw HTML (auto-detected)
	export let title = 'Embedded Content';
	export let initialHeight: number | null = null; // initial height in px, null = auto

	export let iframeClassName = 'w-full rounded-2xl';

	export let args = null;

	export let allowScripts = true;
	export let allowForms = false;

	export let allowSameOrigin = false; // set to true only when you trust the content
	export let allowPopups = false;
	export let allowDownloads = true;

	export let referrerPolicy: HTMLIFrameElement['referrerPolicy'] =
		'strict-origin-when-cross-origin';
	export let allowFullscreen = true;

	export let payload = null; // payload to send into the iframe on request

	let iframe: HTMLIFrameElement | null = null;
	let iframeSrc: string | null = null;
	let iframeDoc: string | null = null;
	let registeredWindow: Window | null = null;

	// Measures the content (body box + its margins), not documentElement.scrollHeight: that one is
	// never below the frame's own height, so an embed could grow but never shrink -- a 320px chart
	// sat on the 480px starting frame (found 2026-10-04).
	const HEIGHT_REPORTER = `<script>(() => {
		const post = () => {
			const b = document.body;
			if (!b) return;
			const cs = getComputedStyle(b);
			const h = Math.max(b.getBoundingClientRect().height, b.scrollHeight) + parseFloat(cs.marginTop) + parseFloat(cs.marginBottom);
			parent.postMessage({ type: 'iframe:height', height: Math.min(Math.max(Math.ceil(h), 60), 3000) }, '*');
		};
		const ro = new ResizeObserver(post);
		ro.observe(document.documentElement);
		addEventListener('DOMContentLoaded', () => document.body && ro.observe(document.body));
		addEventListener('load', post);
	})();<\/script>`;

	// Fork: a hand-written top-level <svg> whose drawing spills past its own viewBox gets the box
	// widened to fit (height grown to keep the scale), so nothing is clipped; then it is scaled to
	// the frame's width (see fill below). Found 2026-10-04: a
	// model drew a chart's last legend line at y=424 in a 420-tall SVG. Library charts already fit.
	const SVG_FIT = `<script>(() => {
		const fit = () => document.querySelectorAll('body > svg, body > div > svg').forEach((s) => {
			const vb = s.viewBox && s.viewBox.baseVal;
			if (!vb || !vb.width || !vb.height) return;
			let b;
			try { b = s.getBBox(); } catch (e) { return; }
			const pad = 4;
			const x0 = Math.min(vb.x, b.x - pad), y0 = Math.min(vb.y, b.y - pad);
			const x1 = Math.max(vb.x + vb.width, b.x + b.width + pad), y1 = Math.max(vb.y + vb.height, b.y + b.height + pad);
			if (x0 === vb.x && y0 === vb.y && x1 === vb.x + vb.width && y1 === vb.y + vb.height) return;
			const w = parseFloat(s.getAttribute('width')), h = parseFloat(s.getAttribute('height'));
			s.setAttribute('viewBox', [x0, y0, x1 - x0, y1 - y0].join(' '));
			if (w && h) s.setAttribute('height', String(Math.round((w * (y1 - y0)) / (x1 - x0))));
		});
		// A chart drawn at a fixed size hugged the left of a wider frame. Scale it to the frame's
		// width, keeping its shape, at most 1.6x so text stays readable; narrower frames scale down.
		const fill = () => document.querySelectorAll('body > svg, body > div > svg').forEach((s) => {
			const vb = s.viewBox && s.viewBox.baseVal;
			if (!vb || !vb.width || !vb.height || s.dataset.outisFill) return;
			s.dataset.outisFill = '1';
			Object.assign(s.style, { display: 'block', width: '100%', height: 'auto', margin: '0 auto', maxWidth: Math.round(vb.width * 1.6) + 'px' });
		});
		addEventListener('load', () => { fit(); fill(); setTimeout(() => { fit(); fill(); }, 300); });
	})();<\/script>`;

	// Fork: tell the embed the app's theme and font, so tool UIs can match Outis light/dark
	// (data-outis-theme on <html>, --outis-font) instead of guessing from the OS setting.
	// Later theme switches arrive as {type: 'outis:theme'} messages.
	const outisTheme = () => ({
		theme: document.documentElement.classList.contains('dark') ? 'dark' : 'light',
		font: getComputedStyle(document.documentElement).getPropertyValue('--outis-font').trim()
	});

	const withOutisTheme = (html: string) => {
		const { theme, font } = outisTheme();
		const tag = `<script>(() => {
			const root = document.documentElement;
			const apply = (t, f) => { root.dataset.outisTheme = t; if (f) root.style.setProperty('--outis-font', f); };
			apply(${JSON.stringify(theme)}, ${JSON.stringify(font)});
			addEventListener('message', (e) => { if (e.data && e.data.type === 'outis:theme') apply(e.data.theme, e.data.font); });
		})();<\/script>`;
		const idx = html.indexOf('<head>');
		return idx !== -1 ? html.slice(0, idx + 6) + tag + html.slice(idx + 6) : html + tag;
	};

	let themeObserver: MutationObserver | null = null;

	// Derived: build sandbox attribute from flags
	$: sandbox =
		[
			allowScripts && 'allow-scripts',
			allowForms && 'allow-forms',
			allowSameOrigin && 'allow-same-origin',
			allowPopups && 'allow-popups',
			allowDownloads && 'allow-downloads'
		]
			.filter(Boolean)
			.join(' ') || undefined;

	// Detect URL vs raw HTML and prep src/srcdoc
	$: isUrl = typeof src === 'string' && /^(https?:)?\/\//i.test(src);
	$: if (src) {
		setIframeSrc();
	}

	const setIframeSrc = async () => {
		await tick();
		if (isUrl) {
			iframeSrc = src as string;
			iframeDoc = null;
		} else {
			iframeDoc = await processHtmlForDeps(src as string);
			// Fork: without allow-same-origin the parent cannot measure the embed, which then
			// stays at the browser's 150px default (tool charts cut off). Let it report its height.
			if (!allowSameOrigin) iframeDoc += HEIGHT_REPORTER + SVG_FIT;
			iframeDoc = withOutisTheme(iframeDoc);
			iframeSrc = null;
		}
	};

	// Alpine directives detection
	const alpineDirectives = [
		'x-data',
		'x-init',
		'x-show',
		'x-bind',
		'x-on',
		'x-text',
		'x-html',
		'x-model',
		'x-modelable',
		'x-ref',
		'x-for',
		'x-if',
		'x-effect',
		'x-transition',
		'x-cloak',
		'x-ignore',
		'x-teleport',
		'x-id'
	];

	async function processHtmlForDeps(html: string): Promise<string> {
		if (!allowSameOrigin) return html;

		const scriptTags: string[] = [];

		// --- Alpine.js detection & injection ---
		const hasAlpineDirectives = alpineDirectives.some((dir) => html.includes(dir));
		if (hasAlpineDirectives) {
			try {
				const { default: alpineCode } = await import('alpinejs/dist/cdn.min.js?raw');
				const alpineBlob = new Blob([alpineCode], { type: 'text/javascript' });
				const alpineUrl = URL.createObjectURL(alpineBlob);
				const alpineTag = `<script src="${alpineUrl}" defer><\/script>`;
				scriptTags.push(alpineTag);
			} catch (error) {
				console.error('Error processing Alpine for iframe:', error);
			}
		}

		// --- Chart.js detection & injection ---
		const chartJsDirectives = ['new Chart(', 'Chart.'];
		const hasChartJsDirectives = chartJsDirectives.some((dir) => html.includes(dir));
		if (hasChartJsDirectives) {
			try {
				// import chartUrl from 'chart.js/auto?url';
				const { default: Chart } = await import('chart.js/auto');
				(window as any).Chart = Chart;

				const chartTag = `<script>
window.Chart = parent.Chart; // Chart previously assigned on parent
<\/script>`;
				scriptTags.push(chartTag);
			} catch (error) {
				console.error('Error processing Chart.js for iframe:', error);
			}
		}

		// If nothing to inject, return original HTML
		if (scriptTags.length === 0) return html;

		const tags = scriptTags.join('\n');

		// Prefer injecting into <head>, then before </body>, otherwise prepend
		if (html.includes('</head>')) {
			return html.replace('</head>', `${tags}\n</head>`);
		}
		if (html.includes('</body>')) {
			return html.replace('</body>', `${tags}\n</body>`);
		}
		return `${tags}\n${html}`;
	}

	// Try to measure same-origin content safely
	function resizeSameOrigin() {
		if (!iframe) return;
		try {
			const doc = iframe.contentDocument || iframe.contentWindow?.document;
			console.log('iframe doc:', doc);
			if (!doc) return;
			const h = Math.max(doc.documentElement?.scrollHeight ?? 0, doc.body?.scrollHeight ?? 0);
			if (h > 0) iframe.style.height = h + 20 + 'px';
		} catch {
			// Cross-origin → rely on postMessage from inside the iframe
		}
	}

	function onMessage(e: MessageEvent) {
		if (!iframe || e.source !== iframe.contentWindow) return;

		const data = e.data || {};
		if (data?.type === 'iframe:height' && typeof data.height === 'number') {
			iframe.style.height = Math.max(0, data.height) + 'px';
		}

		// Pong message for testing connectivity
		if (data?.type === 'pong') {
			console.log('Received pong from iframe:', data);

			// Optional: reply back
			iframe.contentWindow?.postMessage({ type: 'pong:ack' }, '*');
		}

		// Send payload data if requested
		if (data?.type === 'payload') {
			iframe.contentWindow?.postMessage(
				{ type: 'payload', requestId: data?.requestId ?? null, payload: payload },
				'*'
			);
		}
	}

	// When the iframe loads, try same-origin resize (cross-origin will noop)
	const onLoad = async () => {
		requestAnimationFrame(resizeSameOrigin);

		if (iframe?.contentWindow && iframe.contentWindow !== registeredWindow) {
			if (registeredWindow) {
				embedWindows.delete(registeredWindow);
			}
			registeredWindow = iframe.contentWindow;
			embedWindows.add(registeredWindow);
		}

		// if arguments are provided, inject them into the iframe window
		if (args && iframe?.contentWindow) {
			(iframe.contentWindow as any).args = args;
		}
	};

	// Ensure event listener bound only while component lives
	onMount(() => {
		window.addEventListener('message', onMessage);
		themeObserver = new MutationObserver(() =>
			iframe?.contentWindow?.postMessage({ type: 'outis:theme', ...outisTheme() }, '*')
		);
		themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
	});

	onDestroy(() => {
		window.removeEventListener('message', onMessage);
		themeObserver?.disconnect();
		if (registeredWindow) {
			embedWindows.delete(registeredWindow);
		}
	});
</script>

{#if iframeDoc}
	<iframe
		bind:this={iframe}
		srcdoc={injectCsp(iframeDoc, $config?.ui?.iframe_csp ?? '')}
		{title}
		class={iframeClassName}
		style={`${initialHeight ? `height:${initialHeight}px;` : ''}`}
		width="100%"
		frameborder="0"
		{sandbox}
		{allowFullscreen}
		on:load={onLoad}
	/>
{:else if iframeSrc}
	<iframe
		bind:this={iframe}
		src={iframeSrc}
		{title}
		class={iframeClassName}
		style={`${initialHeight ? `height:${initialHeight}px;` : ''}`}
		width="100%"
		frameborder="0"
		{sandbox}
		referrerpolicy={referrerPolicy}
		{allowFullscreen}
		on:load={onLoad}
	/>
{/if}
