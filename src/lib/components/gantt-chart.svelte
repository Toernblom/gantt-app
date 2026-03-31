<script lang="ts">
	import GanttTaskList from "./gantt-task-list.svelte";
	import GanttTimeline from "./gantt-timeline.svelte";
	import GanttHeader from "./gantt-header.svelte";

	import { TASK_LIST_WIDTH, ROW_HEIGHT } from "$lib/types.js";
	import { ganttStore } from "$lib/stores/gantt/index.js";
	import { timelineStore } from "$lib/stores/timeline/index.js";
	import LayoutGridIcon from "@tabler/icons-svelte/icons/layout-grid";

	const HEADER_HEIGHT = 64;

	// -------------------------------------------------------------------------
	// Scroll to center selected task (both axes)
	// -------------------------------------------------------------------------

	let scrollEl = $state<HTMLDivElement | undefined>(undefined);

	$effect(() => {
		const id = ganttStore.selectedTaskId;
		if (!id || !scrollEl) return;

		const rowIndex = ganttStore.rows.findIndex(r => r.id === id);
		if (rowIndex === -1) return;

		const row = ganttStore.rows[rowIndex];
		const tScale = timelineStore.timeScale;

		// With CSS zoom, layout coordinates are already scaled by the browser,
		// so scroll offsets are in zoomed space — no manual scale factor needed.
		const rowTop = HEADER_HEIGHT + rowIndex * ROW_HEIGHT;
		const rowCenter = rowTop + ROW_HEIGHT / 2;
		const targetScrollTop = rowCenter - scrollEl.clientHeight / 2;

		const barLeft = tScale(new Date(row.startDate));
		const barRight = tScale(new Date(row.endDate));
		const barCenter = TASK_LIST_WIDTH + (barLeft + barRight) / 2;
		const targetScrollLeft = barCenter - scrollEl.clientWidth / 2;

		scrollEl.scrollTo({
			top: Math.max(0, targetScrollTop),
			left: Math.max(0, targetScrollLeft),
			behavior: 'smooth',
		});
	});

	// -------------------------------------------------------------------------
	// Ctrl+wheel zoom (UI scale)
	// -------------------------------------------------------------------------

	function handleWheel(e: WheelEvent) {
		if (!e.ctrlKey && !e.metaKey) return;
		e.preventDefault();
		const delta = e.deltaY > 0 ? -0.1 : 0.1;
		ganttStore.setUiScale(ganttStore.uiScale + delta);
	}

</script>

<!--
  Single scroll container for the entire Gantt chart.
  CSS Grid layout with 4 quadrants:
    [corner cell]    [timeline header]   ← sticky top
    [task list]      [SVG timeline]      ← scrolls vertically
    ↑ sticky left    ↑ scrolls freely

  Vertical scroll moves both the task list and the SVG together (same container).
  Horizontal scroll moves only the timeline; task list sticks via position:sticky.
  No scroll sync needed — one container handles everything.
-->
{#if ganttStore.hasTasks}
	<div
		bind:this={scrollEl}
		role="grid"
		aria-label="Gantt chart"
		class="gantt-scroll h-full overflow-auto outline-none"
		tabindex="0"
		onkeydown={(e) => ganttStore.handleKeyDown(e)}
		onwheel={handleWheel}
	>
		<div
			class="relative grid"
			style="
				grid-template-columns: {TASK_LIST_WIDTH}px {timelineStore.totalWidth}px;
				grid-template-rows: {HEADER_HEIGHT}px {timelineStore.totalHeight}px;
				width: {TASK_LIST_WIDTH + timelineStore.totalWidth}px;
				zoom: {ganttStore.uiScale};
			"
		>
			<!-- Corner cell: sticky top + left (highest z) -->
			<div
				class="sticky top-0 left-0 z-30 flex items-end border-b border-r bg-background px-2 pb-1 shadow-[2px_0_8px_0_rgba(0,0,0,0.15)]"
				style="grid-row: 1; grid-column: 1;"
			>
				<span class="text-xs font-medium text-muted-foreground">Task Name</span>
			</div>

			<!-- Timeline header: sticky top -->
			<div
				class="sticky top-0 z-20 bg-background"
				style="grid-row: 1; grid-column: 2;"
			>
				<GanttHeader
					timeScale={timelineStore.timeScale}
					zoomConfig={ganttStore.zoomConfig}
					totalWidth={timelineStore.totalWidth}
					dateRange={timelineStore.paddedRange}
				/>
			</div>

			<!-- Task list: sticky left -->
			<div
				class="sticky left-0 z-10 border-r bg-background shadow-[2px_0_8px_0_rgba(0,0,0,0.15)]"
				style="grid-row: 2; grid-column: 1;"
			>
				<GanttTaskList />
			</div>

			<!-- SVG timeline: scrolls freely -->
			<div style="grid-row: 2; grid-column: 2;">
				<GanttTimeline
					timeScale={timelineStore.timeScale}
					totalWidth={timelineStore.totalWidth}
					totalHeight={timelineStore.totalHeight}
					dateRange={timelineStore.paddedRange}
				/>
			</div>
		</div>
	</div>
{:else}
	<div
		role="grid"
		aria-label="Gantt chart"
		class="flex h-full items-center justify-center overflow-hidden outline-none"
		tabindex="0"
		onkeydown={(e) => ganttStore.handleKeyDown(e)}
	>
		<div class="flex flex-col items-center gap-3 text-muted-foreground">
			<LayoutGridIcon class="size-12 opacity-20" />
			{#if ganttStore.focusPath.length > 0}
				<p class="text-sm font-medium">No sub-tasks yet</p>
				<p class="text-xs opacity-60">Add tasks to build out this section</p>
			{:else}
				<p class="text-sm font-medium">No tasks yet</p>
				<p class="text-xs opacity-60">Create a task to get started</p>
			{/if}
		</div>
	</div>
{/if}
