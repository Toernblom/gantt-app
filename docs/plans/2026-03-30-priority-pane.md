# Priority Pane Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a full-height right pane showing prioritized "work on this next" cards, scored by dependency impact, readiness, timeline urgency, and progress.

**Architecture:** Add a `priorityStore` that recursively collects all tasks from the project, computes a priority score for each (based on how many tasks it unblocks, whether its dependencies are met, timeline proximity, and in-progress state), and returns a sorted list. A new `priority-pane.svelte` component renders the top items as cards. The page layout wraps the existing vertical split in a horizontal `Resizable.PaneGroup` to place the priority pane on the right.

**Tech Stack:** SvelteKit 2, Svelte 5 runes, shadcn-svelte (Card, Badge, ScrollArea, Progress, Separator, Tooltip), paneforge (Resizable)

---

## Layout change

```
BEFORE:                              AFTER:
Sidebar | PaneGroup(vertical)        Sidebar | PaneGroup(horizontal)
        |   GanttPane   65%                  |   PaneGroup(vertical)  75%  |  PriorityPane  25%
        |   ---handle---                     |     GanttPane   65%        |  (full height)
        |   DetailPane  35%                  |     ---handle---           |
                                             |     DetailPane  35%        |
```

## Scoring algorithm

For each non-complete task in the entire project tree:

```
score = 0

// Skip completed tasks
if (progress === 100) → exclude

// Readiness: are all dependencies satisfied?
allDepsReady = every dep target has progress === 100
if (!allDepsReady) score -= 1000   // pushed to bottom, shown as "blocked"

// In-progress bonus: finish what you started
if (progress > 0) score += 25

// Downstream impact: how many tasks does this unblock?
unblocksCount = count of tasks that have a dependency pointing at this task
score += unblocksCount * 10

// Timeline urgency
daysUntilStart = (startDate - today) in days
if (daysUntilStart <= 0) score += 30       // overdue or starting today
else if (daysUntilStart <= 7) score += 15  // starting this week

// Incomplete todos
if (todos.length > 0 && some not done) score += 5
```

Sort descending by score. Tasks with `score < -500` are "blocked" (shown dimmed at bottom).

---

## Task 1: Create priority store

**Files:**
- Create: `src/lib/stores/priority/priorityStore.svelte.ts`
- Create: `src/lib/stores/priority/index.ts`

**Step 1: Create priorityStore.svelte.ts**

