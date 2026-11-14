import { theme } from '$lib/stores';

// Fork: the Outis themes ride on top of light/dark: 'outis-dark' is `dark` + `outis-dark`,
// 'outis-light' is `light` + `outis-light`, with their own gray palette and browser bar colour.
const OUTIS_DARK_GRAYS = ['#2b2825', '#211f1c', '#1a1816', '#151311'];
const OUTIS_META: Record<string, string> = { 'outis-dark': '#151311', 'outis-light': '#fbf9f5' };

export function setTheme(value: string): void {
	localStorage.setItem('theme', value);
	theme.set(value);
	const dark =
		value === 'system'
			? window.matchMedia('(prefers-color-scheme: dark)').matches
			: value.includes('dark');
	const root = document.documentElement;
	const resolved = dark ? 'dark' : 'light';
	for (const name of ['light', 'dark', 'oled-dark', 'outis-dark', 'outis-light']) {
		if (name !== resolved && name !== value) root.classList.remove(name);
	}
	root.classList.add(resolved);
	if (value === 'outis-dark' || value === 'outis-light') root.classList.add(value);
	// Match Settings: light themes leave the existing CSS palette untouched.
	if (dark) {
		const colors =
			value === 'oled-dark'
				? ['#101010', '#050505', '#000000', '#000000']
				: value === 'outis-dark'
					? OUTIS_DARK_GRAYS
					: ['#333', '#262626', '#171717', '#0d0d0d'];
		['800', '850', '900', '950'].forEach((shade, index) => {
			root.style.setProperty(`--color-gray-${shade}`, colors[index]);
		});
	} else if (value === 'outis-light') {
		// The dark themes leave these four set as inline style, which outranks any class
		// selector, so they have to be cleared for the light palette to apply.
		['800', '850', '900', '950'].forEach((shade) => root.style.removeProperty(`--color-gray-${shade}`));
	}
	document
		.querySelector('meta[name="theme-color"]')
		?.setAttribute(
			'content',
			OUTIS_META[value] ??
				(value === 'her' ? '#983724' : value === 'oled-dark' ? '#000000' : dark ? '#171717' : '#ffffff')
		);
	window.applyTheme?.();
}
