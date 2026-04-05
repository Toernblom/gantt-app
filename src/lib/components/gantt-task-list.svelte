<script lang="ts">
    import GripVerticalIcon from "@tabler/icons-svelte/icons/grip-vertical";
    import { ganttStore } from '$lib/stores/gantt/ganttStore.svelte.js';
    import { ROW_HEIGHT } from '$lib/types.js';
    import GanttTaskRow from './gantt-task-row.svelte';

    let listEl = $state<HTMLDivElement | undefined>(undefined);

    const DRAG_THRESHOLD = 5;
    let dragStartY = 0;
    let capturedGrip: HTMLElement | null = null;

    function handleGripDown(e: PointerEvent, rowId: string, level: number) {
        if (e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation();

        const grip = e.currentTarget as HTMLElement;
        grip.setPointerCapture(e.pointerId);
        capturedGrip = grip;

        ganttStore.reorderDragId = rowId;
        ganttStore.reorderDragLevel = level;
        ganttStore.reorderDragActive = false;
        dragStartY = e.clientY;

        grip.onpointermove = handlePointerMove;
        grip.onpointerup = handlePointerUp;
        grip.onpointercancel = handlePointerUp;
    }

    function handlePointerMove(e: PointerEvent) {
        if (!ganttStore.reorderDragId || !listEl) return;

        if (!ganttStore.reorderDragActive) {
            if (Math.abs(e.clientY - dragStartY) < DRAG_THRESHOLD) return;
            ganttStore.reorderDragActive = true;
            document.body.style.cursor = 'grabbing';
        }

        const rows = ganttStore.rows;
        const sourceIdx = rows.findIndex(r => r.id === ganttStore.reorderDragId);
        if (sourceIdx < 0) return;

        const rect = listEl.getBoundingClientRect();
        const relY = e.clientY - rect.top;
        const scaledRowHeight = ROW_HEIGHT * ganttStore.uiScale;
        const hoverRow = Math.max(0, Math.min(Math.floor(relY / scaledRowHeight), rows.length - 1));

        // Hovering on the source row itself — no drop
        if (hoverRow === sourceIdx) {
            ganttStore.reorderDropIndex = -1;
            ganttStore.reorderDropZone = null;
            ganttStore.reorderDropTargetId = null;
            return;
        }

        const targetRow = rows[hoverRow];
        const fraction = (relY / scaledRowHeight) - hoverRow;

        // Three-zone detection
        // Top 25% = above, Middle 50% = child, Bottom 25% = below
        let zone: 'above' | 'child' | 'below';
        if (fraction < 0.25) {
            zone = 'above';
        } else if (fraction > 0.75) {
            zone = 'below';
        } else {
            zone = 'child';
        }

        // Milestones can't have children — fall back to nearest sibling zone
        if (zone === 'child' && targetRow.isMilestone) {
            zone = fraction < 0.5 ? 'above' : 'below';
        }

        ganttStore.reorderDropZone = zone;
        ganttStore.reorderDropTargetId = targetRow.id;

        // Set dropIndex for the visual indicator line (used for above/below)
        if (zone === 'above') {
            ganttStore.reorderDropIndex = hoverRow;
        } else if (zone === 'below') {
            ganttStore.reorderDropIndex = hoverRow + 1;
        } else {
            // 'child' zone — dropIndex not used for line, but set to -1
            ganttStore.reorderDropIndex = -1;
        }
    }

    function handlePointerUp() {
        if (capturedGrip) {
            capturedGrip.onpointermove = null;
            capturedGrip.onpointerup = null;
            capturedGrip.onpointercancel = null;
            capturedGrip = null;
        }
        document.body.style.cursor = '';

        if (ganttStore.reorderDragActive && ganttStore.reorderDropZone && ganttStore.reorderDropTargetId) {
            ganttStore.commitReorder();
        }
        ganttStore.clearReorderDrag();
    }

    /** Check if a row is the child-drop target. */
    function isChildTarget(rowId: string): boolean {
        return ganttStore.reorderDragActive
            && ganttStore.reorderDropZone === 'child'
            && ganttStore.reorderDropTargetId === rowId;
    }
</script>

<div bind:this={listEl} class="relative">
    {#each ganttStore.rows as row, i (row.id)}
        <div
            class="relative flex"
            style="height: {ROW_HEIGHT}px;"
            class:opacity-30={ganttStore.reorderDragActive && ganttStore.reorderDragId === row.id}
        >
            <!-- Drag grip: invisible until row is hovered -->
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <span
                class="absolute left-0 top-0 z-10 flex h-full w-5 items-center justify-center
                    text-muted-foreground/0 hover:text-muted-foreground/50
                    cursor-grab active:cursor-grabbing"
                style="touch-action: none;"
                onpointerdown={(e) => handleGripDown(e, row.id, row.level)}
            >
                <GripVerticalIcon class="size-3" />
            </span>

            <!-- Child-drop highlight ring -->
            {#if isChildTarget(row.id)}
                <div class="absolute inset-x-1 inset-y-0.5 z-10 rounded border-2 border-primary/60 pointer-events-none"></div>
            {/if}

            <div class="flex-1 min-w-0">
                <GanttTaskRow {row} guides={ganttStore.rowContexts[i].guides} isLastChild={ganttStore.rowContexts[i].isLast} />
            </div>
        </div>

        <!-- Drop indicator line for above/below zones -->
        {#if ganttStore.reorderDragActive && ganttStore.reorderDropZone !== 'child'}
            {#if ganttStore.reorderDropIndex === i}
                <div
                    class="absolute left-2 right-2 z-20 h-0.5 rounded-full bg-primary"
                    style="top: {i * ROW_HEIGHT - 1}px;"
                ></div>
            {/if}
        {/if}
    {/each}

    <!-- Drop indicator at the very end -->
    {#if ganttStore.reorderDragActive && ganttStore.reorderDropZone !== 'child' && ganttStore.reorderDropIndex === ganttStore.rows.length}
        <div
            class="absolute left-2 right-2 z-20 h-0.5 rounded-full bg-primary"
            style="top: {ganttStore.rows.length * ROW_HEIGHT - 1}px;"
        ></div>
    {/if}
</div>