```typescript
import { projectStore } from '../project/index.js';
import { findNodeById } from '../gantt/helpers.js';
import type { GanttNode } from '$lib/types';

export interface PriorityItem {
  task: GanttNode;
  score: number;
  ready: boolean;
  blockedBy: string[];      // names of incomplete dependency tasks
  unblocksCount: number;
  reason: string;           // human-readable explanation
}

class PriorityStore {
  items = $derived.by<PriorityItem[]>(() => {
    const allNodes = this._collectAll(projectStore.project.children);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Pre-compute: for each task id, how many other tasks depend on it
    const unblocksMap = new Map<string, number>();
    for (const node of allNodes) {
      for (const dep of node.dependencies) {
        unblocksMap.set(dep.targetId, (unblocksMap.get(dep.targetId) ?? 0) + 1);
      }
    }

    const items: PriorityItem[] = [];

    for (const task of allNodes) {
      // Skip completed and milestones
      if (task.progress >= 100) continue;
      if (task.isMilestone) continue;
      // Skip parent/epic nodes (nodes with children) — focus on leaf work
      if (task.children.length > 0) continue;

      let score = 0;
      const reasons: string[] = [];

      // Check dependency readiness
      const blockedBy: string[] = [];
      for (const dep of task.dependencies) {
        const target = findNodeById(projectStore.project.children, dep.targetId);
        if (target && target.progress < 100) {
          blockedBy.push(target.name);
        }
      }
      const ready = blockedBy.length === 0;
      if (!ready) {
        score -= 1000;
        reasons.push(`Blocked by ${blockedBy.length} task${blockedBy.length > 1 ? 's' : ''}`);
      }

      // In-progress bonus
      if (task.progress > 0) {
        score += 25;
        reasons.push(`${task.progress}% done — finish it`);
      }

      // Downstream impact
      const unblocksCount = unblocksMap.get(task.id) ?? 0;
      if (unblocksCount > 0) {
        score += unblocksCount * 10;
        reasons.push(`Unblocks ${unblocksCount} task${unblocksCount > 1 ? 's' : ''}`);
      }

      // Timeline urgency
      const start = new Date(task.startDate);
      start.setHours(0, 0, 0, 0);
      const daysUntil = Math.round((start.getTime() - today.getTime()) / 86_400_000);
      if (daysUntil <= 0) {
        score += 30;
        if (daysUntil < 0) reasons.push(`Started ${-daysUntil}d ago`);
        else reasons.push('Starts today');
      } else if (daysUntil <= 7) {
        score += 15;
        reasons.push(`Starts in ${daysUntil}d`);
      }

      // Incomplete todos
      const incompleteTodos = task.todos.filter(t => !t.done).length;
      if (incompleteTodos > 0) {
        score += 5;
        reasons.push(`${incompleteTodos} todo${incompleteTodos > 1 ? 's' : ''} left`);
      }

      // Fallback reason
      if (reasons.length === 0 && ready) {
        reasons.push('Ready to start');
      }

      items.push({
        task,
        score,
        ready,
        blockedBy,
        unblocksCount,
        reason: reasons[0] ?? '',
      });
    }

    // Sort: highest score first
    items.sort((a, b) => b.score - a.score);
    return items;
  });

  // Split for rendering convenience
  readyItems = $derived(this.items.filter(i => i.ready));
  blockedItems = $derived(this.items.filter(i => !i.ready));

  private _collectAll(nodes: GanttNode[]): GanttNode[] {
    const result: GanttNode[] = [];
    for (const node of nodes) {
      result.push(node);
      if (node.children.length > 0) {
        result.push(...this._collectAll(node.children));
      }
    }
    return result;
  }
}

export const priorityStore = new PriorityStore();
```

**Step 2: Create index.ts**

```typescript
export { priorityStore, type PriorityItem } from './priorityStore.svelte.js';
```

**Step 3: Verify**

Run: `npm run check`

**Step 4: Commit**

```bash
git add src/lib/stores/priority/
git commit -m "feat: create priority store with scoring algorithm"
```

---

## Task 2: Create priority-pane component

**Files:**
- Create: `src/lib/components/priority-pane.svelte`

**Step 1: Create the component**

A full-height scrollable pane with two sections: "Up Next" (ready tasks) and "Blocked" (dimmed, collapsed by default).

