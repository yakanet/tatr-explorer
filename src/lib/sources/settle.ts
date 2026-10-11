/**
 * Lets a burst of changes settle before acting on it: one save can be several
 * writes, a swap file and a rename. Shared by the sources that follow a folder,
 * in the browser and in the dev server alike, so that both wait the same time.
 */
const SETTLE_MS = 150;

/** Calls `onChange` once the `trigger` calls of a burst have been quiet a moment. */
export function settle(onChange: () => void): { trigger: () => void; cancel: () => void } {
	let timer: ReturnType<typeof setTimeout> | undefined;
	return {
		trigger() {
			clearTimeout(timer);
			timer = setTimeout(onChange, SETTLE_MS);
		},
		cancel() {
			clearTimeout(timer);
		}
	};
}
