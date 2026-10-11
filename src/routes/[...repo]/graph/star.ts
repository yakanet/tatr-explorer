/**
 * The geometry of a star card's drawing: the pivot in the middle, its
 * neighbours on a ring, and a spoke with an arrowhead for each link.
 */
import type { StarCard, StarLink } from '#lib/tatr/graph.ts';

export const SIZE = 200;
const PIVOT_R = 18;
const NODE_R = 13;
const RING = 74;
const HEAD_LENGTH = 10;
const HEAD_WIDTH = 8;

export interface Point {
	x: number;
	y: number;
	r: number;
}

/**
 * Returns an arrowhead pointing at `at` along the unit vector (ux, uy), and
 * the point where its line should stop.
 *
 * The head is a polygon rather than an SVG `marker`, because a marker is
 * placed by `refX` in its own scaled viewBox and sized in stroke widths, so
 * its tip cannot be set exactly on the circle.
 */
function head(at: Point, ux: number, uy: number) {
	const tipX = at.x - ux * (at.r + 1);
	const tipY = at.y - uy * (at.r + 1);
	const baseX = tipX - ux * HEAD_LENGTH;
	const baseY = tipY - uy * HEAD_LENGTH;
	const px = -uy * (HEAD_WIDTH / 2);
	const py = ux * (HEAD_WIDTH / 2);
	return {
		// The line stops just inside the base, because a line running under
		// the head would show through its edges.
		x: baseX + ux,
		y: baseY + uy,
		points: `${tipX},${tipY} ${baseX + px},${baseY + py} ${baseX - px},${baseY - py}`
	};
}

/** Draws one spoke from rim to rim, with a head on each end it points at. */
function spoke(from: Point, to: Point, both: boolean) {
	const dx = to.x - from.x;
	const dy = to.y - from.y;
	const length = Math.hypot(dx, dy) || 1;
	const ux = dx / length;
	const uy = dy / length;
	const forward = head(to, ux, uy);
	const line = {
		x1: from.x + ux * (from.r + 2),
		y1: from.y + uy * (from.r + 2),
		x2: forward.x,
		y2: forward.y,
		heads: [forward.points]
	};
	if (!both) return line;
	const back = head(from, -ux, -uy);
	return { ...line, x1: back.x, y1: back.y, heads: [...line.heads, back.points] };
}

/** The spoke between the pivot and a neighbour, drawn from the citing task to the cited one. */
function spokeOf(pivot: Point, at: Point, kind: StarLink['kind']) {
	if (kind === 'in') return spoke(at, pivot, false);
	return spoke(pivot, at, kind === 'both');
}

/** The angle of neighbour `i` of `count` on the ring. */
function angleOf(i: number, count: number) {
	// A lone neighbour sits on the right, where a reader looks next.
	if (count === 1) return 0;
	return Math.PI + (i * 2 * Math.PI) / count;
}

/**
 * Lays out the card's drawing, with the pivot in the middle and its neighbours
 * on a ring around it.
 *
 * Going round from the left in list order, the tasks citing the pivot come
 * first, the mutual ones over the top and the ones it cites on the right, so
 * every card reads the same way. The node numbers match the list beside it.
 */
export function drawing(card: StarCard) {
	const pivot: Point = { x: SIZE / 2, y: SIZE / 2, r: PIVOT_R };
	const count = card.links.length;
	const nodes = card.links.map(({ task, kind }, i) => {
		const angle = angleOf(i, count);
		const at: Point = {
			x: pivot.x + RING * Math.cos(angle),
			y: pivot.y + RING * Math.sin(angle),
			r: NODE_R
		};
		const line = spokeOf(pivot, at, kind);
		return { task, kind, at, line };
	});
	return { pivot, nodes };
}
