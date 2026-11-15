// Outis colours for Mermaid, per theme. The fork used to pick Mermaid's stock `dark` or `default` theme, so
// diagrams followed light/dark but never the Outis themes (stock yellow note bars on Outis Light, grey boxes on Dark).
// Mermaid's `base` theme takes concrete colours, so they are read from the live theme and passed as themeVariables.
//
// Two sources, both already defined per theme (Outis Dark, Light, Spark, FT), so a theme switch recolours Mermaid
// with no list of themes here:
//  - --o-*              the tool-card tokens (page, surface, ink, accent, ...), on <html>
//  - --outis-diagram-*  the diagram palette the Kroki diagrams use: text, line, and eight branch hues b1..b8, each
//                       with a fill, a border and a tint. They are scoped to `.outis-diagram`, so a probe element
//                       of that class is read, the same way a Kroki SVG resolves them.
// Roles, so every diagram type reads the same: boxes and actors in the theme's own accent (blue on Dark and Light,
// green on Spark, teal on FT), amber (b4) notes, teal (b1) activations, purple (b3) loop frames, green (b6)
// alternates; pie, timeline, journey and mind map take b1..b8 in order.
// Under a stock Open WebUI theme the tokens are empty and the caller keeps the stock theme.

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

const mix = (a: string, b: string, weight: number): string => {
	const [r1, g1, b1] = a.match(/\d+/g)!.map(Number);
	const [r2, g2, b2] = b.match(/\d+/g)!.map(Number);
	const m = (x: number, y: number) => Math.round(x + (y - x) * weight);
	return `rgb(${m(r1, r2)}, ${m(g1, g2)}, ${m(b1, b2)})`;
};

const O_TOKENS = ['page', 'surface', 'line', 'ink', 'muted', 'chip', 'accent', 'accent-2', 'blue', 'amber', 'red', 'green', 'math', 'warm', 'slate'];
const BRANCHES = [1, 2, 3, 4, 5, 6, 7, 8];

export const readOutisTokens = () => {
	const cs = getComputedStyle(document.documentElement);
	const o: Record<string, string> = {};
	for (const name of O_TOKENS) {
		const rgb = toRgb(cs.getPropertyValue(`--o-${name}`).trim());
		if (rgb) o[name] = rgb;
	}
	const probe = document.createElement('div');
	probe.className = 'outis-diagram';
	probe.style.display = 'none';
	document.body.appendChild(probe);
	const ds = getComputedStyle(probe);
	const d: Record<string, string> = {};
	const read = (name: string) => {
		const rgb = toRgb(ds.getPropertyValue(`--outis-diagram-${name}`).trim());
		if (rgb) d[name] = rgb;
	};
	for (const name of ['text', 'line', 'arrow', 'border', 'fill']) read(name);
	for (const n of BRANCHES) for (const part of ['fill', 'border', 'tint']) read(`b${n}-${part}`);
	probe.remove();
	return { o, d };
};

// null when the live theme does not define the tokens (stock Open WebUI themes).
export const outisMermaidConfig = (isDark: boolean) => {
	const { o, d } = readOutisTokens();
	if (!o.page || !o.surface || !o.ink || !o.accent || !d['b1-fill']) return null;
	const text = d.text ?? o.ink;
	const edge = d.border ? mix(d.border, o.muted ?? text, 0.55) : (o.line ?? o.muted);
	// a branch's fill, border and tint, falling back to neutrals
	const br = (n: number) => ({ fill: d[`b${n}-fill`] ?? o.surface, border: d[`b${n}-border`] ?? edge, tint: d[`b${n}-tint`] ?? (o.chip ?? o.surface) });
	const [teal, , purple, amber, , green] = [br(1), br(2), br(3), br(4), br(5), br(6)];
	// the theme's own colour: the accent, tinted into the surface for fills
	const main = { fill: mix(o.surface, o.accent, isDark ? 0.4 : 0.24), border: o.accent, tint: mix(o.page, o.accent, isDark ? 0.1 : 0.07) };
	const arrow = mix(d.line ?? o.muted ?? text, text, 0.4); // the theme's line colour, lifted so arrows read
	const hues = [o.accent, o.green, o.amber, o.red, o.blue, o.warm, o.slate, o.math].filter(Boolean) as string[];
	const scale = Object.fromEntries(
		BRANCHES.flatMap((n) => [
			[`cScale${n - 1}`, br(n).fill],
			[`cScaleLabel${n - 1}`, text],
			[`cScaleInv${n - 1}`, br(n).border]
		])
	);
	return {
		theme: 'base' as const,
		themeVariables: {
			darkMode: isDark,
			background: o.page,
			fontFamily: getComputedStyle(document.body).fontFamily,
			// flowchart, class, state, er
			primaryColor: main.fill,
			primaryTextColor: text,
			primaryBorderColor: main.border,
			secondaryColor: green.fill,
			tertiaryColor: o.page,
			lineColor: arrow,
			textColor: text,
			mainBkg: main.fill,
			nodeBorder: main.border,
			nodeTextColor: text,
			clusterBkg: main.tint,
			clusterBorder: main.border,
			titleColor: text,
			edgeLabelBackground: o.page,
			// sequence
			actorBkg: main.fill,
			actorBorder: main.border,
			actorTextColor: text,
			actorLineColor: arrow,
			signalColor: arrow,
			signalTextColor: text,
			labelBoxBkgColor: purple.fill,
			labelBoxBorderColor: purple.border,
			labelTextColor: text,
			loopTextColor: text,
			noteBkgColor: amber.fill,
			noteTextColor: text,
			noteBorderColor: amber.border,
			activationBkgColor: teal.fill,
			activationBorderColor: teal.border,
			sequenceNumberColor: o.page,
			// pie
			...Object.fromEntries(hues.map((h, i) => [`pie${i + 1}`, h])),
			// timeline, journey, mind map, quadrant: the eight branch hues in order
			...scale
		}
	};
};
