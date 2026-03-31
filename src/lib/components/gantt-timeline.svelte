<script lang="ts">
	import type { ScaleTime } from 'd3-scale';
	import { ganttStore } from '$lib/stores/gantt/ganttStore.svelte.js';
	import { interactionStore } from '$lib/stores/interaction/interactionStore.svelte.js';
	import { ROW_HEIGHT } from '$lib/types';

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
</script>

<!-- SVG canvas: grid, bars, dependencies, today marker -->
<svg
	width={totalWidth}
	height={totalHeight}
	style="display: block;"
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
		{#if ganttStore.selectedTaskId === row.id}
			<rect
				x={0}
				y={i * ROW_HEIGHT}
				width={totalWidth}
				height={ROW_HEIGHT}
				fill="white"
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
</svg>
