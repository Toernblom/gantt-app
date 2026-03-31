# Quality of Life Improvements Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add undo/redo, auto-calculated parent progress, critical path highlighting, command palette search, and inline date editing to the gantt app.

**Architecture:** Undo/redo uses a snapshot ring buffer in a new `historyStore` — deep-clones `project` before each mutation. Parent progress is a recursive derived computation in `ganttStore`. Critical path is a longest-path algorithm over FS dependencies in `ganttStore`. Search wires the existing command palette stub to fuzzy-match all task names and select+scroll. Date editing adds calendar pickers to the detail pane's existing date buttons.

**Tech Stack:** SvelteKit 2, Svelte 5 runes, TypeScript, shadcn-svelte (Command, Calendar, Popover)

---

## Task 1: Undo/Redo — historyStore

**Files:**
- Create: `src/lib/stores/history/historyStore.svelte.ts`
- Create: `src/lib/stores/history/index.ts`
- Modify: `src/lib/stores/gantt/ganttStore.svelte.ts`
- Modify: `src/lib/components/gantt-pane.svelte`

### Step 1: Create historyStore

The store snapshots `projectStore.project` before each mutation. Ring buffer of 50 states. Undo restores the previous snapshot, redo re-applies.

```typescript
// src/lib/stores/history/historyStore.svelte.ts
import { projectStore } from '../project/index.js';
import type { Project } from '$lib/types';

const MAX_HISTORY = 50;

class HistoryStore {
  private _undoStack: string[] = [];  // JSON snapshots
  private _redoStack: string[] = [];
  private _skipNextSnapshot = false;

  canUndo = $state(false);
  canRedo = $state(false);

  /** Call BEFORE a mutation to save the current state. */
  snapshot(): void {
    if (this._skipNextSnapshot) {
      this._skipNextSnapshot = false;
      return;
    }
    this._undoStack.push(JSON.stringify(projectStore.project));
    if (this._undoStack.length > MAX_HISTORY) {
      this._undoStack.shift();
    }
    this._redoStack = [];  // new action clears redo
    this._updateFlags();
  }

  undo(): void {
    if (this._undoStack.length === 0) return;
    // Save current state to redo stack
    this._redoStack.push(JSON.stringify(projectStore.project));
    // Restore previous state
    const prev = this._undoStack.pop()!;
    this._skipNextSnapshot = true;
    projectStore.loadProject(JSON.parse(prev) as Project);
    this._updateFlags();
  }

  redo(): void {
    if (this._redoStack.length === 0) return;
    // Save current state to undo stack
    this._undoStack.push(JSON.stringify(projectStore.project));
    // Restore next state
    const next = this._redoStack.pop()!;
    this._skipNextSnapshot = true;
    projectStore.loadProject(JSON.parse(next) as Project);
    this._updateFlags();
  }

  /** Reset history (e.g. on project load). */
  clear(): void {
    this._undoStack = [];
    this._redoStack = [];
    this._updateFlags();
  }

  private _updateFlags(): void {
    this.canUndo = this._undoStack.length > 0;
    this.canRedo = this._redoStack.length > 0;
  }
}

export const historyStore = new HistoryStore();
```

```typescript
// src/lib/stores/history/index.ts
export { historyStore } from './historyStore.svelte.js';
```

### Step 2: Wire historyStore into ganttStore

Modify `src/lib/stores/gantt/ganttStore.svelte.ts`:

1. Add import: `import { historyStore } from '../history/index.js';`
2. In `_triggerSave()`, call `historyStore.snapshot()` BEFORE `persistenceStore.scheduleSave(...)`:

```typescript
private _triggerSave(): void {
  historyStore.snapshot();
  persistenceStore.scheduleSave(projectStore.project);
}
```

3. Add undo/redo methods:

```typescript
undo(): void {
  historyStore.undo();
  this._triggerSaveWithoutSnapshot();
}

redo(): void {
  historyStore.redo();
  this._triggerSaveWithoutSnapshot();
}

private _triggerSaveWithoutSnapshot(): void {
  persistenceStore.scheduleSave(projectStore.project);
}
```

