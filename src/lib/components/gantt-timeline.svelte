<script lang="ts">
	import type { ScaleTime } from 'd3-scale';
	import { ganttStore } from '$lib/stores/gantt/ganttStore.svelte.js';
	import { interactionStore } from '$lib/stores/interaction/interactionStore.svelte.js';
	import { ROW_HEIGHT } from '$lib/types';
	import { addTime } from '$lib/utils/timeline';

	import GanttGrid from './gantt-grid.svelte';
	import GanttBar from './gantt-bar.svelte';
	import GanttMilestone from './gantt-milestone.svelte';
	import GanttTodayMarker from './gantt-today-marker.svelte';
	import GanttDependency from './gantt-dependency.svelte';

	interface Props {
		timeScale: ScaleTime<number, number>;
		totalWidth: number;
		totalHeight: number;
		dateRange: [Date, Date];
	}

	let { timeScale, totalWidth, totalHeight, dateRange }: Props = $props();

	// -------------------------------------------------------------------------
	// Box-select (rubber-band rectangle on empty SVG space)
	// -------------------------------------------------------------------------

	let svgEl = $state<SVGSVGElement | undefined>(undefined);
	let isBoxing = $state(false);
	let boxStartX = $state(0);
	let boxStartY = $state(0);
	let boxCurX = $state(0);
	let boxCurY = $state(0);

	function clientToSvg(clientX: number, clientY: number): { x: number; y: number } {
		if (!svgEl) return { x: clientX, y: clientY };
		const pt = svgEl.createSVGPoint();
		pt.x = clientX;
		pt.y = clientY;
		const ctm = svgEl.getScreenCTM();
		if (!ctm) return { x: clientX, y: clientY };
		const p = pt.matrixTransform(ctm.inverse());
		return { x: p.x, y: p.y };
	}

	let boxRect = $derived.by(() => {
		if (!isBoxing) return null;
		const x = Math.min(boxStartX, boxCurX);
		const y = Math.min(boxStartY, boxCurY);
		const w = Math.abs(boxCurX - boxStartX);
		const h = Math.abs(boxCurY - boxStartY);
		return { x, y, w, h };
	});

	function handleSvgMouseDown(e: MouseEvent) {
		// Only start box-select on direct SVG background click (not on bars)
		if (e.button !== 0) return;
		if ((e.target as Element).tagName !== 'svg' && (e.target as Element).tagName !== 'rect') {
			// Allow clicks on grid rects but not on bar elements
			const target = e.target as Element;
			if (target.closest('g[role="button"]')) return;
		}
		// Don't start box-select while linking
		if (interactionStore.isLinking) return;

		const p = clientToSvg(e.clientX, e.clientY);
		boxStartX = p.x;
		boxStartY = p.y;
		boxCurX = p.x;
		boxCurY = p.y;
		isBoxing = true;

		window.addEventListener('mousemove', onBoxMove);
		window.addEventListener('mouseup', onBoxUp);
	}

	function onBoxMove(e: MouseEvent) {
		const p = clientToSvg(e.clientX, e.clientY);
		boxCurX = p.x;
		boxCurY = p.y;
	}

	function onBoxUp() {
		window.removeEventListener('mousemove', onBoxMove);
		window.removeEventListener('mouseup', onBoxUp);
		isBoxing = false;

		const x1 = Math.min(boxStartX, boxCurX);
		const x2 = Math.max(boxStartX, boxCurX);
		const y1 = Math.min(boxStartY, boxCurY);
		const y2 = Math.max(boxStartY, boxCurY);

		// Ignore tiny rectangles (just a click)
		if (x2 - x1 < 5 && y2 - y1 < 5) {
			ganttStore.selectTask(null);
			return;
		}

		// Hit-test: find bars that overlap the rectangle
		const snapUnit = ganttStore.zoomConfig.snapUnit;
		const ids: string[] = [];
		for (let i = 0; i < ganttStore.rows.length; i++) {
			const row = ganttStore.rows[i];
			if (row.isMilestone) {
				const cx = timeScale(new Date(row.startDate));
				const cy = i * ROW_HEIGHT + ROW_HEIGHT / 2;
				if (cx >= x1 && cx <= x2 && cy >= y1 && cy <= y2) ids.push(row.id);
			} else {
				const barLeft = timeScale(new Date(row.startDate));
				const barRight = timeScale(addTime(new Date(row.endDate), 1, snapUnit));
				const barTop = i * ROW_HEIGHT + 6;
				const barBottom = (i + 1) * ROW_HEIGHT - 6;
				// Rectangle overlap test
				if (barRight >= x1 && barLeft <= x2 && barBottom >= y1 && barTop <= y2) {
					ids.push(row.id);
				}
			}
		}

		if (ids.length > 0) {
			ganttStore.setMultiSelection(ids);
		}
	}
