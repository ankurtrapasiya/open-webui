// Outis palette for Mermaid. The fork used to pick Mermaid's stock `dark` or `default` theme, so diagrams
// followed light/dark but never the Outis colours (yellow note bars on Outis Light, stock greys on Dark).
// Mermaid's `base` theme takes concrete colours, so the live theme's --o-* tokens (the same ones tool UIs
// and archify read) are resolved to rgb here and passed as themeVariables. Under a non-Outis theme the
// tokens are empty and the caller keeps the stock theme.

const TOKENS = [
	'page', 'surface', 'line', 'ink', 'muted', 'chip', 'accent', 'accent-2',
	'blue', 'amber', 'red', 'green', 'math', 'warm', 'slate'
] as const;

type Token = (typeof TOKENS)[number];

// Token values are CSS (oklch, color-mix, var() already resolved); Mermaid's colour maths needs rgb.
// A canvas pixel is the portable way to turn any CSS colour into sRGB.
const toRgb = (value: string): string | null => {
	if (!value) return null;
	const ctx = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
	if (!ctx) return null;
	const sentinel = '#010203';
	ctx.fillStyle = sentinel;
	ctx.fillStyle = value;
	if (ctx.fillStyle === sentinel) return null; // not a colour
	ctx.clearRect(0, 0, 1, 1);
	ctx.fillRect(0, 0, 1, 1);
	const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
	return a === 0 ? null : `rgb(${r}, ${g}, ${b})`;
};

// The Outis line colour is tuned for cards on a page; a diagram's boxes need a little more edge to read.
const mix = (a: string, b: string, weight: number): string => {
	const [r1, g1, b1] = a.match(/\d+/g)!.map(Number);
	const [r2, g2, b2] = b.match(/\d+/g)!.map(Number);
	const m = (x: number, y: number) => Math.round(x + (y - x) * weight);
	return `rgb(${m(r1, r2)}, ${m(g1, g2)}, ${m(b1, b2)})`;
};

export const readOutisTokens = (): Partial<Record<Token, string>> => {
	const cs = getComputedStyle(document.documentElement);
	const out: Partial<Record<Token, string>> = {};
	for (const name of TOKENS) {
		const rgb = toRgb(cs.getPropertyValue(`--o-${name}`).trim());
		if (rgb) out[name] = rgb;
	}
	return out;
};

// null when the live theme does not define the tokens (stock Open WebUI themes).
export const outisMermaidConfig = (isDark: boolean) => {
	const t = readOutisTokens();
	if (!t.page || !t.surface || !t.ink || !t.line || !t.muted || !t.chip || !t.accent) return null;
	const hues = [t.accent, t.green, t.amber, t.red, t.blue, t.warm, t.slate, t.math].filter(Boolean) as string[];
	const edge = mix(t.line, t.muted, 0.55);
	const pies = Object.fromEntries(hues.map((h, i) => [`pie${i + 1}`, h]));
	return {
		theme: 'base' as const,
		themeVariables: {
			darkMode: isDark,
			background: t.page,
			fontFamily: getComputedStyle(document.body).fontFamily,
			primaryColor: t.surface,
			primaryTextColor: t.ink,
			primaryBorderColor: edge,
			secondaryColor: t.chip,
			tertiaryColor: t.page,
			lineColor: t.muted,
			textColor: t.ink,
			mainBkg: t.surface,
			nodeBorder: edge,
			nodeTextColor: t.ink,
			clusterBkg: t.chip,
			clusterBorder: edge,
			titleColor: t.ink,
			edgeLabelBackground: t.page,
			// sequence diagrams
			actorBkg: t.surface,
			actorBorder: edge,
			actorTextColor: t.ink,
			actorLineColor: t.muted,
			signalColor: t.muted,
			signalTextColor: t.ink,
			labelBoxBkgColor: t.surface,
			labelBoxBorderColor: edge,
			labelTextColor: t.ink,
			loopTextColor: t.ink,
			noteBkgColor: t.chip,
			noteTextColor: t.ink,
			noteBorderColor: edge,
			activationBkgColor: t.chip,
			activationBorderColor: t.muted,
			sequenceNumberColor: t.page,
			...pies
		}
	};
};
