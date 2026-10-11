/**
 * The editing sheet of a task, or of a new one, which a task's page and the new
 * task's page hold alike.
 */
import type { Extras, RepositoryState } from './repository.svelte.ts';
import { newTags, tagOptions } from '../tatr/stats.ts';
import { differing, type TaskFields } from '../tatr/task-fields.ts';

/** What a sheet reads of the repository: its tasks and the descriptions of its tags. */
type Read = Pick<RepositoryState, 'tasks' | 'tags'>;

export class Sheet {
	/** The fields the sheet was opened on, which a save compares the draft with. */
	readonly opened: TaskFields;
	draft: TaskFields;
	/** What the reader typed to describe each new tag, by tag. */
	described = $state<Record<string, string>>({});
	readonly #repo: Read;

	readonly dirty = $derived.by(() => differing(this.opened, this.draft).length > 0);
	/** The repository's tags, which the tags field offers. */
	readonly known = $derived.by(() => tagOptions(this.#repo.tasks, this.#repo.tags.descriptions));
	/** The draft's tags new to the repository, which Save describes in `tasks/tags`. */
	readonly fresh = $derived.by(() =>
		newTags(this.draft.tags, this.#repo.tasks, this.#repo.tags.descriptions)
	);

	constructor(opened: TaskFields, repo: Read) {
		this.opened = opened;
		this.#repo = repo;
		// Its own tags, so that no edit of the draft reaches what it was opened on.
		this.draft = $state({ ...opened, tags: [...opened.tags] });
	}

	/** What Save writes besides the task's file: the descriptions typed for new tags, blank ones left out. */
	extras(): Extras {
		const tags = new Map<string, string>();
		for (const tag of this.fresh) {
			const description = this.described[tag]?.trim();
			if (description) tags.set(tag, description);
		}
		return { tags };
	}
}