</script>

<!-- SVG canvas: grid, bars, dependencies, today marker -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<svg
	bind:this={svgEl}
	width={totalWidth}
	height={totalHeight}
	style="display: block;"
	onmousedown={handleSvgMouseDown}
>
	<GanttGrid
		{timeScale}
		zoomConfig={ganttStore.zoomConfig}
		{totalWidth}
		{totalHeight}
		rows={ganttStore.rows}
		{dateRange}
	/>

	<!-- Hover/selection highlight bands -->
	{#each ganttStore.rows as row, i (row.id)}
		{#if ganttStore.hoveredTaskId === row.id}
			<rect
				x={0}
				y={i * ROW_HEIGHT}
				width={totalWidth}
				height={ROW_HEIGHT}
				fill="white"
				fill-opacity="0.04"
				pointer-events="none"
			/>
		{/if}
		{#if ganttStore.selectedTaskId === row.id || ganttStore.isMultiSelected(row.id)}
			<rect
				x={0}
				y={i * ROW_HEIGHT}
				width={totalWidth}
				height={ROW_HEIGHT}
				fill={ganttStore.isMultiSelected(row.id) ? '#3b82f6' : 'white'}
				fill-opacity="0.06"
				pointer-events="none"
			/>
		{/if}
	{/each}

	<!-- Task bars and milestone markers -->
	{#each ganttStore.rows as row, i (row.id)}
		{#if row.isMilestone}
			<GanttMilestone {row} rowIndex={i} {timeScale} />
		{:else}
			<GanttBar {row} rowIndex={i} {timeScale} />
		{/if}
	{/each}

	<!-- Dependency arrows -->
	{#each ganttStore.dependencyPairs as dep (dep.key)}
		<GanttDependency
			sourceRow={dep.source}
			sourceIndex={dep.sourceIndex}
			targetRow={dep.target}
			targetIndex={dep.targetIndex}
			dependencyType={dep.type}
			{timeScale}
		/>
	{/each}

	<!-- Today marker -->
	<GanttTodayMarker {timeScale} {totalHeight} />

	<!-- Dependency link rubber-band (Shift+click source → click target) -->
	{#if interactionStore.isLinking}
		<!-- Highlight the hovered target bar -->
		{#if ganttStore.hoveredTaskId && ganttStore.hoveredTaskId !== interactionStore.linkSourceId}
			{@const targetIdx = ganttStore.rows.findIndex(r => r.id === ganttStore.hoveredTaskId)}
			{#if targetIdx >= 0}
				<rect
					x={0}
					y={targetIdx * ROW_HEIGHT}
					width={totalWidth}
					height={ROW_HEIGHT}
					fill="#3b82f6"
					fill-opacity="0.12"
					pointer-events="none"
				/>
			{/if}
		{/if}

		<!-- Rubber-band line from source to cursor -->
		<line
			x1={interactionStore.linkSourceX}
			y1={interactionStore.linkSourceY}
			x2={interactionStore.linkCursorX}
			y2={interactionStore.linkCursorY}
			stroke="#3b82f6"
			stroke-width="2"
			stroke-dasharray="6,4"
			opacity="0.7"
			pointer-events="none"
		/>
		<!-- Small circle at source anchor -->
		<circle
			cx={interactionStore.linkSourceX}
			cy={interactionStore.linkSourceY}
			r="4"
			fill="#3b82f6"
			opacity="0.8"
			pointer-events="none"
		/>
	{/if}

	<!-- Box-select rubber-band rectangle -->
	{#if boxRect}
		<rect
			x={boxRect.x}
			y={boxRect.y}
			width={boxRect.w}
			height={boxRect.h}
			fill="#3b82f6"
			fill-opacity="0.08"
			stroke="#3b82f6"
			stroke-width="1"
			stroke-opacity="0.4"
			stroke-dasharray="4,3"
			pointer-events="none"
		/>
	{/if}
</svg>
