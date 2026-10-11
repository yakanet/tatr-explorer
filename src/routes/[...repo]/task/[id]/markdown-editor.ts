/**
 * The editor `MarkdownEditor` loads: prism-code-editor, whose real `<textarea>`
 * keeps what is saved exactly as typed, and GitHub's toolbar element with the
 * icons of its buttons.
 */
import '@github/markdown-toolbar-element';
import { createEditor } from 'prism-code-editor';
import { setSelection } from 'prism-code-editor/utils';
import 'prism-code-editor/layout.css';
import 'prism-code-editor/prism/languages/markdown';
import bold from 'virtual:icons/lucide:bold.svg';
import code from 'virtual:icons/lucide:code.svg';
import heading from 'virtual:icons/lucide:heading.svg';
import image from 'virtual:icons/lucide:image.svg';
import italic from 'virtual:icons/lucide:italic.svg';
import link from 'virtual:icons/lucide:link.svg';
import list from 'virtual:icons/lucide:list.svg';
import taskList from 'virtual:icons/lucide:list-todo.svg';
import quote from 'virtual:icons/lucide:text-quote.svg';
import './markdown-editor.css';

/** A button of the toolbar: the element of GitHub's toolbar that does it, its name and its icon. */
export interface Button {
	tag: string;
	label: string;
	icon: { viewBox: string; body: string };
	/** Whether it starts a new group of buttons. */
	group?: boolean;
}

export const BUTTONS: Button[] = [
	{ tag: 'md-bold', label: 'Bold', icon: bold },
	{ tag: 'md-italic', label: 'Italic', icon: italic },
	{ tag: 'md-code', label: 'Code', icon: code },
	{ tag: 'md-header', label: 'Heading', icon: heading, group: true },
	{ tag: 'md-quote', label: 'Quote', icon: quote },
	{ tag: 'md-unordered-list', label: 'List', icon: list, group: true },
	{ tag: 'md-task-list', label: 'Task list', icon: taskList },
	{ tag: 'md-link', label: 'Link', icon: link, group: true },
	{ tag: 'md-image', label: 'Image', icon: image }
];

/**
 * Mounts an editor holding `value` in `container`, whose textarea takes `id`
 * for the toolbar to find it and `label` for a screen reader. Calls `oninput`
 * with the text after each change, and returns how to remove the editor.
 */
export function mountEditor(
	container: HTMLElement,
	{ value, id, label }: { value: string; id: string; label: string },
	oninput: (value: string) => void
): () => void {
	// Without its commands extension the editor leaves Tab alone, so the key
	// still moves the focus out of the field.
	const editor = createEditor(container, {
		language: 'markdown',
		value,
		wordWrap: true,
		lineNumbers: false,
		onUpdate: oninput
	});
	const { textarea } = editor;
	textarea.id = id;
	textarea.setAttribute('aria-label', label);
	// The editor ignores the selection for a moment after each input, so it misses
	// the one the toolbar makes and leaves its textarea over the highlighted text.
	// The microtask runs once the toolbar's handler is done, before any paint.
	textarea.addEventListener('input', () =>
		queueMicrotask(() => setSelection(editor, ...editor.getSelection()))
	);
	return () => {
		// The editor lets go of its document listener on blur, which removing a
		// focused textarea does not fire everywhere.
		textarea.blur();
		editor.remove();
	};
}
