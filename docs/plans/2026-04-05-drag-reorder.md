# Drag-to-Reorder Tasks Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Drag tasks up/down in the task list sidebar to reorder them among siblings at the same nesting level.

**Architecture:** Pointer events with `setPointerCapture` on a grip handle per row. No array mutation during drag — only CSS transforms for visual "push apart" feedback. Array mutation happens once on drop via `ganttStore.reorderNodeTo()`. This avoids Svelte 5's `{#each}` re-keying flicker.

**Tech Stack:** Svelte 5 (runes), Pointer Events API, CSS transforms, existing store architecture.

---

### Task 1: Clean up existing broken implementation

The current code has a broken drag-reorder attempt. Revert the drag-related changes in `gantt-task-row.svelte` and `gantt-task-list.svelte` while keeping the store methods (`reorderNode`, `reorderNodeTo`, `findSiblings`) which are correct.

**Files:**
- Modify: `src/lib/components/gantt-task-row.svelte`
- Modify: `src/lib/components/gantt-task-list.svelte`

**Step 1: Revert gantt-task-row.svelte**

Remove the `GripVerticalIcon` import, the `onReorderStart` prop, and the grip handle element. Restore the original Props interface without `onReorderStart`.

In `src/lib/components/gantt-task-row.svelte`:

Remove the `GripVerticalIcon` import line:
```
import GripVerticalIcon from "@tabler/icons-svelte/icons/grip-vertical";
```

Change the Props interface back to:
```typescript
interface Props {
    row: GanttRow;
    guides: boolean[];
    isLastChild: boolean;
}

let { row, guides, isLastChild }: Props = $props();
```

Remove the entire grip handle block (the `<span>` with `GripVerticalIcon` and its surrounding comment).

**Step 2: Revert gantt-task-list.svelte**

Replace the entire file contents with:
```svelte
<script lang="ts">
    import { ganttStore } from '$lib/stores/gantt/ganttStore.svelte.js';
    import GanttTaskRow from './gantt-task-row.svelte';
</script>

<div>
    {#each ganttStore.rows as row, i (row.id)}
        <GanttTaskRow {row} guides={ganttStore.rowContexts[i].guides} isLastChild={ganttStore.rowContexts[i].isLast} />
    {/each}
</div>
```

**Step 3: Verify**

Run: `npm run check`
Expected: 0 errors

**Step 4: Commit**

```bash
git add src/lib/components/gantt-task-row.svelte src/lib/components/gantt-task-list.svelte
git commit -m "revert: remove broken drag-reorder attempt"
```

---

### Task 2: Add reorder drag state to ganttStore

Store the drag state centrally so both the task list and the SVG timeline can react to it. This follows the BLoC pattern — all state in the store, components are presentation-only.

**Files:**
- Modify: `src/lib/stores/gantt/ganttStore.svelte.ts`

**Step 1: Add reorder drag state properties**

After the existing `multiDragSourceId` state declaration (~line 33), add:

```typescript
/** Reorder drag state — centralized so task list and timeline can both react. */
reorderDragId = $state<string | null>(null);
reorderDragLevel = $state<number>(-1);
reorderDropIndex = $state<number>(-1);
reorderDragActive = $state(false);
```

**Step 2: Add a `commitReorder` method**

After the existing `reorderNodeTo` method, add a method that maps a flat-row drop index to a sibling index and commits the reorder:

```typescript
/** Commit a reorder drag: translate flat row dropIndex to sibling index and splice. */
commitReorder(): void {
    const id = this.reorderDragId;
    const level = this.reorderDragLevel;
    const dropIdx = this.reorderDropIndex;
    if (!id || dropIdx < 0) return;

    const rows = this.rows;
    const sourceRowIdx = rows.findIndex(r => r.id === id);
    if (sourceRowIdx < 0) return;

    const sourceSibIdx = this._countSiblingsUpTo(rows, sourceRowIdx, level);
    let dropSibIdx = this._countSiblingsUpTo(rows, dropIdx, level);
    if (dropIdx > sourceRowIdx) dropSibIdx = Math.max(0, dropSibIdx - 1);

    if (sourceSibIdx !== dropSibIdx) {
        this.reorderNodeTo(id, dropSibIdx);
    }
}

private _countSiblingsUpTo(rows: GanttRow[], rowIndex: number, level: number): number {
    let count = 0;
    for (let i = 0; i < rowIndex && i < rows.length; i++) {
        if (rows[i].level < level) count = 0;
        else if (rows[i].level === level) count++;
    }
    return count;
}

/** Clear all reorder drag state. */
clearReorderDrag(): void {
    this.reorderDragId = null;
    this.reorderDragLevel = -1;
    this.reorderDropIndex = -1;
    this.reorderDragActive = false;
}
```

**Step 3: Verify**

Run: `npm run check`
Expected: 0 errors

**Step 4: Commit**

```bash
git add src/lib/stores/gantt/ganttStore.svelte.ts
git commit -m "feat: add reorder drag state and commitReorder to ganttStore"
```

---

### Task 3: Implement drag-to-reorder in gantt-task-list.svelte

The task list component handles pointer events via `setPointerCapture` and updates the store's reorder state. Visual feedback uses CSS transforms to "push apart" rows at the drop point. The array is NOT mutated during drag — only on drop.

**Files:**
- Modify: `src/lib/components/gantt-task-list.svelte`

**Step 1: Rewrite gantt-task-list.svelte**