4. In `handleKeyDown`, add Ctrl+Z / Ctrl+Shift+Z before the existing switch:

```typescript
if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
  e.preventDefault();
  if (e.shiftKey) this.redo();
  else this.undo();
  return;
}
```

5. In `openFolder()`, `openRecent()`, `createProjectFolder()` — after `projectStore.loadProject(project)`, call `historyStore.clear()`.

### Step 3: Wire undo/redo buttons in gantt-pane

Modify `src/lib/components/gantt-pane.svelte`:

1. Import: `import { historyStore } from '$lib/stores/history/index.js';`
2. Replace the Undo button to call `ganttStore.undo()` and be disabled when `!historyStore.canUndo`:

```svelte
<Button variant="ghost" size="icon" class="size-8"
  disabled={!historyStore.canUndo}
  onclick={() => ganttStore.undo()}
  {...props}>
```

3. Same for Redo with `historyStore.canRedo` and `ganttStore.redo()`.

### Step 4: Verify & Commit

Run: `npm run check`

```bash
git add src/lib/stores/history/ src/lib/stores/gantt/ganttStore.svelte.ts src/lib/components/gantt-pane.svelte
git commit -m "feat: undo/redo with snapshot ring buffer (Ctrl+Z / Ctrl+Shift+Z)"
```

---

## Task 2: Auto-calculated parent progress

**Files:**
- Modify: `src/lib/stores/gantt/helpers.ts`
- Modify: `src/lib/stores/gantt/ganttStore.svelte.ts`

### Step 1: Add computeParentProgress helper

Add to `src/lib/stores/gantt/helpers.ts`:

```typescript
/**
 * Recursively compute progress for parent nodes from their children.
 * Weighted average by duration (in days). Leaf nodes keep their manual progress.
 * Returns the computed progress for the given node.
 */
export function computeProgress(node: GanttNode): number {
  if (node.children.length === 0) return node.progress;

  let totalWeight = 0;
  let weightedSum = 0;
  for (const child of node.children) {
    const childProgress = computeProgress(child);
    const start = new Date(child.startDate).getTime();
    const end = new Date(child.endDate).getTime();
    const days = Math.max(1, Math.round((end - start) / 86_400_000) + 1);
    weightedSum += childProgress * days;
    totalWeight += days;
  }
  return totalWeight > 0 ? Math.round(weightedSum / totalWeight) : 0;
}
```

### Step 2: Add derived parentProgress to ganttStore

Add to `src/lib/stores/gantt/ganttStore.svelte.ts`, import `computeProgress` from helpers, then add a derived value after `hasTasks`:

```typescript
/**
 * Map of node id → auto-calculated progress for parent nodes.
 * Leaf nodes keep their manual progress; parents aggregate from children.
 * Components should read from this for display rather than node.progress for parents.
 */
parentProgress = $derived.by<Map<string, number>>(() => {
  const map = new Map<string, number>();
  const walk = (nodes: GanttNode[]) => {
    for (const node of nodes) {
      if (node.children.length > 0) {
        map.set(node.id, computeProgress(node));
      }
      walk(node.children);
    }
  };
  walk(projectStore.project.children);
  return map;
});

/** Get the effective progress for any node (auto-calculated for parents, manual for leaves). */
getEffectiveProgress(id: string): number {
  return this.parentProgress.get(id) ?? (this.getNodeById(id)?.progress ?? 0);
}
```

### Step 3: Update detail pane to show computed progress for parents

In `src/lib/components/detail-pane.svelte`, replace:
```typescript
let progressValue = $derived(selectedTask?.progress ?? 0);
```
with:
```typescript
let isParent = $derived(selectedTask?.children?.length ? selectedTask.children.length > 0 : false);
let progressValue = $derived(
  selectedTask ? ganttStore.getEffectiveProgress(selectedTask.id) : 0
);
```

When `isParent` is true, make the progress slider read-only (add `disabled` prop) and show "(auto)" label.

### Step 4: Verify & Commit

Run: `npm run check`