```svelte
<script lang="ts">
  import TargetArrowIcon from '@tabler/icons-svelte/icons/target-arrow';
  import LockIcon from '@tabler/icons-svelte/icons/lock';
  import ChevronRightIcon from '@tabler/icons-svelte/icons/chevron-right';
  import FlameIcon from '@tabler/icons-svelte/icons/flame';
  import ArrowUpIcon from '@tabler/icons-svelte/icons/arrow-up';

  import { Badge } from '$lib/components/ui/badge/index.js';
  import { Progress } from '$lib/components/ui/progress/index.js';
  import { Separator } from '$lib/components/ui/separator/index.js';

  import { priorityStore } from '$lib/stores/priority/index.js';
  import { ganttStore } from '$lib/stores/gantt/index.js';
  import type { PriorityItem } from '$lib/stores/priority/index.js';

  let showBlocked = $state(false);

  function handleClick(item: PriorityItem) {
    ganttStore.selectTask(item.task.id);
  }
</script>

<div class="flex h-full flex-col">
  <!-- Header -->
  <div class="flex items-center gap-2 border-b px-4 py-2">
    <TargetArrowIcon class="size-4 text-muted-foreground" />
    <span class="text-sm font-medium">Up Next</span>
    <Badge variant="secondary" class="ml-auto text-[10px]">
      {priorityStore.readyItems.length}
    </Badge>
  </div>

  <!-- Scrollable content -->
  <div class="flex-1 overflow-y-auto">
    {#if priorityStore.readyItems.length === 0 && priorityStore.blockedItems.length === 0}
      <div class="flex flex-col items-center gap-2 p-8 text-muted-foreground">
        <TargetArrowIcon class="size-10 opacity-20" />
        <p class="text-sm font-medium">No tasks</p>
        <p class="text-xs opacity-60">Add tasks to see priorities</p>
      </div>
    {:else}
      <!-- Ready items -->
      <div class="flex flex-col gap-1.5 p-3">
        {#each priorityStore.readyItems as item, i (item.task.id)}
          {@const isSelected = ganttStore.selectedTaskId === item.task.id}
          <!-- svelte-ignore a11y_click_events_have_key_events -->
          <!-- svelte-ignore a11y_interactive_supports_focus -->
          <div
            role="button"
            class="rounded-lg border p-3 transition-all cursor-pointer
              {isSelected ? 'border-primary bg-accent/60' : 'hover:border-primary/30 hover:bg-muted/30'}"
            onclick={() => handleClick(item)}
          >
            <div class="flex items-start gap-2">
              {#if i === 0}
                <FlameIcon class="mt-0.5 size-4 shrink-0 text-orange-400" />
              {:else}
                <span
                  class="mt-1 size-2.5 shrink-0 rounded-full"
                  style="background-color: {item.task.color}"
                ></span>
              {/if}
              <div class="min-w-0 flex-1">
                <p class="text-sm font-medium leading-tight">{item.task.name}</p>
                <p class="mt-1 text-xs text-muted-foreground">{item.reason}</p>
              </div>
              {#if item.unblocksCount > 0}
                <Badge variant="outline" class="shrink-0 text-[10px]">
                  <ArrowUpIcon class="mr-0.5 size-3" />
                  {item.unblocksCount}
                </Badge>
              {/if}
            </div>
            {#if item.task.progress > 0}
              <div class="mt-2 flex items-center gap-2">
                <Progress value={item.task.progress} class="h-1.5 flex-1" />
                <span class="text-[10px] tabular-nums text-muted-foreground">{item.task.progress}%</span>
              </div>
            {/if}
          </div>
        {/each}
      </div>

      <!-- Blocked section -->
      {#if priorityStore.blockedItems.length > 0}
        <Separator />
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <!-- svelte-ignore a11y_interactive_supports_focus -->
        <div
          role="button"
          class="flex cursor-pointer items-center gap-2 px-4 py-2 text-muted-foreground hover:bg-muted/30"
          onclick={() => showBlocked = !showBlocked}
        >
          <LockIcon class="size-3.5" />
          <span class="text-xs font-medium">Blocked</span>
          <Badge variant="secondary" class="ml-auto text-[10px]">
            {priorityStore.blockedItems.length}
          </Badge>
          <ChevronRightIcon class="size-3.5 transition-transform {showBlocked ? 'rotate-90' : ''}" />
        </div>

        {#if showBlocked}
          <div class="flex flex-col gap-1 px-3 pb-3">
            {#each priorityStore.blockedItems as item (item.task.id)}
              {@const isSelected = ganttStore.selectedTaskId === item.task.id}
              <!-- svelte-ignore a11y_click_events_have_key_events -->
              <!-- svelte-ignore a11y_interactive_supports_focus -->
              <div
                role="button"
                class="rounded-lg border border-transparent p-2.5 opacity-50 transition-all cursor-pointer
                  {isSelected ? 'border-primary opacity-80' : 'hover:opacity-70'}"
                onclick={() => handleClick(item)}
              >
                <div class="flex items-start gap-2">
                  <span
                    class="mt-1 size-2 shrink-0 rounded-full"
                    style="background-color: {item.task.color}"
                  ></span>
                  <div class="min-w-0 flex-1">
                    <p class="text-xs font-medium leading-tight">{item.task.name}</p>
                    <p class="mt-0.5 text-[10px] text-muted-foreground">
                      {item.blockedBy.slice(0, 2).join(', ')}{item.blockedBy.length > 2 ? ` +${item.blockedBy.length - 2}` : ''}
                    </p>
                  </div>
                </div>
              </div>
            {/each}
          </div>
        {/if}
      {/if}
    {/if}
  </div>
</div>
```

