<script lang="ts">
	import type { ScaleTime } from 'd3-scale';
	import type { GanttRow } from '$lib/types';
	import { ROW_HEIGHT } from '$lib/types';
	import { ganttStore } from '$lib/stores/gantt/ganttStore.svelte.js';
	import { interactionStore } from '$lib/stores/interaction/interactionStore.svelte.js';
	import { roundDate, toLocalIso } from '$lib/utils/timeline';

	interface Props {
		row: GanttRow;
		rowIndex: number;
		timeScale: ScaleTime<number, number>;
	}

	let { row, rowIndex, timeScale }: Props = $props();

	// -------------------------------------------------------------------------
	// Layout — diamond centered on startDate, vertically centred in the row
	// -------------------------------------------------------------------------

	let cx = $derived(timeScale(new Date(row.startDate)));
	let cy = $derived(rowIndex * ROW_HEIGHT + ROW_HEIGHT / 2);

	const HALF = 9; // half-size of the diamond (total 18 × 18 visual)

	// -------------------------------------------------------------------------
	// Interaction state
	// -------------------------------------------------------------------------

	let isSelected = $derived(ganttStore.selectedTaskId === row.id);
	let isHovered = $derived(ganttStore.hoveredTaskId === row.id);

	let clickTimer: ReturnType<typeof setTimeout> | null = null;

	// -------------------------------------------------------------------------
	// Drag-to-move state
	// -------------------------------------------------------------------------

	let isDragging = $state(false);
	let dragStartX = $state(0);
	let dragOriginalDate = $state('');
	let dragOffsetX = $state(0);

	// -------------------------------------------------------------------------
	// Drag-to-move handlers
	// -------------------------------------------------------------------------

	// Long-press for dependency linking
	const HOLD_MS = 500;
	const MOVE_PX = 4;
	let holdTimer: ReturnType<typeof setTimeout> | null = null;
	let holdClientX = 0;
	let holdClientY = 0;
	let holdFired = false;

	function clearHold() { if (holdTimer) { clearTimeout(holdTimer); holdTimer = null; } }

	function onHoldMove(e: MouseEvent) {
		if (Math.abs(e.clientX - holdClientX) > MOVE_PX || Math.abs(e.clientY - holdClientY) > MOVE_PX) {
			clearHold();
			window.removeEventListener('mousemove', onHoldMove);
			window.removeEventListener('mouseup', onHoldUp);
			if (!holdFired) {
				isDragging = true;
				dragStartX = holdClientX;
				dragOriginalDate = row.startDate;
				dragOffsetX = 0;
				document.body.style.userSelect = 'none';
				window.addEventListener('mousemove', handleDragMove);
				window.addEventListener('mouseup', handleDragEnd);
			}
		}
	}

	function onHoldUp() {
		clearHold();
		window.removeEventListener('mousemove', onHoldMove);
		window.removeEventListener('mouseup', onHoldUp);
	}

	function handleDragStart(e: MouseEvent) {
		if (e.button !== 0) return;
		e.preventDefault();
		e.stopPropagation();

		if (clickTimer) { clearTimeout(clickTimer); clickTimer = null; }

		// If in link mode, don't start a new drag — mouseup handles completion
		if (interactionStore.isLinking) return;

		holdClientX = e.clientX;
		holdClientY = e.clientY;
		holdFired = false;

		holdTimer = setTimeout(() => {
			holdFired = true;
			window.removeEventListener('mousemove', onHoldMove);
			window.removeEventListener('mouseup', onHoldUp);
			const anchorY = rowIndex * ROW_HEIGHT + ROW_HEIGHT / 2;
			interactionStore.startLink(row.id, cx, anchorY, e);
		}, HOLD_MS);

		window.addEventListener('mousemove', onHoldMove);
		window.addEventListener('mouseup', onHoldUp);
	}

	function handleDragMove(e: MouseEvent) {
		if (!isDragging) return;
		dragOffsetX = e.clientX - dragStartX;
	}

	function handleDragEnd(e: MouseEvent) {
		if (!isDragging) return;

		window.removeEventListener('mousemove', handleDragMove);
		window.removeEventListener('mouseup', handleDragEnd);

		document.body.style.userSelect = '';

		const dx = e.clientX - dragStartX;
		if (Math.abs(dx) < 3) {
			isDragging = false;
			dragOffsetX = 0;
			return;
		}

		const originalDate = new Date(dragOriginalDate);
		const originalX = timeScale(originalDate);
		const newDate = roundDate(timeScale.invert(originalX + dx), ganttStore.zoomConfig.snapUnit);
		const iso = toLocalIso(newDate);
		ganttStore.updateTask(row.id, { startDate: iso, endDate: iso });

		isDragging = false;
		dragOffsetX = 0;
	}

	// -------------------------------------------------------------------------
	// Click / double-click handlers
	// -------------------------------------------------------------------------

	function handleMouseUp() {
		interactionStore.handleBarMouseUp(row.id);
	}

	function handleClick() {
		if (isDragging) return;
		if (interactionStore.isLinking) return;
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

	let gCursor = $derived(
		interactionStore.isLinking ? 'crosshair' : isDragging ? 'grabbing' : 'grab'
	);

	// -------------------------------------------------------------------------
	// Tooltip text
	// -------------------------------------------------------------------------

	let tooltipText = $derived(
		`${row.name}\n${row.startDate}\nMilestone`,
	);
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_interactive_supports_focus -->
<g
	role="button"
	aria-label={row.name}
	onclick={handleClick}
	ondblclick={handleDoubleClick}
	onmousedown={handleDragStart}
	onmouseup={handleMouseUp}
	onmouseenter={handleMouseEnter}
	onmouseleave={handleMouseLeave}
	style="cursor: {gCursor}; {isDragging ? `transform: translate(${dragOffsetX}px, 0)` : ''}"
	opacity={isDragging ? 0.7 : 1}
>
	<title>{tooltipText}</title>

	<!-- Diamond: a square rotated 45° around its own centre -->
	<rect
		x={cx - HALF}
		y={cy - HALF}
		width={HALF * 2}
		height={HALF * 2}
		rx="2"
		ry="2"
		transform="rotate(45, {cx}, {cy})"
		fill={row.color}
		opacity={isHovered ? 1 : 0.9}
	/>

	<!-- Selection ring -->
	{#if isSelected}
		<rect
			x={cx - HALF - 2}
			y={cy - HALF - 2}
			width={HALF * 2 + 4}
			height={HALF * 2 + 4}
			rx="3"
			ry="3"
			transform="rotate(45, {cx}, {cy})"
			fill="none"
			stroke="white"
			stroke-width="2"
			stroke-opacity="0.85"
		/>
	{/if}

	<!-- Hover ring (when not selected) -->
	{#if isHovered && !isSelected}
		<rect
			x={cx - HALF - 2}
			y={cy - HALF - 2}
			width={HALF * 2 + 4}
			height={HALF * 2 + 4}
			rx="3"
			ry="3"
			transform="rotate(45, {cx}, {cy})"
			fill="none"
			stroke="white"
			stroke-width="1"
			stroke-opacity="0.4"
		/>
	{/if}
</g>
