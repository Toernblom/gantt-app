<script lang="ts">
	import type { ScaleTime } from 'd3-scale';
	import type { ZoomConfig } from '$lib/types';
	import { getTopHeaderGroups, getBottomHeaderCells, isWeekend } from '$lib/utils/timeline';

	interface Props {
		timeScale: ScaleTime<number, number>;
		zoomConfig: ZoomConfig;
		totalWidth: number;
		dateRange: [Date, Date];
	}

	let { timeScale, zoomConfig, totalWidth, dateRange }: Props = $props();

	let topGroups = $derived(getTopHeaderGroups(dateRange[0], dateRange[1], zoomConfig));
	let bottomCells = $derived(getBottomHeaderCells(dateRange[0], dateRange[1], zoomConfig));

	let showWeekendTint = $derived(
		zoomConfig.columnUnit === 'hour' || zoomConfig.columnUnit === 'day',
	);

	function cellDate(cellX: number): Date {
		return timeScale.invert(cellX + zoomConfig.columnWidth / 2);
	}
</script>

<!--
  Dual-row header. Sticky positioning is handled by the parent grid cell
  in gantt-chart.svelte (sticky top:0).
-->
<div
	class="border-b"
	style="width: {totalWidth}px; height: 64px;"
>
	<!-- Top row: coarser groupings (month, quarter, year) -->
	<div class="relative" style="height: 32px;">
		{#each topGroups as group (group.startX)}
			<div
				class="absolute inset-y-0 flex items-center overflow-hidden border-r px-2"
				style="left: {group.startX}px; width: {group.width}px;"
			>
				<span class="truncate text-xs font-medium text-muted-foreground">
					{group.label}
				</span>
			</div>
		{/each}
	</div>

	<!-- Bottom row: finer per-column cells -->
	<div class="relative border-t" style="height: 32px;">
		{#each bottomCells as cell (cell.x)}
			{@const isWknd = showWeekendTint && isWeekend(cellDate(cell.x))}
			<div
				class="absolute inset-y-0 flex items-center justify-center overflow-hidden border-r"
				class:bg-muted={isWknd}
				class:opacity-60={isWknd}
				style="left: {cell.x}px; width: {cell.width}px;"
			>
				<span
					class="text-xs text-muted-foreground"
					class:font-medium={isWknd}
				>
					{cell.label}
				</span>
			</div>
		{/each}
	</div>
</div>
