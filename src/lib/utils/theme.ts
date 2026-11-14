import { theme } from '$lib/stores';

// Fork: the Outis themes ride on top of light/dark. Each value maps to the classes it adds
// besides `dark`/`light`; the variants (src/outis-variants.css) layer a palette on a base.
const OUTIS: Record<string, { classes: string[]; meta: string; grays?: string[] }> = {
	'outis-dark': { classes: ['outis-dark'], meta: '#1a1713', grays: ['#282521', '#211d1a', '#1a1713', '#14110e'] },
	'outis-dark-spark': { classes: ['outis-dark', 'outis-spark'], meta: '#12200a', grays: ['#24360f', '#1a2a0d', '#12200a', '#0f1a06'] },
	'outis-light': { classes: ['outis-light'], meta: '#fbf9f5' },
	'outis-light-ft': { classes: ['outis-light', 'outis-ft'], meta: '#fff1e0' }
};

export function setTheme(value: string): void {
	localStorage.setItem('theme', value);
	theme.set(value);
	const dark =
		value === 'system'
			? window.matchMedia('(prefers-color-scheme: dark)').matches
			: value.includes('dark');
	const root = document.documentElement;
	const resolved = dark ? 'dark' : 'light';
	const outis = OUTIS[value];
	for (const name of ['light', 'dark', 'oled-dark', 'outis-dark', 'outis-light', 'outis-spark', 'outis-ft']) {
		if (name !== resolved && !outis?.classes.includes(name)) root.classList.remove(name);
	}
	root.classList.add(resolved, ...(outis?.classes ?? []));
	// Match Settings: light themes leave the existing CSS palette untouched.
	if (dark) {
		const colors =
			value === 'oled-dark'
				? ['#101010', '#050505', '#000000', '#000000']
				: (outis?.grays ?? ['#333', '#262626', '#171717', '#0d0d0d']);
		['800', '850', '900', '950'].forEach((shade, index) => {
			root.style.setProperty(`--color-gray-${shade}`, colors[index]);
		});
	} else if (outis) {
		// The dark themes leave these four set as inline style, which outranks any class
		// selector, so they have to be cleared for the light palette to apply.
		['800', '850', '900', '950'].forEach((shade) => root.style.removeProperty(`--color-gray-${shade}`));
	}
	document
		.querySelector('meta[name="theme-color"]')
		?.setAttribute(
			'content',
			outis?.meta ??
				(value === 'her' ? '#983724' : value === 'oled-dark' ? '#000000' : dark ? '#171717' : '#ffffff')
		);
	window.applyTheme?.();
}
