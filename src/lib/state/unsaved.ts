/** The question a page with an unsaved draft asks before it is left. */
import { beforeNavigate } from '$app/navigation';

/**
 * Asks `question` before leaving the page while `unsaved` holds, and stays
 * when the reader says no. Call it while a component initialises, as
 * `beforeNavigate` requires.
 */
export function askBeforeLeaving(unsaved: () => boolean, question: string): void {
	beforeNavigate(({ cancel, type }) => {
		if (!unsaved()) return;
		// Leaving the site, the browser asks by itself once the navigation is cancelled.
		if (type === 'leave') return cancel();
		if (!confirm(question)) cancel();
	});
}
