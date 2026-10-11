/**
 * The editing sheet of a task, or of a new one, which a task's page and the new
 * task's page hold alike.
 */
import type { Extras, FileWrite, RepositoryState } from './repository.svelte.ts';
import { attachmentPath, type RenderOptions } from '../render/markdown.ts';
import { attachmentName, wantedImageName } from '../tatr/attachments.ts';
import { newTags, tagOptions } from '../tatr/stats.ts';
import { describedTagsFile, TAGS_FILE } from '../tatr/tags-file.ts';
import { differing, type TaskFields } from '../tatr/task-fields.ts';
import type { Task } from '../tatr/task.ts';

/** What a sheet reads of the repository: its tasks and the descriptions of its tags. */
type Read = Pick<RepositoryState, 'tasks' | 'tags'>;

/** An image pasted or dropped into the description, which Save writes into the task's folder. */
interface PendingImage {
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
	/** The images pasted or dropped, not written yet. */
	#images = $state.raw<PendingImage[]>([]);
	readonly #repo: Read;
	/** The names the task's folder holds already. */
	readonly #held: readonly string[];

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
		this.#held = (task?.attachments ?? []).map((attachment) => attachment.name);
		// Its own tags, so that no edit of the draft reaches what it was opened on.
		this.draft = $state({ ...opened, tags: [...opened.tags] });
	}

	/**
	 * Keeps an image pasted or dropped until Save, under a name the task's
	 * folder and the sheet do not hold yet, and returns its link for the
	 * description.
	 */
	readonly attach = (file: File, now = new Date()): string => {
		const taken = new Set([...this.#held, ...this.#images.map((image) => image.name)]);
		const name = attachmentName(wantedImageName(file.name, now), taken);
		this.#images = [...this.#images, { name, file, url: URL.createObjectURL(file) }];
		return `![${name}](./${name})`;
	};

	/** `options` for the preview, in which an image pasted or dropped shows before it is written. */
	preview(options: RenderOptions): RenderOptions {
		return {
			...options,
			assetUrl: (path) => {
				const pending = this.#images.find(
					(image) => attachmentPath(options.taskId, image.name) === path
				);
				return pending?.url ?? options.assetUrl(path);
			}
		};
	}

	/**
	 * What Save writes besides the task's file: the images the description
	 * still links, then the descriptions typed for new tags, blank ones left out.
	 */
	extras(): Extras {
		const images = this.#images.filter((image) => this.draft.description.includes(image.name));
		const tags = new Map<string, string>();
		for (const tag of this.fresh) {
			const description = this.described[tag]?.trim();
			if (description) tags.set(tag, description);
		}
		return (id) => {
			const files: FileWrite[] = images.map(({ name, file }) => ({
				path: `tasks/${id}/${name}`,
				contents: file
			}));
			if (tags.size > 0) {
				files.push({ path: TAGS_FILE, rewrite: (before) => describedTagsFile(before, tags) });
			}
			return files;
		};
	}

	/** Lets go of the previews' URLs, once the sheet is closed. */
	close(): void {
		for (const image of this.#images) URL.revokeObjectURL(image.url);
		this.#images = [];
	}
}
