/**
 * The editing sheet of a task, or of a new one, which a task's page and the new
 * task's page hold alike.
 */
import type { Extras, FileWrite, RepositoryState } from './repository.svelte.ts';
import { attachmentPath, linkedPaths, type RenderOptions } from '../render/markdown.ts';
import { attachmentName, wantedName } from '../tatr/attachments.ts';
import { newTags, tagOptions } from '../tatr/stats.ts';
import { describedTagsFile, TAGS_FILE } from '../tatr/tags-file.ts';
import { differing, type TaskFields } from '../tatr/task-fields.ts';
import type { Task } from '../tatr/task.ts';

/** What a sheet reads of the repository: its tasks and the descriptions of its tags. */
type Read = Pick<RepositoryState, 'tasks' | 'tags'>;

/** A file pasted or dropped into the description, which Save writes into the task's folder. */
interface PendingFile {
	name: string;
	file: Blob;
	/** A `blob:` URL, which shows it in the preview until it is written. */
	url: string;
}

export class Sheet {
	/** The fields the sheet was opened on, which a save compares the draft with. */
	readonly opened: TaskFields;
	draft: TaskFields;
	/** What the reader typed to describe each new tag, by tag. */
	described = $state<Record<string, string>>({});
	/** The files pasted or dropped, not written yet. */
	#files = $state.raw<PendingFile[]>([]);
	readonly #repo: Read;
	/** The names the task's folder holds already, those the sheet wrote included. */
	readonly #held: Set<string>;

	readonly dirty = $derived.by(() => differing(this.opened, this.draft).length > 0);
	/** The repository's tags, which the tags field offers. */
	readonly known = $derived.by(() => tagOptions(this.#repo.tasks, this.#repo.tags.descriptions));
	/** The draft's tags new to the repository, which Save describes in `tasks/tags`. */
	readonly fresh = $derived.by(() =>
		newTags(this.draft.tags, this.#repo.tasks, this.#repo.tags.descriptions)
	);

	/** Opens on `opened`, the fields of `task`, or those of a new task when there is none. */
	constructor(opened: TaskFields, repo: Read, task?: Task) {
		this.opened = opened;
		this.#repo = repo;
		this.#held = new Set((task?.attachments ?? []).map((attachment) => attachment.name));
		// Its own tags, so that no edit of the draft reaches what it was opened on.
		this.draft = $state({ ...opened, tags: [...opened.tags] });
	}

	/**
	 * Keeps a file pasted or dropped until Save, under a name the task's
	 * folder and the sheet do not hold yet, and returns its link for the
	 * description.
	 */
	readonly attach = (file: File, now = new Date()): string => {
		const taken = new Set([...this.#held, ...this.#files.map((pending) => pending.name)]);
		const name = attachmentName(wantedName(file.name, now), taken);
		this.#files = [...this.#files, { name, file, url: URL.createObjectURL(file) }];
		return linkTo(name, file.type);
	};

	/** `options` for the preview, in which a file pasted or dropped shows before it is written. */
	preview(options: RenderOptions): RenderOptions {
		return {
			...options,
			assetUrl: (path) => {
				const pending = this.#files.find(
					(candidate) => attachmentPath(options.taskId, candidate.name) === path
				);
				return pending?.url ?? options.assetUrl(path);
			}
		};
	}

	/**
	 * What Save writes besides the task's file: the files the description still
	 * links, as the preview finds its links, then the descriptions typed for new
	 * tags, blank ones left out.
	 */
	extras(): Extras {
		const description = this.draft.description;
		const files = this.#files;
		const tags = new Map<string, string>();
		for (const tag of this.fresh) {
			const typed = this.described[tag]?.trim();
			if (typed) tags.set(tag, typed);
		}
		return (id) => {
			const linked = linkedPaths(description, id);
			const writes: FileWrite[] = [];
			for (const pending of files) {
				const path = `tasks/${id}/${pending.name}`;
				if (!linked.has(path)) continue;
				writes.push({ path, contents: pending.file, onwritten: () => this.#forget(pending) });
			}
			if (tags.size > 0) {
				writes.push({ path: TAGS_FILE, rewrite: (before) => describedTagsFile(before, tags) });
			}
			return writes;
		};
	}

	/**
	 * Lets go of a file once written, which the preview then finds where the
	 * source has it, and keeps its name as taken.
	 */
	#forget(pending: PendingFile): void {
		URL.revokeObjectURL(pending.url);
		this.#files = this.#files.filter((other) => other !== pending);
		this.#held.add(pending.name);
	}

	/** Lets go of the previews' URLs, once the sheet is closed. */
	close(): void {
		for (const pending of this.#files) URL.revokeObjectURL(pending.url);
		this.#files = [];
	}
}

/** The Markdown for a file of the task's folder: an image is shown, any other file linked. */
function linkTo(name: string, type: string): string {
	const link = `[${name}](./${name})`;
	if (type.startsWith('image/')) return `!${link}`;
	return link;
}
