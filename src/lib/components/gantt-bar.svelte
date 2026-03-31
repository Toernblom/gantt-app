<script lang="ts">
	import type { ScaleTime } from 'd3-scale';
	import type { GanttRow } from '$lib/types';
	import { ROW_HEIGHT } from '$lib/types';
	import { ganttStore } from '$lib/stores/gantt/index.js';
	import { interactionStore } from '$lib/stores/interaction/index.js';
	import { roundDate, addTime, toLocalIso } from '$lib/utils/timeline';

	interface Props {
		row: GanttRow;
		rowIndex: number;
		timeScale: ScaleTime<number, number>;
	}

	let { row, rowIndex, timeScale }: Props = $props();

	// -------------------------------------------------------------------------
	// Layout — endDate is INCLUSIVE (last day of the task), so the bar's right
	// edge must be at endDate + 1 snap unit to fill that day's column.
	// -------------------------------------------------------------------------

	let snapUnit = $derived(ganttStore.zoomConfig.snapUnit);

	/** Convert an inclusive end-date ISO string to the exclusive pixel x. */
	function endDateToX(iso: string): number {
		return timeScale(addTime(new Date(iso), 1, snapUnit));
	}
	/** Convert an exclusive pixel x back to an inclusive end-date ISO string. */
	function xToEndDate(px: number): string {
		const exclusive = roundDate(timeScale.invert(px), snapUnit);
		const inclusive = addTime(exclusive, -1, snapUnit);
		return toLocalIso(inclusive);
	}

	let x = $derived(timeScale(new Date(row.startDate)));
	let rawWidth = $derived(endDateToX(row.endDate) - x);
	let barWidth = $derived(Math.max(rawWidth, 4));
	let y = $derived(rowIndex * ROW_HEIGHT + 6);
	let barHeight = $derived(ROW_HEIGHT - 12);

	// Progress overlay width, clamped to the full bar width
	let progressWidth = $derived(barWidth * (row.progress / 100));

	// Show the text label only when the bar is wide enough
	let showLabel = $derived(barWidth > 60);

	// Unique IDs for this row's clipPath elements (must be stable per row.id)
	let clipBarId = $derived(`clip-bar-${row.id}`);
	let clipLabelId = $derived(`clip-label-${row.id}`);

	// -------------------------------------------------------------------------
	// Epic summary-bar style: a thinner band centered in the row
	// -------------------------------------------------------------------------

	let isCollapsedEpic = $derived(row.hasChildren && !row.expanded);

	let epicY = $derived(rowIndex * ROW_HEIGHT + ROW_HEIGHT / 2 - 4); // 8px tall, centred
	let epicHeight = 8;

	// -------------------------------------------------------------------------
	// Interaction state
	// -------------------------------------------------------------------------

	let isSelected = $derived(ganttStore.selectedTaskId === row.id);
	let isHovered = $derived(ganttStore.hoveredTaskId === row.id);

	let clickTimer: ReturnType<typeof setTimeout> | null = null;

	// -------------------------------------------------------------------------
	// SVG coordinate helper — converts viewport clientX to SVG-space x
	// -------------------------------------------------------------------------

	let svgEl: SVGSVGElement | null = null;
	let svgPoint: DOMPoint | null = null;

	function clientXToSvgX(clientX: number, clientY: number): number {
		if (!svgEl) return clientX;
		if (!svgPoint) svgPoint = svgEl.createSVGPoint();
		svgPoint.x = clientX;
		svgPoint.y = clientY;
		const ctm = svgEl.getScreenCTM();
		if (!ctm) return clientX;
		const svgP = svgPoint.matrixTransform(ctm.inverse());
		return svgP.x;
	}

	function captureSvg(e: MouseEvent) {
		// Walk up from the event target to find the owning <svg>
		if (!svgEl) {
			let el = e.target as Element | null;
			while (el && el.tagName !== 'svg') el = el.parentElement;
			if (el) svgEl = el as SVGSVGElement;
		}
	}

	// -------------------------------------------------------------------------
	// Drag-to-move state (all offsets in SVG-space pixels)
	// -------------------------------------------------------------------------

	let isDragging = $state(false);
	let dragStartSvgX = $state(0);
	let dragOriginalStart = $state('');
	let dragOriginalEnd = $state('');
	let dragOffsetX = $state(0); // SVG-space px offset

	// -------------------------------------------------------------------------
	// Drag-to-resize state (all offsets in SVG-space pixels)
	// -------------------------------------------------------------------------

	let isResizing = $state<'start' | 'end' | null>(null);
	let resizeStartSvgX = $state(0);
	let resizeOffsetX = $state(0);

	// -------------------------------------------------------------------------
	// Snapped preview: the exact dates + pixel rect where the bar WILL land
	// -------------------------------------------------------------------------

	interface SnapTarget { startIso: string; endIso: string; x: number; width: number }

	let snapPreview = $derived.by<SnapTarget | null>(() => {
		if (isDragging && Math.abs(dragOffsetX) >= 3) {
			// Drag: shift both start and exclusive-end by the same pixel offset
			const origStartX = timeScale(new Date(dragOriginalStart));
			const origEndExclX = endDateToX(dragOriginalEnd);
			const newStartDate = roundDate(timeScale.invert(origStartX + dragOffsetX), snapUnit);
			const newStartIso = toLocalIso(newStartDate);
			const newEndIso = xToEndDate(origEndExclX + dragOffsetX);
			const sx = timeScale(newStartDate);
			const ex = endDateToX(newEndIso);
			return { startIso: newStartIso, endIso: newEndIso, x: sx, width: Math.max(ex - sx, 4) };
		}

		if (isResizing && Math.abs(resizeOffsetX) >= 3) {
			if (isResizing === 'start') {
				// Resize start: move left edge, keep right edge fixed
				const newStartDate = roundDate(timeScale.invert(timeScale(new Date(row.startDate)) + resizeOffsetX), snapUnit);
				const newStartIso = toLocalIso(newStartDate);
				const rightX = endDateToX(row.endDate);
				const sx = timeScale(newStartDate);
				if (sx < rightX) {
					return { startIso: newStartIso, endIso: row.endDate, x: sx, width: Math.max(rightX - sx, 4) };
				}
			} else {
				// Resize end: move right edge, keep left edge fixed
				const newEndIso = xToEndDate(endDateToX(row.endDate) + resizeOffsetX);
				const sx = timeScale(new Date(row.startDate));
				const ex = endDateToX(newEndIso);
				if (ex > sx) {
					return { startIso: row.startDate, endIso: newEndIso, x: sx, width: Math.max(ex - sx, 4) };
				}
			}
		}

		return null;
	});

	// For the actual bar rendering during resize, use snap preview for crisp steps
	let previewX = $derived(isResizing && snapPreview ? snapPreview.x : x);
	let previewWidth = $derived(isResizing && snapPreview ? snapPreview.width : barWidth);

	// -------------------------------------------------------------------------
	// Drag-to-move handlers
	// -------------------------------------------------------------------------

	function handleDragStart(e: MouseEvent) {
		if (e.button !== 0) return;
		e.preventDefault();
		e.stopPropagation();

		if (clickTimer) { clearTimeout(clickTimer); clickTimer = null; }

		// Shift+click: start dependency link mode
		if (e.shiftKey) {
			const anchorX = endDateToX(row.endDate);
			const anchorY = rowIndex * ROW_HEIGHT + ROW_HEIGHT / 2;
			interactionStore.startLink(row.id, anchorX, anchorY, e);
			return;
		}

		// If we're in link mode, complete the link on this bar
		if (interactionStore.handleBarClick(row.id)) return;

		captureSvg(e);

		isDragging = true;
		dragStartSvgX = clientXToSvgX(e.clientX, e.clientY);
		dragOriginalStart = row.startDate;
		dragOriginalEnd = row.endDate;
		dragOffsetX = 0;

		document.body.style.userSelect = 'none';

		window.addEventListener('mousemove', handleDragMove);
		window.addEventListener('mouseup', handleDragEnd);
	}

	function handleDragMove(e: MouseEvent) {
		if (!isDragging) return;
		dragOffsetX = clientXToSvgX(e.clientX, e.clientY) - dragStartSvgX;
	}

	function handleDragEnd() {
		if (!isDragging) return;

		window.removeEventListener('mousemove', handleDragMove);
		window.removeEventListener('mouseup', handleDragEnd);
		document.body.style.userSelect = '';

		const target = snapPreview;
		if (target) {
			ganttStore.updateTask(row.id, { startDate: target.startIso, endDate: target.endIso });
		}

		isDragging = false;
		dragOffsetX = 0;
	}

	// -------------------------------------------------------------------------
	// Drag-to-resize handlers
	// -------------------------------------------------------------------------

	function handleResizeStart(e: MouseEvent, edge: 'start' | 'end') {
		if (e.button !== 0) return;
		e.preventDefault();
		e.stopPropagation();

		if (clickTimer) { clearTimeout(clickTimer); clickTimer = null; }
		captureSvg(e);

		isResizing = edge;
		resizeStartSvgX = clientXToSvgX(e.clientX, e.clientY);
		resizeOffsetX = 0;

		document.body.style.userSelect = 'none';

		window.addEventListener('mousemove', handleResizeMove);
		window.addEventListener('mouseup', handleResizeEnd);
	}

	function handleResizeMove(e: MouseEvent) {
		if (!isResizing) return;
		resizeOffsetX = clientXToSvgX(e.clientX, e.clientY) - resizeStartSvgX;
	}

	function handleResizeEnd() {
		if (!isResizing) return;

		window.removeEventListener('mousemove', handleResizeMove);
		window.removeEventListener('mouseup', handleResizeEnd);
		document.body.style.userSelect = '';

		const target = snapPreview;
		if (target) {
			ganttStore.updateTask(row.id, { startDate: target.startIso, endDate: target.endIso });
		}

		isResizing = null;
		resizeOffsetX = 0;
	}

	// -------------------------------------------------------------------------
	// Click / double-click handlers
	// -------------------------------------------------------------------------

	function handleClick() {
		if (isDragging || isResizing) return;
		// If in link mode, complete the link
		if (interactionStore.handleBarClick(row.id)) return;
		if (clickTimer) return;
		clickTimer = setTimeout(() => {
			ganttStore.selectTask(row.id);
			clickTimer = null;
		}, 200);
	}

	function handleDoubleClick() {
		if (clickTimer) {
			clearTimeout(clickTimer);
			clickTimer = null;
		}
		ganttStore.drillInto(row.id);
	}

	function handleMouseEnter() {
		ganttStore.setHoveredTask(row.id);
	}

	function handleMouseLeave() {
		ganttStore.setHoveredTask(null);
	}

	// -------------------------------------------------------------------------
	// Derived cursor
	// -------------------------------------------------------------------------

	let gCursor = $derived(isDragging ? 'grabbing' : 'grab');

	// -------------------------------------------------------------------------
	// Tooltip text
	// -------------------------------------------------------------------------

	let tooltipText = $derived(
		`${row.name}\n${row.startDate} → ${row.endDate}\nProgress: ${row.progress}%`,
	);