```bash
git add src/lib/stores/gantt/helpers.ts src/lib/stores/gantt/ganttStore.svelte.ts src/lib/components/detail-pane.svelte
git commit -m "feat: auto-calculated parent progress weighted by duration"
```

---

## Task 3: Critical path highlighting

**Files:**
- Modify: `src/lib/stores/gantt/helpers.ts`
- Modify: `src/lib/stores/gantt/ganttStore.svelte.ts`
- Modify: `src/lib/components/gantt-bar.svelte`
- Modify: `src/lib/components/gantt-task-row.svelte`

### Step 1: Add critical path computation to helpers

Add to `src/lib/stores/gantt/helpers.ts`:

```typescript
/**
 * Compute the critical path: the longest chain of FS-dependent tasks
 * that determines the project's minimum duration.
 * Returns a Set of task IDs on the critical path.
 */
export function computeCriticalPath(nodes: GanttNode[]): Set<string> {
  // Collect all nodes recursively
  const allNodes: GanttNode[] = [];
  const collect = (list: GanttNode[]) => {
    for (const n of list) {
      allNodes.push(n);
      collect(n.children);
    }
  };
  collect(nodes);

  const nodeMap = new Map(allNodes.map(n => [n.id, n]));

  // For each node, compute the longest path FROM it to the end of the project.
  // Use memoized DFS. "Length" = sum of durations along the chain.
  const memo = new Map<string, { length: number; path: string[] }>();

  function longestFrom(id: string): { length: number; path: string[] } {
    if (memo.has(id)) return memo.get(id)!;
    const node = nodeMap.get(id);
    if (!node) { memo.set(id, { length: 0, path: [] }); return memo.get(id)!; }

    const start = new Date(node.startDate).getTime();
    const end = new Date(node.endDate).getTime();
    const duration = Math.max(1, Math.round((end - start) / 86_400_000) + 1);

    // Find all tasks that depend on this one (this node is their prerequisite)
    const dependents = allNodes.filter(n =>
      n.dependencies.some(d => d.targetId === id && d.type === 'FS')
    );

    if (dependents.length === 0) {
      const result = { length: duration, path: [id] };
      memo.set(id, result);
      return result;
    }

    let best = { length: 0, path: [] as string[] };
    for (const dep of dependents) {
      const sub = longestFrom(dep.id);
      if (sub.length > best.length) best = sub;
    }

    const result = { length: duration + best.length, path: [id, ...best.path] };
    memo.set(id, result);
    return result;
  }

  // Find the global longest path starting from any node
  let globalBest = { length: 0, path: [] as string[] };
  for (const node of allNodes) {
    // Only start from nodes with no FS prerequisites (entry points)
    const hasPrereqs = node.dependencies.some(d => d.type === 'FS');
    if (!hasPrereqs) {
      const result = longestFrom(node.id);
      if (result.length > globalBest.length) globalBest = result;
    }
  }

  return new Set(globalBest.path);
}
```

### Step 2: Add criticalPath derived to ganttStore

In `src/lib/stores/gantt/ganttStore.svelte.ts`:

1. Import `computeCriticalPath` from helpers
2. Add derived after `dependencyPairs`:

```typescript
criticalPath = $derived<Set<string>>(computeCriticalPath(projectStore.project.children));
```

### Step 3: Highlight critical path bars

In `src/lib/components/gantt-bar.svelte`:

1. Import ganttStore (already imported)
2. Add derived: `let isOnCriticalPath = $derived(ganttStore.criticalPath.has(row.id));`
3. On the background rect, when `isOnCriticalPath`, add a distinct outline:

```svelte
{#if isOnCriticalPath && !isSelected}
  <rect
    x={previewX - 1}
    y={y - 1}
    width={previewWidth + 2}
    height={barHeight + 2}
    rx="5"
    fill="none"
    stroke="#ef4444"
    stroke-width="1.5"
    stroke-opacity="0.6"
    pointer-events="none"
  />
{/if}
```

### Step 4: Highlight critical path in task list

In `src/lib/components/gantt-task-row.svelte`:

1. Add derived: `let isOnCriticalPath = $derived(ganttStore.criticalPath.has(row.id));`
2. Add a subtle red left-border indicator when on critical path:

