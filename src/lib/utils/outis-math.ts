// Outis: tags the KaTeX atoms that CSS alone cannot tell apart, so the maths colour rules
// (outis-theme-shared.css, "Maths colours") can colour every formula by kind. To a selector a run
// of digits is the same bare .mord as ∞, ∂ or a prime, and a trailing × or − is demoted from
// .mbin to .mord. Words inside \text{} are left alone ("Ch 22" is not a number).
const LEAVES = '.katex-html .mord:not(.mathnormal):not(.mathrm):not(.mathbb):not(.mathbf)';
const NUMBER = /^(\d[\d.,]*|\.\d+)$/;
const OPERATOR = /^[+\-−×÷·⋅±∓∗]$/;

export const tagMath = (root: Element | Document) => {
	root.querySelectorAll(LEAVES).forEach((el) => {
		if (el.childElementCount || el.closest('.text')) return;
		const t = el.textContent?.trim() ?? '';
		if (NUMBER.test(t)) el.classList.add('outis-num');
		else if (OPERATOR.test(t)) el.classList.add('outis-op');
	});
};

// Chat answers and notes render KaTeX at different times; one observer covers both.
export const watchMath = () => {
	tagMath(document);
	const observer = new MutationObserver((records) => {
		for (const record of records) {
			for (const node of record.addedNodes) {
				if (!(node instanceof Element)) continue;
				const katex = node.closest('.katex');
				if (katex) tagMath(katex);
				else if (node.querySelector('.katex')) tagMath(node);
			}
		}
	});
	observer.observe(document.body, { childList: true, subtree: true });
	return () => observer.disconnect();
};