Replace the entire file with the following. Key design decisions:
- `pointerdown` on a dedicated grip handle per row (avoids ContextMenu/click conflicts)
- `setPointerCapture` on the grip — all subsequent pointer events fire on it regardless of cursor position
- Drop index calculated from pointer Y relative to list container
- CSS `transform: translateY(±36px)` on sibling rows for "push apart" animation
- Array mutation only on `pointerup` via `ganttStore.commitReorder()`

```svelte
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

        const rect = listEl.getBoundingClientRect();
        const relY = e.clientY - rect.top + listEl.scrollTop;
        const hoverRow = Math.floor(relY / ROW_HEIGHT);
        const fraction = (relY / ROW_HEIGHT) - hoverRow;

        const rows = ganttStore.rows;
        let target = fraction < 0.5 ? hoverRow : hoverRow + 1;
        target = Math.max(0, Math.min(target, rows.length));

        // Only allow drop between siblings at the same level
        const above = rows[target - 1];
        const below = rows[target];
        const level = ganttStore.reorderDragLevel;

        if ((below && below.level === level) || (above && above.level === level)) {
            ganttStore.reorderDropIndex = target;
        } else {
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

        if (ganttStore.reorderDragActive && ganttStore.reorderDropIndex >= 0) {
            ganttStore.commitReorder();
        }
        ganttStore.clearReorderDrag();
    }

    /** Compute CSS translateY for a row during drag to create "push apart" effect. */
    function rowTransform(i: number): string {
        if (!ganttStore.reorderDragActive || ganttStore.reorderDropIndex < 0) return '';
        const rows = ganttStore.rows;
        const sourceIdx = rows.findIndex(r => r.id === ganttStore.reorderDragId);
        if (sourceIdx < 0) return '';
        const dropIdx = ganttStore.reorderDropIndex;
        const id = rows[i]?.id;

        // The dragged row itself — hide it in place (it's represented by the gap)
        if (id === ganttStore.reorderDragId) return '';

        // Rows between source and drop shift to fill the gap
        if (dropIdx > sourceIdx) {
            // Dragging down: rows between source+1..dropIdx-1 shift up
            if (i > sourceIdx && i < dropIdx) return `translateY(-${ROW_HEIGHT}px)`;
        } else if (dropIdx < sourceIdx) {
            // Dragging up: rows between dropIdx..sourceIdx-1 shift down
            if (i >= dropIdx && i < sourceIdx) return `translateY(${ROW_HEIGHT}px)`;
        }
        return '';
    }
</script>

<div bind:this={listEl} class="relative">
    {#each ganttStore.rows as row, i (row.id)}
        <div
            class="relative flex"
            style="
                height: {ROW_HEIGHT}px;
                transform: {rowTransform(i)};
                transition: {ganttStore.reorderDragActive ? 'transform 150ms ease' : 'none'};
                opacity: {ganttStore.reorderDragActive && ganttStore.reorderDragId === row.id ? 0.3 : 1};
            "
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

            <div class="flex-1 min-w-0">
                <GanttTaskRow {row} guides={ganttStore.rowContexts[i].guides} isLastChild={ganttStore.rowContexts[i].isLast} />
            </div>
        </div>
    {/each}

    <!-- Drop indicator line -->
    {#if ganttStore.reorderDragActive && ganttStore.reorderDropIndex >= 0}
        <div
            class="absolute left-2 right-2 z-20 h-0.5 rounded-full bg-primary"
            style="top: {ganttStore.reorderDropIndex * ROW_HEIGHT - 1}px;"
        ></div>
    {/if}
</div>
```

**Step 2: Verify**

Run: `npm run check`
Expected: 0 errors

**Step 3: Manual test**

- Open the app in dev mode (`npm run dev`)
- Hover over the left edge of a task row — a grip icon should appear
- Grab it and drag up/down — sibling rows should animate apart, a blue line shows the drop position
- Release — the task should reorder among its siblings
- Undo (Ctrl+Z) should reverse it

**Step 4: Commit**

```bash
git add src/lib/components/gantt-task-list.svelte
git commit -m "feat: drag-to-reorder tasks via grip handle with pointer capture"
```

---

### Task 4: Fix row height conflict

The wrapper `<div>` in `gantt-task-list.svelte` sets `height: {ROW_HEIGHT}px` but `gantt-task-row.svelte` also sets its own height. This double-height could cause issues. Remove the explicit height from `gantt-task-row.svelte` since the parent now controls it.

**Files:**
- Modify: `src/lib/components/gantt-task-row.svelte`

**Step 1: Remove height from inner row**

In `gantt-task-row.svelte`, find the main row div's style attribute:
```
style="height: {ROW_HEIGHT}px;"
```
Remove it. The parent wrapper in `gantt-task-list.svelte` already sets the height.

**Step 2: Verify**

Run: `npm run check`
Expected: 0 errors. Visually verify rows still render at correct height.

**Step 3: Commit**

```bash
git add src/lib/components/gantt-task-row.svelte
git commit -m "fix: remove duplicate row height, parent wrapper controls it"
```

---

### Task 5: Remove unused @dnd-kit-svelte dependency

Research found `@dnd-kit-svelte/svelte` in devDependencies but it is never imported. Remove it.

**Files:**
- Modify: `package.json`

**Step 1: Remove the package**

```bash
npm uninstall @dnd-kit-svelte/svelte
```

**Step 2: Verify**

Run: `npm run check`
Expected: 0 errors

**Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: remove unused @dnd-kit-svelte dependency"
```
