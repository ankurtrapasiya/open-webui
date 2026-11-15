// Jargon tips (Outis, 2026-11-15; spec: tests/outis/specs/SPEC-jargon-tips.md).
// A technical term with a one-line plain meaning the reader sees on hover or tap:
//
//   [gradient]{tip="the slope of the loss: which way it rises, and how steeply"}
//   [beta]{tip="…" src="Lectures/02-risk.md"}      verified: the glossary filter names the source
//   [beta]{tip="…" ai}                              unverified: written by the model
//
// Same shape as the equation card's [text]{.class}, so models and the reader already know it.
// Rendered as a Svelte component in chat (TipToken.svelte); the renderer below is the fallback
// for the paragraph path that renders through parseInline (Notes with inline HTML).

const escapeHtml = (s: string) =>
	s.replace(
		/[&<>"']/g,
		(c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!
	);

// Term: no brackets or newlines, 1–80 chars. Attributes: tip="…" required, src="…" and bare ai optional, any order.
const TIP_RE = /^\[([^\[\]\n]{1,80})\]\{((?:\s*(?:tip|src)="[^"\n]*"|\s*ai\b)+)\s*\}/;
const ATTR_RE = /(tip|src)="([^"\n]*)"|\b(ai)\b/g;

export type TipToken = {
	type: 'tip';
	raw: string;
	term: string;
	tip: string;
	src: string;
	ai: boolean;
};

export function parseTip(src: string): TipToken | undefined {
	const m = TIP_RE.exec(src);
	if (!m) return;
	const attrs: Record<string, string> = {};
	let ai = false;
	for (const a of m[2].matchAll(ATTR_RE)) {
		if (a[3]) ai = true;
		else attrs[a[1]] = a[2].trim();
	}
	if (!attrs.tip) return; // tip="" carries nothing: leave the text as written
	return { type: 'tip', raw: m[0], term: m[1], tip: attrs.tip, src: attrs.src ?? '', ai };
}

export function renderTip(t: TipToken) {
	const src = t.src ? `<span class="o-tip-src">${escapeHtml(t.src)}</span>` : '';
	const ai = t.ai ? ' o-tip-ai' : '';
	return (
		`<span class="o-tip${ai}" tabindex="0">${escapeHtml(t.term)}` +
		`<span class="o-tip-box" role="tooltip">${escapeHtml(t.tip)}${src}</span></span>`
	);
}

export function tipExtension() {
	return {
		name: 'tip',
		level: 'inline' as const,
		start: (src: string) => src.indexOf('['),
		tokenizer(src: string) {
			return parseTip(src);
		},
		renderer(token: any) {
			return renderTip(token as TipToken);
		}
	};
}