```svelte
{#if isOnCriticalPath}
  <span class="absolute left-0 top-1 bottom-1 w-0.5 rounded-full bg-red-500/60"></span>
{/if}
```

### Step 5: Verify & Commit

Run: `npm run check`

```bash
git add src/lib/stores/gantt/helpers.ts src/lib/stores/gantt/ganttStore.svelte.ts \
  src/lib/components/gantt-bar.svelte src/lib/components/gantt-task-row.svelte
git commit -m "feat: critical path highlighting on bars and task list rows"
```

---

## Task 4: Command palette search

**Files:**
- Modify: `src/lib/components/command-palette.svelte`

### Step 1: Wire search to task list

Replace the entire content of `src/lib/components/command-palette.svelte`:

```svelte
<script lang="ts">
  import GanttChartIcon from "@tabler/icons-svelte/icons/chart-bar";
  import PlusIcon from "@tabler/icons-svelte/icons/plus";
  import SearchIcon from "@tabler/icons-svelte/icons/search";

  import * as Command from "$lib/components/ui/command/index.js";

  import { ganttStore } from "$lib/stores/gantt/index.js";
  import { dialogStore } from "$lib/stores/dialog/index.js";
  import { projectStore } from "$lib/stores/project/index.js";
  import { findNodeById } from "$lib/stores/gantt/helpers.js";
  import type { GanttNode } from "$lib/types.js";

  let open = $state(false);

  function handleKeydown(e: KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key === "k") {
      e.preventDefault();
      open = !open;
    }
  }

  // Collect all nodes from the project for search
  function collectAll(nodes: GanttNode[]): GanttNode[] {
    const result: GanttNode[] = [];
    for (const n of nodes) {
      result.push(n);
      if (n.children.length > 0) result.push(...collectAll(n.children));
    }
    return result;
  }

  let allTasks = $derived(collectAll(projectStore.project.children));

  function handleSelectTask(taskId: string) {
    ganttStore.selectTask(taskId);
    // If viewing kanban, switch to gantt so scroll-to-center works
    if (ganttStore.viewMode === 'kanban') ganttStore.setViewMode('gantt');
    open = false;
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<Command.Dialog bind:open title="Command Palette" description="Search tasks and commands...">
  <Command.Input placeholder="Search tasks..." />
  <Command.List>
    <Command.Empty>No results found.</Command.Empty>

    <Command.Group heading="Tasks">
      {#each allTasks as task (task.id)}
        <Command.Item
          value={task.name}
          onSelect={() => handleSelectTask(task.id)}
        >
          <span
            class="mr-2 size-2 shrink-0 rounded-full"
            style="background-color: {task.color}"
          ></span>
          <span class="flex-1 truncate">{task.name}</span>
          {#if task.isMilestone}
            <span class="text-[10px] text-muted-foreground">milestone</span>
          {/if}
        </Command.Item>
      {/each}
    </Command.Group>

    <Command.Separator />

    <Command.Group heading="Actions">
      <Command.Item onSelect={() => { dialogStore.requestCreate(); open = false; }}>
        <PlusIcon class="mr-2 size-4" />
        <span>New Task</span>
      </Command.Item>
      <Command.Item onSelect={() => { ganttStore.setViewMode('gantt'); open = false; }}>
        <GanttChartIcon class="mr-2 size-4" />
        <span>Gantt Chart</span>
      </Command.Item>
      <Command.Item onSelect={() => { ganttStore.setViewMode('kanban'); open = false; }}>
        <SearchIcon class="mr-2 size-4" />
        <span>Kanban Board</span>
      </Command.Item>
    </Command.Group>
  </Command.List>
</Command.Dialog>
```

The `Command` component from shadcn provides built-in fuzzy filtering on the `value` prop.

### Step 2: Verify & Commit

Run: `npm run check`

```bash
git add src/lib/components/command-palette.svelte
git commit -m "feat: command palette search with fuzzy task matching (Ctrl+K)"
```

---

## Task 5: Inline date editing in detail pane

**Files:**
- Modify: `src/lib/components/detail-pane.svelte`

