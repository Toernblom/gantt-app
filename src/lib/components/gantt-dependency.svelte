<script lang="ts">
	import type { ScaleTime } from 'd3-scale';
	import type { GanttRow, DependencyType } from '$lib/types';
	import { ROW_HEIGHT } from '$lib/types';
	import { ganttStore } from '$lib/stores/gantt/index.js';
	import { addTime } from '$lib/utils/timeline';

	interface Props {
		sourceRow: GanttRow;
		sourceIndex: number;
		targetRow: GanttRow;
		targetIndex: number;
		dependencyType: DependencyType;
		timeScale: ScaleTime<number, number>;
	}

	let { sourceRow, sourceIndex, targetRow, targetIndex, dependencyType, timeScale }: Props =
		$props();

	const STROKE_COLOR = '#64748b';
	const STROKE_HOVER = '#94a3b8';
	const ELBOW = 14;
	const R = 6; // corner radius

	let hovered = $state(false);

	/**
	 * Finish edge = right side of the end-date column (endDate + 1 snap unit)
	 * because endDate is inclusive.
	 */
	let snapUnit = $derived(ganttStore.zoomConfig.snapUnit);

	const DIAMOND_HALF = 9; // must match gantt-milestone.svelte HALF

	function finishEdge(row: GanttRow): number {
		if (row.isMilestone) return timeScale(new Date(row.startDate)) + DIAMOND_HALF;
		return timeScale(addTime(new Date(row.endDate), 1, snapUnit));
	}
	function startEdge(row: GanttRow): number {
		if (row.isMilestone) return timeScale(new Date(row.startDate)) - DIAMOND_HALF;
		return timeScale(new Date(row.startDate));
	}

	let points = $derived.by(() => {
		const leaveFromFinish = dependencyType === 'FS' || dependencyType === 'FF';
		const arriveAtFinish = dependencyType === 'FF' || dependencyType === 'SF';

		const sx = leaveFromFinish ? finishEdge(sourceRow) : startEdge(sourceRow);
		const tx = arriveAtFinish ? finishEdge(targetRow) : startEdge(targetRow);
		const sy = sourceIndex * ROW_HEIGHT + ROW_HEIGHT / 2;
		const ty = targetIndex * ROW_HEIGHT + ROW_HEIGHT / 2;

		return { sx, sy, tx, ty };
	});

	/**
	 * Rounded-corner orthogonal path using quadratic bezier (Q) at each elbow.
	 */
	let path = $derived.by(() => {
		const { sx, sy, tx, ty } = points;
		const leaveFromFinish = dependencyType === 'FS' || dependencyType === 'FF';
		const arriveAtStart = dependencyType === 'FS' || dependencyType === 'SS';
		const departDir = leaveFromFinish ? 1 : -1;
		const dy = ty - sy;
		const vDir = dy > 0 ? 1 : dy < 0 ? -1 : 0;

		const hasSpace = leaveFromFinish
			? sx + ELBOW * 2 < tx
			: sx - ELBOW * 2 > tx;

		if (hasSpace && vDir !== 0) {
			// S-route with rounded corners at midpoint
			const midX = (sx + tx) / 2;
			return [
				`M ${sx},${sy}`,
				`H ${midX - R}`,
				`Q ${midX},${sy} ${midX},${sy + vDir * R}`,
				`V ${ty - vDir * R}`,
				`Q ${midX},${ty} ${midX + (tx > midX ? R : -R)},${ty}`,
				`H ${tx}`,
			].join(' ');
		}

		if (hasSpace && vDir === 0) {
			return `M ${sx},${sy} H ${tx}`;
		}

		// Complex: route around via elbows
		const elbowX = sx + departDir * ELBOW;
		const midY = (sy + ty) / 2;
		const arriveDir = arriveAtStart ? -1 : 1;
		const arriveElbowX = tx + arriveDir * ELBOW;

		if (vDir !== 0) {
			return [
				`M ${sx},${sy}`,
				`H ${elbowX - departDir * R}`,
				`Q ${elbowX},${sy} ${elbowX},${sy + vDir * R}`,
				`V ${midY - vDir * R}`,
				`Q ${elbowX},${midY} ${elbowX + (arriveElbowX > elbowX ? R : -R)},${midY}`,
				`H ${arriveElbowX - (arriveElbowX > elbowX ? R : -R)}`,
				`Q ${arriveElbowX},${midY} ${arriveElbowX},${midY + vDir * R}`,
				`V ${ty - vDir * R}`,
				`Q ${arriveElbowX},${ty} ${arriveElbowX + (arriveAtStart ? R : -R)},${ty}`,
				`H ${tx}`,
			].join(' ');
		}

		// Same row detour
		const detourY = sy - ROW_HEIGHT;
		return [
			`M ${sx},${sy}`,
			`H ${elbowX}`,
			`V ${detourY}`,
			`H ${arriveElbowX}`,
			`V ${ty}`,
			`H ${tx}`,
		].join(' ');
	});

	let markerId = $derived(`dep-arrow-${sourceRow.id}-${targetRow.id}`);
</script>

<defs>
	<marker
		id={markerId}
		markerWidth="8"
		markerHeight="6"
		refX="8"
		refY="3"
		orient="auto"
	>
		<path d="M 0 0 L 8 3 L 0 6 Z" fill={hovered ? STROKE_HOVER : STROKE_COLOR} />
	</marker>
</defs>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<path
	d={path}
	stroke={hovered ? STROKE_HOVER : STROKE_COLOR}
	stroke-width="1.5"
	fill="none"
	marker-end="url(#{markerId})"
	onmouseenter={() => (hovered = true)}
	onmouseleave={() => (hovered = false)}
/>