</script>

<!-- Snap ghost: shows the snapped target position during drag/resize -->
{#if snapPreview}
	<rect
		x={snapPreview.x}
		{y}
		width={snapPreview.width}
		height={barHeight}
		rx="4"
		fill={row.color}
		fill-opacity="0.2"
		stroke={row.color}
		stroke-width="1.5"
		stroke-opacity="0.5"
		stroke-dasharray="4,3"
		pointer-events="none"
	/>
{/if}

<!--
  One <g> per task bar. All coordinates are in SVG-canvas space.
  The clipPath elements must live in <defs> but SVG requires <defs> inside <svg>
  — we use a local <defs> here; browsers merge all <defs> automatically.
-->
<defs>
	<!-- Clip to the full bar bounding box -->
	{#if isCollapsedEpic}
		<clipPath id={clipBarId}>
			<rect x={x} y={epicY} width={barWidth} height={epicHeight} rx="2" />
		</clipPath>
	{:else}
		<clipPath id={clipBarId}>
			<rect x={previewX} {y} width={previewWidth} height={barHeight} rx="4" />
		</clipPath>
	{/if}

	<!-- Clip the text label to keep it inside the bar -->
	<clipPath id={clipLabelId}>
		<rect x={previewX + 4} {y} width={Math.max(previewWidth - 8, 0)} height={barHeight} />
	</clipPath>
</defs>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_interactive_supports_focus -->
<g
	role="button"
	aria-label={row.name}
	onclick={handleClick}
	ondblclick={handleDoubleClick}
	onmousedown={handleDragStart}
	onmouseenter={handleMouseEnter}
	onmouseleave={handleMouseLeave}
	style="cursor: {gCursor}; {isDragging ? `transform: translate(${dragOffsetX}px, 0)` : ''}"
	opacity={isDragging ? 0.7 : isHovered ? 1 : 0.95}
>
	<title>{tooltipText}</title>

	{#if isCollapsedEpic}
		<!-- ------------------------------------------------------------------ -->
		<!-- Epic summary bar (collapsed): thin centred stripe + chevrons        -->
		<!-- ------------------------------------------------------------------ -->

		<!-- Thin background stripe -->
		<rect
			x={x}
			y={epicY}
			width={barWidth}
			height={epicHeight}
			rx="2"
			fill={row.color}
			opacity="0.7"
		/>

		<!-- Progress fill -->
		<rect
			x={x}
			y={epicY}
			width={progressWidth}
			height={epicHeight}
			rx="2"
			fill={row.color}
			opacity={1}
			clip-path="url(#{clipBarId})"
		/>

		<!-- Left end cap (filled triangle pointing right) -->
		<polygon
			points="{x},{epicY - 5} {x + 7},{epicY + epicHeight / 2} {x},{epicY + epicHeight + 5}"
			fill={row.color}
			opacity="0.7"
		/>

		<!-- Right end cap (filled triangle pointing left) -->
		<polygon
			points="{x + barWidth},{epicY - 5} {x + barWidth - 7},{epicY + epicHeight / 2} {x +
				barWidth},{epicY + epicHeight + 5}"
			fill={row.color}
			opacity="0.7"
		/>

		<!-- Selection ring on summary stripe area -->
		{#if isSelected}
			<rect
				x={x - 1}
				y={epicY - 1}
				width={barWidth + 2}
				height={epicHeight + 2}
				rx="3"
				fill="none"
				stroke="white"
				stroke-width="1.5"
				stroke-opacity="0.8"
			/>
		{/if}
	{:else}
		<!-- ------------------------------------------------------------------ -->
		<!-- Normal task bar                                                      -->
		<!-- ------------------------------------------------------------------ -->

		<!-- Background rect -->
		<rect
			x={previewX}
			{y}
			width={previewWidth}
			height={barHeight}
			rx="4"
			ry="4"
			fill={row.color}
			opacity="0.85"
		/>

		<!-- Progress overlay -->
		<rect
			x={previewX}
			{y}
			width={Math.min(progressWidth, previewWidth)}
			height={barHeight}
			rx="4"
			ry="4"
			fill={row.color}
			opacity="1"
			clip-path="url(#{clipBarId})"
		/>

		<!-- Text label -->
		{#if showLabel}
			<text
				x={previewX + 6}
				y={y + barHeight / 2 + 1}
				dominant-baseline="middle"
				font-size="11"
				font-family="inherit"
				fill="white"
				clip-path="url(#{clipLabelId})"
				style="pointer-events: none; user-select: none;"
			>
				{row.name}
			</text>
		{/if}

		<!-- Selection ring -->
		{#if isSelected}
			<rect
				x={previewX - 1}
				y={y - 1}
				width={previewWidth + 2}
				height={barHeight + 2}
				rx="5"
				ry="5"
				fill="none"
				stroke="white"
				stroke-width="2"
				stroke-opacity="0.85"
			/>
		{/if}

		<!-- Hover glow ring (distinct from selection ring) -->
		{#if isHovered && !isSelected}
			<rect
				x={previewX - 1}
				y={y - 1}
				width={previewWidth + 2}
				height={barHeight + 2}
				rx="5"
				ry="5"
				fill="none"
				stroke="white"
				stroke-width="1"
				stroke-opacity="0.4"
			/>
		{/if}

		<!-- Left resize handle: visible grip line + wide invisible hit area -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<g
			style="cursor: col-resize;"
			onmousedown={(e) => handleResizeStart(e, 'start')}
		>
			<!-- Wide invisible hit target -->
			<rect
				x={previewX - 6}
				y={y - 2}
				width={14}
				height={barHeight + 4}
				fill="transparent"
			/>
			<!-- Visible grip: 2px rounded bar at the edge, shown on hover -->
			{#if isHovered || isResizing === 'start'}
				<rect
					x={previewX + 1}
					y={y + 4}
					width={3}
					height={barHeight - 8}
					rx="1.5"
					fill="white"
					fill-opacity="0.6"
				/>
			{/if}
		</g>

		<!-- Right resize handle: visible grip line + wide invisible hit area -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<g
			style="cursor: col-resize;"
			onmousedown={(e) => handleResizeStart(e, 'end')}
		>
			<!-- Wide invisible hit target -->
			<rect
				x={previewX + previewWidth - 8}
				y={y - 2}
				width={14}
				height={barHeight + 4}
				fill="transparent"
			/>
			<!-- Visible grip: 2px rounded bar at the edge, shown on hover -->
			{#if isHovered || isResizing === 'end'}
				<rect
					x={previewX + previewWidth - 4}
					y={y + 4}
					width={3}
					height={barHeight - 8}
					rx="1.5"
					fill="white"
					fill-opacity="0.6"
				/>
			{/if}
		</g>
	{/if}
</g>