### Step 1: Add date editing with Calendar popovers

In `src/lib/components/detail-pane.svelte`:

1. Add imports at top:

```typescript
import * as Popover from "$lib/components/ui/popover/index.js";
import * as Calendar from "$lib/components/ui/calendar/index.js";
import { parseDate } from "@internationalized/date";
import type { DateValue } from "@internationalized/date";
```

2. Add date change handlers:

```typescript
function handleStartDateChange(value: DateValue | undefined) {
  if (!selectedTaskId || !value) return;
  ganttStore.updateTask(selectedTaskId, { startDate: value.toString() });
}

function handleEndDateChange(value: DateValue | undefined) {
  if (!selectedTaskId || !value) return;
  ganttStore.updateTask(selectedTaskId, { endDate: value.toString() });
}

function isoToDateValue(iso: string): DateValue | undefined {
  try { return parseDate(iso); } catch { return undefined; }
}
```

3. Replace the Start Date button (currently read-only, around the Schedule card section) with a Popover+Calendar:

```svelte
<div class="space-y-1">
  <Label class="text-xs text-muted-foreground">Start Date</Label>
  <Popover.Root>
    <Popover.Trigger>
      {#snippet child({ props })}
        <Button variant="outline" size="sm" class="w-full justify-start text-xs" {...props}>
          <CalendarIcon class="mr-2 size-3" />
          {selectedTask ? formatDisplayDate(selectedTask.startDate) : "—"}
        </Button>
      {/snippet}
    </Popover.Trigger>
    <Popover.Content class="w-auto p-0" align="start">
      <Calendar.Calendar
        type="single"
        value={selectedTask ? isoToDateValue(selectedTask.startDate) : undefined}
        onValueChange={handleStartDateChange}
      />
    </Popover.Content>
  </Popover.Root>
</div>
```

4. Same pattern for End Date with `handleEndDateChange` and `selectedTask.endDate`.

### Step 2: Verify & Commit

Run: `npm run check`

```bash
git add src/lib/components/detail-pane.svelte
git commit -m "feat: inline date editing with calendar pickers in detail pane"
```

---

## Task 6: Update system-index.md

**Files:**
- Modify: `docs/system-index.md`

### Step 1: Add entries for:

- New `historyStore` with ring buffer, snapshot/undo/redo methods
- `parentProgress` and `criticalPath` derived values in ganttStore
- `getEffectiveProgress()` method in ganttStore
- Command palette search wiring
- Date editing in detail pane
- New interaction walkthroughs: "How undo/redo works", "How critical path is computed"

### Step 2: Commit

```bash
git add docs/system-index.md
git commit -m "docs: update system-index with undo/redo, critical path, search, date editing"
```

---

## Verification checklist

**Undo/Redo:**
- [ ] Ctrl+Z undoes the last change (task edit, delete, add, drag, etc.)
- [ ] Ctrl+Shift+Z redoes
- [ ] Undo/redo buttons in toolbar are disabled when nothing to undo/redo
- [ ] History clears on project load
- [ ] Max 50 undo states

**Auto Parent Progress:**
- [ ] Parent nodes show aggregated progress from children
- [ ] Weighted by task duration (longer tasks weigh more)
- [ ] Progress slider is disabled for parent nodes, shows "(auto)"
- [ ] Leaf task progress is still manually editable
- [ ] Updating a child's progress updates the parent display

**Critical Path:**
- [ ] Longest FS dependency chain is identified
- [ ] Bars on the critical path have a red outline
- [ ] Task rows on the critical path have a red left indicator
- [ ] Critical path updates when dependencies or dates change

**Command Palette Search:**
- [ ] Ctrl+K opens the command palette
- [ ] Typing filters tasks by name (fuzzy match)
- [ ] Selecting a task selects and scrolls to it in the gantt
- [ ] "New Task" action opens the create dialog
- [ ] View switching actions work

**Date Editing:**
- [ ] Clicking start/end date in detail pane opens a calendar picker
- [ ] Selecting a date updates the task's start/end date
- [ ] Change is reflected immediately in the gantt bar position
- [ ] Auto-save triggers after date change
