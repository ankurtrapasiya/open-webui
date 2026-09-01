// Which Outis editor theme matches the classes currently on <html>.
//
// The four CodeMirror hosts (common/CodeEditor, chat/FileNav/CellEditor,
// chat/FileNav/FileCodeEditor, chat/Messages/OutputEditView) each used to
// carry their own `isDark ? outisDark : []` ternary, in some cases twice —
// once at mount and once in a MutationObserver that reconfigures on theme
// change. Adding a second theme to four copies of the same decision is how
// they drift apart, so the decision lives here.
//
// Note the order: `outis-light` is checked first because it is a light theme
// and never carries `dark`, while `outis-dark` always does. A user on the
// stock `light` or `her` theme still gets CodeMirror's own default, as before.
//
// The hosts watch <html> for class changes so an open editor recolours when
// the theme is switched. They used to compare `classList.contains('dark')`
// before and after, which cannot see stock-light -> outis-light (neither
// carries `dark`), so they compare `outisEditorThemeKey()` instead.
import type { Extension } from '@codemirror/state';
import { outisDark } from './codemirror-outis-dark-theme';
import { outisLight } from './codemirror-outis-light-theme';

export type OutisEditorThemeKey = 'outis-light' | 'outis-dark' | 'none';

export function outisEditorThemeKey(): OutisEditorThemeKey {
	const cls = document.documentElement.classList;
	if (cls.contains('outis-light')) return 'outis-light';
	if (cls.contains('dark')) return 'outis-dark';
	return 'none';
}

export function outisEditorTheme(): Extension[] {
	switch (outisEditorThemeKey()) {
		case 'outis-light':
			return outisLight;
		case 'outis-dark':
			return outisDark;
		default:
			return [];
	}
}