**Step 2: Verify**

Run: `npm run check`

**Step 3: Commit**

```bash
git add src/lib/components/priority-pane.svelte
git commit -m "feat: create priority-pane component with scored task cards"
```

---

## Task 3: Update page layout to three-column resizable

**Files:**
- Modify: `src/routes/+page.svelte`

**Step 1: Wrap existing layout in horizontal PaneGroup**

Current `+page.svelte`:
```svelte
<Resizable.PaneGroup direction="vertical" class="h-[calc(100vh-1px)]">
  <Resizable.Pane defaultSize={65} minSize={30}>
    <GanttPane />
  </Resizable.Pane>
  <Resizable.Handle withHandle />
  <Resizable.Pane defaultSize={35} minSize={15}>
    <DetailPane />
  </Resizable.Pane>
</Resizable.PaneGroup>
```

Replace with:
```svelte
<script lang="ts">
  import * as Resizable from "$lib/components/ui/resizable/index.js";
  import GanttPane from "$lib/components/gantt-pane.svelte";
  import DetailPane from "$lib/components/detail-pane.svelte";
  import PriorityPane from "$lib/components/priority-pane.svelte";
</script>

<Resizable.PaneGroup direction="horizontal" class="h-[calc(100vh-1px)]">
  <!-- Left: existing gantt + detail vertical split -->
  <Resizable.Pane defaultSize={75} minSize={40}>
    <Resizable.PaneGroup direction="vertical" class="h-full">
      <Resizable.Pane defaultSize={65} minSize={30}>
        <GanttPane />
      </Resizable.Pane>
      <Resizable.Handle withHandle />
      <Resizable.Pane defaultSize={35} minSize={15}>
        <DetailPane />
      </Resizable.Pane>
    </Resizable.PaneGroup>
  </Resizable.Pane>
  <Resizable.Handle withHandle />
  <!-- Right: priority pane -->
  <Resizable.Pane defaultSize={25} minSize={15} maxSize={40}>
    <PriorityPane />
  </Resizable.Pane>
</Resizable.PaneGroup>
```

**Step 2: Verify**

Run: `npm run check`

**Step 3: Commit**

```bash
git add src/routes/+page.svelte
git commit -m "feat: add priority pane as right column in three-pane layout"
```

---

## Task 4: Update system-index.md

**Files:**
- Modify: `docs/system-index.md`

**Step 1: Update docs**

Add to the architecture diagram:
```
+-- PriorityPane (25%) .. Right: scored "work on this next" cards
```

Add store entry for `priorityStore`:
- Derived: `items` (scored + sorted PriorityItem[]), `readyItems`, `blockedItems`
- Scoring: unblocks count, dependency readiness, timeline urgency, in-progress bonus, incomplete todos

Add component entry for `priority-pane.svelte`.

Add interaction walkthrough "How priority scoring works".

Update the page layout description.

**Step 2: Commit**

```bash
git add docs/system-index.md
git commit -m "docs: update system-index with priority pane"
```

---

## Verification checklist

- [ ] `npm run check` passes
- [ ] `npm run build` succeeds
- [ ] Priority pane appears on the right side, full height
- [ ] Resizable handle between main content and priority pane works
- [ ] Existing vertical resize (gantt/detail) still works inside the left side
- [ ] Priority cards show task name, color, reason, unblocks badge
- [ ] Top card (highest score) has a flame icon
- [ ] In-progress tasks show progress bar
- [ ] "Blocked" section is collapsed by default, expands on click
- [ ] Blocked items show what they're blocked by
- [ ] Clicking a priority card selects it in gantt/detail pane
- [ ] Completed tasks (100%) don't appear
- [ ] Milestones and parent nodes don't appear (leaf tasks only)
- [ ] Priority list updates reactively when tasks change
