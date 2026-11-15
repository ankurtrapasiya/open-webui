// Shared helpers for visual checks, so a new diagram type adds a test, not a new toolbox.

// The four Outis themes, as the `theme` value the app stores in localStorage.
export const THEMES = ['outis-dark', 'outis-light', 'outis-dark-spark', 'outis-light-ft'] as const;

const channel = (v: number) => {
	const s = v / 255;
	return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};

export const parseRgb = (css: string): [number, number, number] => {
	const m = css.match(/\d+(\.\d+)?/g);
	if (!m || m.length < 3) throw new Error(`not an rgb colour: ${css}`);
	return [Number(m[0]), Number(m[1]), Number(m[2])];
};

// WCAG 2.x contrast ratio between two CSS rgb() colours: 1 (none) to 21 (black on white).
export const contrast = (a: string, b: string): number => {
	const lum = (c: string) => {
		const [r, g, bl] = parseRgb(c);
		return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(bl);
	};
	const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
	return (hi + 0.05) / (lo + 0.05);
};

// Text on a fill is readable at 4.5; large text and UI lines at 3 (WCAG 1.4.3, 1.4.11).
export const MIN_TEXT_CONTRAST = 4.5;
