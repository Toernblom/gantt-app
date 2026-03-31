<script lang="ts">
	import type { ScaleTime } from 'd3-scale';
	import type { ZoomConfig, GanttRow } from '$lib/types';
	import { ROW_HEIGHT } from '$lib/types';
	import { getBottomHeaderCells, isWeekend } from '$lib/utils/timeline';

	interface Props {
		timeScale: ScaleTime<number, number>;
		zoomConfig: ZoomConfig;
		totalWidth: number;
		totalHeight: number;
		rows: GanttRow[];
		dateRange: [Date, Date];
	}

	let { timeScale, zoomConfig, totalWidth, totalHeight, rows, dateRange }: Props = $props();

	// Column boundaries for vertical lines and weekend detection
	let bottomCells = $derived(getBottomHeaderCells(dateRange[0], dateRange[1], zoomConfig));

	// Weekend shading only in day/week zoom (hour or day column unit)
	let showWeekendTint = $derived(
		zoomConfig.columnUnit === 'hour' || zoomConfig.columnUnit === 'day',
	);

	// Horizontal row boundaries: one line per row divider (including bottom edge)
	let rowCount = $derived(rows.length);

	// Derive date for a cell by inverting the midpoint of its column
	function cellDate(cellX: number): Date {
		return timeScale.invert(cellX + zoomConfig.columnWidth / 2);
	}
</script>

<!--
  All grid elements live inside a single <g> so the parent SVG can position
  this group without extra wrappers.
-->
<g class="gantt-grid">
	<!-- Weekend shading rects — drawn first so lines render on top -->
	{#if showWeekendTint}
		{#each bottomCells as cell (cell.x)}
			{#if isWeekend(cellDate(cell.x))}
				<rect
					x={cell.x}
					y={0}
					width={cell.width}
					height={totalHeight}
					fill="var(--muted)"
					opacity="0.35"
				/>
			{/if}
		{/each}
	{/if}

	<!-- Vertical lines at each column boundary -->
	{#each bottomCells as cell (cell.x)}
		<line
			x1={cell.x + cell.width}
			y1={0}
			x2={cell.x + cell.width}
			y2={totalHeight}
			stroke="var(--border)"
			stroke-width="1"
			opacity="0.5"
		/>
	{/each}

	<!-- Horizontal lines at each row boundary -->
	{#each { length: rowCount } as _, i}
		<line
			x1={0}
			y1={(i + 1) * ROW_HEIGHT}
			x2={totalWidth}
			y2={(i + 1) * ROW_HEIGHT}
			stroke="var(--border)"
			stroke-width="1"
			opacity="0.5"
		/>
	{/each}
</g>
