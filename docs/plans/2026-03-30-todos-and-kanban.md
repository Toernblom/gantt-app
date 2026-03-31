# Todos Tab + Kanban Board Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a "Todos" tab to the detail pane with per-task todo checklists, and implement a Kanban board view accessible via the sidebar "Task List" button — with user-customizable columns, drag-and-drop cards, and a default "Backlog" column.

**Architecture:** Extend the `GanttNode` type with `todos[]` and `kanbanColumnId`. Add `kanbanColumns[]` to `Project` for per-project column definitions. Create a new `kanbanStore` for column management and board-derived state. Add `viewMode` to `ganttStore` to toggle between gantt and kanban views. Use native HTML5 drag-and-drop for moving cards between columns (simple, no library needed). The kanban board renders the current `displayChildren` (respecting drill-down) grouped by column.

**Tech Stack:** SvelteKit 2, Svelte 5 runes, TypeScript, shadcn-svelte (Card, Button, Input, DropdownMenu, ScrollArea), native HTML5 drag-and-drop API

---

## Data model changes summary

```
GanttNode (existing)
  + todos: Todo[]              // per-task checklist items
  + kanbanColumnId: string     // which kanban column this task belongs to (default: 'backlog')

Project (existing)
  + kanbanColumns: KanbanColumn[]  // ordered list of columns (default: [{ id: 'backlog', name: 'Backlog' }])

New types:
  Todo { id: string; text: string; done: boolean }
  KanbanColumn { id: string; name: string }
```

## Store dependency update

```
projectStore  →  ganttStore  →  timelineStore
                     ↓ ↓
              kanbanStore  dialogStore
              (column mgmt,
               board layout)
```

---

## Task 1: Add Todo and KanbanColumn types to data model

**Files:**
- Modify: `src/lib/types.ts`

**Step 1: Add new interfaces and update existing ones**

Add to `src/lib/types.ts`:

```typescript
export interface Todo {
  id: string;
  text: string;
  done: boolean;
}

export interface KanbanColumn {
  id: string;
  name: string;
}
```

Update `GanttNode` — add two new fields at the end:

```typescript
export interface GanttNode {
  // ... existing fields ...
  dependencies: Dependency[];
  todos: Todo[];                // NEW
  kanbanColumnId: string;       // NEW — default 'backlog'
}
```

Update `Project` — add kanban columns:

```typescript
export interface Project {
  id: string;
  name: string;
  description?: string;
  children: GanttNode[];
  kanbanColumns: KanbanColumn[];  // NEW — default [{ id: 'backlog', name: 'Backlog' }]
}
```

**Step 2: Update sample data in projectStore**

Modify `src/lib/stores/project/projectStore.svelte.ts`:

Every `GanttNode` object in the sample data needs `todos: []` and `kanbanColumnId: 'backlog'` added.

Every `Project` object needs `kanbanColumns: [{ id: 'backlog', name: 'Backlog' }]` added.

**Step 3: Update dialogStore's submit method**

Modify `src/lib/stores/dialog/dialogStore.svelte.ts` — in the `submit()` method, the `newNode` object needs:

```typescript
const newNode: GanttNode = {
  // ... existing fields ...
  dependencies: [],
  todos: [],                    // NEW
  kanbanColumnId: 'backlog',    // NEW
};
```

**Step 4: Verify**

Run: `npm run check`

**Step 5: Commit**

```bash
git add src/lib/types.ts src/lib/stores/project/projectStore.svelte.ts src/lib/stores/dialog/dialogStore.svelte.ts
git commit -m "feat: add Todo and KanbanColumn types to data model"
```

---

## Task 2: Add todo CRUD methods to ganttStore

**Files:**
- Modify: `src/lib/stores/gantt/ganttStore.svelte.ts`

**Step 1: Add todo methods**

Add these methods to `GanttStore` class, after the existing `removeDependency` method (around line 173):

```typescript
// --- Methods: todos ---
addTodo(taskId: string, text: string): void {
  const node = findNodeById(projectStore.project.children, taskId);
  if (!node) return;
  node.todos.push({ id: `todo-${Date.now()}`, text, done: false });
  this._triggerSave();
}

toggleTodo(taskId: string, todoId: string): void {
  const node = findNodeById(projectStore.project.children, taskId);
  if (!node) return;
  const todo = node.todos.find(t => t.id === todoId);
  if (todo) todo.done = !todo.done;
  this._triggerSave();
}

updateTodoText(taskId: string, todoId: string, text: string): void {
  const node = findNodeById(projectStore.project.children, taskId);
  if (!node) return;
  const todo = node.todos.find(t => t.id === todoId);
  if (todo) todo.text = text;
  this._triggerSave();
}

removeTodo(taskId: string, todoId: string): void {
  const node = findNodeById(projectStore.project.children, taskId);
  if (!node) return;
  node.todos = node.todos.filter(t => t.id !== todoId);
  this._triggerSave();
}
```

**Step 2: Add viewMode state and setter**

Add to the "Core state" section (after line 23):

```typescript
viewMode = $state<'gantt' | 'kanban'>('gantt');
```

Add method:

```typescript
setViewMode(mode: 'gantt' | 'kanban'): void {
  this.viewMode = mode;
}
```

**Step 3: Verify**

Run: `npm run check`

**Step 4: Commit**

```bash
git add src/lib/stores/gantt/ganttStore.svelte.ts
git commit -m "feat: add todo CRUD methods and viewMode to ganttStore"
```

---

## Task 3: Add "Todos" tab to detail-pane

**Files:**
- Modify: `src/lib/components/detail-pane.svelte`

**Step 1: Add the Todos tab trigger**

In the `<Tabs.List>`, add a new trigger after "description" and before "dependencies":

```svelte
<Tabs.Trigger value="todos">Todos</Tabs.Trigger>
```

The tabs should be: Details, Description, **Todos**, Dependencies, Subtasks.

**Step 2: Add the Todos tab content**

Add a new `<Tabs.Content value="todos">` block. Place it between the Description tab content and the Dependencies tab content.

```svelte
<!-- Todos tab -->
<Tabs.Content value="todos" class="flex-1 overflow-hidden">
  <ScrollArea.Root class="h-full">
    <div class="space-y-1 p-4">
      {#if ganttStore.selectedTask}
        {@const todos = ganttStore.selectedTask.todos ?? []}
        {#each todos as todo (todo.id)}
          <div class="flex items-center gap-2 rounded p-1 hover:bg-muted/50 group">
            <Checkbox
              id={todo.id}
              checked={todo.done}
              onCheckedChange={() => ganttStore.toggleTodo(ganttStore.selectedTaskId!, todo.id)}
            />
            <label
              for={todo.id}
              class="flex-1 cursor-pointer text-sm"
              class:line-through={todo.done}
              class:text-muted-foreground={todo.done}
            >
              {todo.text}
            </label>
            <Button
              variant="ghost"
              size="icon"
              class="size-6 text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-destructive"
              onclick={() => ganttStore.removeTodo(ganttStore.selectedTaskId!, todo.id)}
            >
              <XIcon class="size-3" />
            </Button>
          </div>
        {/each}
        {#if todos.length === 0}
          <p class="py-4 text-center text-xs text-muted-foreground">No todos yet</p>
        {/if}
        <Separator class="my-2" />
        <form
          class="flex gap-2"
          onsubmit={(e) => {
            e.preventDefault();
            const form = e.target as HTMLFormElement;
            const input = form.elements.namedItem('new-todo') as HTMLInputElement;
            const text = input.value.trim();
            if (text && ganttStore.selectedTaskId) {
              ganttStore.addTodo(ganttStore.selectedTaskId, text);
              input.value = '';
            }
          }}
        >
          <Input
            name="new-todo"
            placeholder="Add a todo..."
            class="h-8 flex-1 text-xs"
          />
          <Button type="submit" variant="outline" size="sm" class="text-xs">
            <PlusIcon class="mr-1 size-3" />
            Add
          </Button>
        </form>
      {/if}
    </div>
  </ScrollArea.Root>
</Tabs.Content>
```

**Step 3: Verify**

Run: `npm run check`

**Step 4: Commit**

```bash
git add src/lib/components/detail-pane.svelte
git commit -m "feat: add Todos tab to detail pane with checklist UI"
```

---

## Task 4: Wire sidebar view toggle

**Files:**
- Modify: `src/lib/components/app-sidebar.svelte`

**Step 1: Wire the view buttons to ganttStore.viewMode**

Replace the static `isActive` props with reactive ones, and add `onclick` handlers:

```svelte
<Sidebar.MenuItem>
  <Sidebar.MenuButton
    isActive={ganttStore.viewMode === 'gantt'}
    tooltipContent="Gantt Chart"
    onclick={() => ganttStore.setViewMode('gantt')}
  >
    <GanttChartIcon />
    <span>Gantt Chart</span>
  </Sidebar.MenuButton>
</Sidebar.MenuItem>
<Sidebar.MenuItem>
  <Sidebar.MenuButton
    isActive={ganttStore.viewMode === 'kanban'}
    tooltipContent="Task List"
    onclick={() => ganttStore.setViewMode('kanban')}
  >
    <ListIcon />
    <span>Task List</span>
  </Sidebar.MenuButton>
</Sidebar.MenuItem>
```

**Step 2: Verify**

Run: `npm run check`

**Step 3: Commit**

```bash
git add src/lib/components/app-sidebar.svelte
git commit -m "feat: wire sidebar view toggle to ganttStore.viewMode"
```

---

## Task 5: Create kanban store

**Files:**
- Create: `src/lib/stores/kanban/kanbanStore.svelte.ts`
- Create: `src/lib/stores/kanban/index.ts`

**Step 1: Create kanbanStore.svelte.ts**

```typescript
import { projectStore } from '../project/index.js';
import { ganttStore } from '../gantt/index.js';
import type { GanttNode, KanbanColumn } from '$lib/types';
import { findNodeById } from '../gantt/helpers.js';

class KanbanStore {
  // --- Derived: current project's columns ---
  columns = $derived<KanbanColumn[]>(projectStore.project.kanbanColumns ?? [{ id: 'backlog', name: 'Backlog' }]);

  // --- Derived: tasks grouped by column ---
  // Uses ganttStore.displayChildren to respect drill-down (same tasks shown in gantt view).
  // Flattens all visible tasks (non-recursive — only the direct display children and their children one level).
  columnTasks = $derived.by<Map<string, GanttNode[]>>(() => {
    const map = new Map<string, GanttNode[]>();
    // Initialize all columns (even empty ones show)
    for (const col of this.columns) {
      map.set(col.id, []);
    }
    // Collect all leaf tasks from displayChildren tree (recursively)
    const allTasks = this._collectAllNodes(ganttStore.displayChildren);
    for (const task of allTasks) {
      const colId = task.kanbanColumnId || 'backlog';
      const list = map.get(colId);
      if (list) {
        list.push(task);
      } else {
        // Task references a column that doesn't exist — put in backlog
        const backlog = map.get('backlog');
        if (backlog) backlog.push(task);
      }
    }
    return map;
  });

  // --- Drag state ---
  draggedTaskId = $state<string | null>(null);

  // --- Methods: column management ---
  addColumn(name: string): void {
    const id = `col-${Date.now()}`;
    projectStore.project.kanbanColumns.push({ id, name });
    ganttStore['_triggerSave']();
  }

  removeColumn(columnId: string): void {
    if (columnId === 'backlog') return; // Can't remove backlog
    const cols = projectStore.project.kanbanColumns;
    const idx = cols.findIndex(c => c.id === columnId);
    if (idx === -1) return;
    // Move all tasks in this column back to backlog
    const allTasks = this._collectAllNodes(projectStore.project.children);
    for (const task of allTasks) {
      if (task.kanbanColumnId === columnId) {
        task.kanbanColumnId = 'backlog';
      }
    }
    cols.splice(idx, 1);
    ganttStore['_triggerSave']();
  }

  renameColumn(columnId: string, name: string): void {
    const col = projectStore.project.kanbanColumns.find(c => c.id === columnId);
    if (col) col.name = name;
    ganttStore['_triggerSave']();
  }

  reorderColumns(orderedIds: string[]): void {
    const lookup = new Map(projectStore.project.kanbanColumns.map(c => [c.id, c]));
    const reordered: KanbanColumn[] = [];
    for (const id of orderedIds) {
      const col = lookup.get(id);
      if (col) reordered.push(col);
    }
    projectStore.project.kanbanColumns.splice(0, projectStore.project.kanbanColumns.length, ...reordered);
    ganttStore['_triggerSave']();
  }

  // --- Methods: task movement ---
  moveTask(taskId: string, targetColumnId: string): void {
    const node = findNodeById(projectStore.project.children, taskId);
    if (!node) return;
    node.kanbanColumnId = targetColumnId;
    ganttStore['_triggerSave']();
  }

  // --- Methods: drag ---
  startDrag(taskId: string): void {
    this.draggedTaskId = taskId;
  }

  endDrag(): void {
    this.draggedTaskId = null;
  }

  // --- Private helpers ---
  private _collectAllNodes(nodes: GanttNode[]): GanttNode[] {
    const result: GanttNode[] = [];
    for (const node of nodes) {
      result.push(node);
      if (node.children.length > 0) {
        result.push(...this._collectAllNodes(node.children));
      }
    }
    return result;
  }
}

export const kanbanStore = new KanbanStore();
```

**Step 2: Create index.ts**

```typescript
export { kanbanStore } from './kanbanStore.svelte.js';
```

**Step 3: Verify**

Run: `npm run check`

**Step 4: Commit**

```bash
git add src/lib/stores/kanban/
git commit -m "feat: create kanban store for column management and task grouping"
```

---

## Task 6: Create kanban-card component

**Files:**
- Create: `src/lib/components/kanban-card.svelte`

**Step 1: Create the component**

A compact card for each task in the kanban board. Shows name, color dot, progress bar, and todo count.

```svelte
<script lang="ts">
  import type { GanttNode } from '$lib/types';
  import { ganttStore } from '$lib/stores/gantt/index.js';
  import { kanbanStore } from '$lib/stores/kanban/index.js';
  import { Badge } from '$lib/components/ui/badge/index.js';
  import { Progress } from '$lib/components/ui/progress/index.js';

  interface Props {
    task: GanttNode;
  }

  let { task }: Props = $props();

  let isSelected = $derived(ganttStore.selectedTaskId === task.id);
  let todoCount = $derived(task.todos?.length ?? 0);
  let todoDone = $derived(task.todos?.filter(t => t.done).length ?? 0);
  let hasTodos = $derived(todoCount > 0);

  function handleClick() {
    ganttStore.selectTask(task.id);
  }

  function handleDragStart(e: DragEvent) {
    if (!e.dataTransfer) return;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', task.id);
    kanbanStore.startDrag(task.id);
  }

  function handleDragEnd() {
    kanbanStore.endDrag();
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="rounded-lg border bg-card p-3 shadow-sm cursor-grab active:cursor-grabbing
    transition-all hover:shadow-md
    {isSelected ? 'ring-2 ring-primary' : 'hover:border-primary/30'}"
  draggable="true"
  ondragstart={handleDragStart}
  ondragend={handleDragEnd}
  onclick={handleClick}
>
  <div class="flex items-start gap-2">
    <span
      class="mt-1 size-2.5 shrink-0 rounded-full"
      style="background-color: {task.color}"
    ></span>
    <div class="min-w-0 flex-1">
      <p class="text-sm font-medium leading-tight">{task.name}</p>
      {#if task.startDate && task.endDate && !task.isMilestone}
        <p class="mt-1 text-xs text-muted-foreground">
          {task.startDate} &rarr; {task.endDate}
        </p>
      {/if}
      {#if task.isMilestone}
        <Badge variant="outline" class="mt-1 text-[10px]">Milestone</Badge>
      {/if}
    </div>
  </div>

  {#if task.progress > 0 || hasTodos}
    <div class="mt-2 flex items-center gap-2">
      {#if task.progress > 0}
        <Progress value={task.progress} class="h-1.5 flex-1" />
        <span class="text-[10px] tabular-nums text-muted-foreground">{task.progress}%</span>
      {/if}
    </div>
  {/if}

  {#if hasTodos}
    <div class="mt-1.5 text-[10px] text-muted-foreground">
      {todoDone}/{todoCount} todos
    </div>
  {/if}
</div>
```

**Step 2: Verify**

Run: `npm run check`

**Step 3: Commit**

```bash
git add src/lib/components/kanban-card.svelte
git commit -m "feat: create kanban-card component"
```

---

## Task 7: Create kanban-column component

**Files:**
- Create: `src/lib/components/kanban-column.svelte`

**Step 1: Create the component**

A single column with a header (editable name, task count, remove button) and a droppable area for cards.

```svelte
<script lang="ts">
  import PlusIcon from '@tabler/icons-svelte/icons/plus';
  import DotsVerticalIcon from '@tabler/icons-svelte/icons/dots-vertical';
  import TrashIcon from '@tabler/icons-svelte/icons/trash';
  import PencilIcon from '@tabler/icons-svelte/icons/pencil';

  import * as DropdownMenu from '$lib/components/ui/dropdown-menu/index.js';
  import * as ScrollArea from '$lib/components/ui/scroll-area/index.js';
  import { Button } from '$lib/components/ui/button/index.js';

  import type { GanttNode, KanbanColumn } from '$lib/types';
  import { kanbanStore } from '$lib/stores/kanban/index.js';
  import { dialogStore } from '$lib/stores/dialog/index.js';
  import KanbanCard from './kanban-card.svelte';

  interface Props {
    column: KanbanColumn;
    tasks: GanttNode[];
  }

  let { column, tasks }: Props = $props();

  let isDragOver = $state(false);
  let isEditing = $state(false);
  let editName = $state('');

  function handleDragOver(e: DragEvent) {
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
    isDragOver = true;
  }

  function handleDragLeave() {
    isDragOver = false;
  }

  function handleDrop(e: DragEvent) {
    e.preventDefault();
    isDragOver = false;
    const taskId = e.dataTransfer?.getData('text/plain');
    if (taskId) {
      kanbanStore.moveTask(taskId, column.id);
    }
  }

  function handleStartEdit() {
    editName = column.name;
    isEditing = true;
  }

  function handleFinishEdit() {
    const trimmed = editName.trim();
    if (trimmed && trimmed !== column.name) {
      kanbanStore.renameColumn(column.id, trimmed);
    }
    isEditing = false;
  }

  function handleEditKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') handleFinishEdit();
    if (e.key === 'Escape') isEditing = false;
  }
</script>

<div
  class="flex h-full w-72 shrink-0 flex-col rounded-lg border bg-muted/30"
  class:ring-2={isDragOver}
  class:ring-primary={isDragOver}
  ondragover={handleDragOver}
  ondragleave={handleDragLeave}
  ondrop={handleDrop}
>
  <!-- Column header -->
  <div class="flex items-center gap-2 px-3 py-2.5">
    {#if isEditing}
      <input
        class="h-6 flex-1 rounded border bg-background px-1.5 text-sm font-medium focus:outline-none focus:ring-1 focus:ring-ring"
        bind:value={editName}
        onblur={handleFinishEdit}
        onkeydown={handleEditKeydown}
        autofocus
      />
    {:else}
      <span class="flex-1 truncate text-sm font-medium">{column.name}</span>
    {/if}
    <span class="rounded-full bg-muted px-1.5 py-0.5 text-[10px] tabular-nums text-muted-foreground">
      {tasks.length}
    </span>

    <DropdownMenu.Root>
      <DropdownMenu.Trigger>
        {#snippet child({ props })}
          <Button variant="ghost" size="icon" class="size-6" {...props}>
            <DotsVerticalIcon class="size-3.5" />
          </Button>
        {/snippet}
      </DropdownMenu.Trigger>
      <DropdownMenu.Content class="w-40" align="end">
        <DropdownMenu.Item onclick={handleStartEdit}>
          <PencilIcon class="mr-2 size-4" />
          Rename
        </DropdownMenu.Item>
        <DropdownMenu.Item onclick={() => dialogStore.requestCreate()}>
          <PlusIcon class="mr-2 size-4" />
          Add Task
        </DropdownMenu.Item>
        {#if column.id !== 'backlog'}
          <DropdownMenu.Separator />
          <DropdownMenu.Item
            class="text-destructive focus:text-destructive"
            onclick={() => kanbanStore.removeColumn(column.id)}
          >
            <TrashIcon class="mr-2 size-4" />
            Delete Column
          </DropdownMenu.Item>
        {/if}
      </DropdownMenu.Content>
    </DropdownMenu.Root>
  </div>

  <!-- Cards area -->
  <ScrollArea.Root class="flex-1">
    <div class="flex flex-col gap-2 px-2 pb-2">
      {#each tasks as task (task.id)}
        <KanbanCard {task} />
      {/each}
    </div>
  </ScrollArea.Root>
</div>
```

**Step 2: Verify**

Run: `npm run check`

**Step 3: Commit**

```bash
git add src/lib/components/kanban-column.svelte
git commit -m "feat: create kanban-column component with drag-drop and column management"
```

---

## Task 8: Create kanban-board component

**Files:**
- Create: `src/lib/components/kanban-board.svelte`

**Step 1: Create the component**

The main kanban board: horizontal scroll of columns + "Add Column" button at the end.

```svelte
<script lang="ts">
  import PlusIcon from '@tabler/icons-svelte/icons/plus';
  import LayoutGridIcon from '@tabler/icons-svelte/icons/layout-grid';

  import { Button } from '$lib/components/ui/button/index.js';
  import { Input } from '$lib/components/ui/input/index.js';

  import { kanbanStore } from '$lib/stores/kanban/index.js';
  import { ganttStore } from '$lib/stores/gantt/index.js';
  import KanbanColumn from './kanban-column.svelte';

  let isAddingColumn = $state(false);
  let newColumnName = $state('');

  function handleAddColumn() {
    const name = newColumnName.trim();
    if (!name) return;
    kanbanStore.addColumn(name);
    newColumnName = '';
    isAddingColumn = false;
  }

  function handleAddKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') handleAddColumn();
    if (e.key === 'Escape') { isAddingColumn = false; newColumnName = ''; }
  }
</script>

{#if ganttStore.hasTasks}
  <div class="flex h-full gap-3 overflow-x-auto p-4">
    {#each kanbanStore.columns as column (column.id)}
      <KanbanColumn
        {column}
        tasks={kanbanStore.columnTasks.get(column.id) ?? []}
      />
    {/each}

    <!-- Add column button / inline form -->
    <div class="flex h-fit w-72 shrink-0 flex-col">
      {#if isAddingColumn}
        <div class="flex flex-col gap-2 rounded-lg border bg-muted/30 p-3">
          <Input
            bind:value={newColumnName}
            placeholder="Column name..."
            class="h-8 text-sm"
            onkeydown={handleAddKeydown}
            autofocus
          />
          <div class="flex gap-2">
            <Button size="sm" class="flex-1 text-xs" onclick={handleAddColumn}>
              Add
            </Button>
            <Button variant="outline" size="sm" class="text-xs" onclick={() => { isAddingColumn = false; newColumnName = ''; }}>
              Cancel
            </Button>
          </div>
        </div>
      {:else}
        <Button
          variant="outline"
          class="w-full justify-start border-dashed text-muted-foreground"
          onclick={() => isAddingColumn = true}
        >
          <PlusIcon class="mr-2 size-4" />
          Add Column
        </Button>
      {/if}
    </div>
  </div>
{:else}
  <div class="flex h-full items-center justify-center">
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
```

**Step 2: Verify**

Run: `npm run check`

**Step 3: Commit**

```bash
git add src/lib/components/kanban-board.svelte
git commit -m "feat: create kanban-board component with add-column flow"
```

---

## Task 9: Wire gantt-pane to switch between views

**Files:**
- Modify: `src/lib/components/gantt-pane.svelte`

**Step 1: Import KanbanBoard and conditionally render**

Add import:

```typescript
import KanbanBoard from "./kanban-board.svelte";
```

Replace the "Main area" div (currently around line 142-145):

```svelte
<!-- Main area -->
<div class="flex-1 overflow-hidden">
  {#if ganttStore.viewMode === 'kanban'}
    <KanbanBoard />
  {:else}
    <GanttChart />
  {/if}
</div>
```

**Step 2: Conditionally show zoom controls**

The zoom toggle group only makes sense in gantt mode. Wrap it:

```svelte
{#if ganttStore.viewMode === 'gantt'}
  <Separator orientation="vertical" class="h-4" />
  <!-- Zoom ToggleGroup -->
  <ToggleGroup.Root type="single" variant="outline" size="sm" value={zoomLevel} onValueChange={onZoomChange}>
    <ToggleGroup.Item value="day">Day</ToggleGroup.Item>
    <ToggleGroup.Item value="week">Week</ToggleGroup.Item>
    <ToggleGroup.Item value="month">Month</ToggleGroup.Item>
    <ToggleGroup.Item value="quarter">Qtr</ToggleGroup.Item>
  </ToggleGroup.Root>
{/if}
```

**Step 3: Verify**

Run: `npm run check`

**Step 4: Commit**

```bash
git add src/lib/components/gantt-pane.svelte
git commit -m "feat: wire gantt-pane to switch between gantt and kanban views"
```

---

## Task 10: Update system-index.md

**Files:**
- Modify: `docs/system-index.md`

**Step 1: Update the docs**

Add entries for:
- New types (`Todo`, `KanbanColumn`) in the Types table
- New fields on `GanttNode` (`todos`, `kanbanColumnId`) and `Project` (`kanbanColumns`)
- New store: `kanbanStore` with its directory
- New components: `kanban-board.svelte`, `kanban-column.svelte`, `kanban-card.svelte`
- Updated data flow diagram showing `kanbanStore`
- New interaction walkthrough: "How view switching works" and "How kanban drag-and-drop works"
- Update `ganttStore` entry to include `viewMode`, todo CRUD methods
- Update `detail-pane` entry to mention Todos tab

**Step 2: Commit**

```bash
git add docs/system-index.md
git commit -m "docs: update system-index with todos tab, kanban board, and new stores"
```

---

## Verification checklist

After all tasks complete:
- [ ] `npm run check` passes
- [ ] `npm run build` succeeds
- [ ] Sidebar "Gantt Chart" / "Task List" buttons toggle between views
- [ ] Kanban board shows tasks grouped by column
- [ ] "Backlog" column exists by default and cannot be deleted
- [ ] User can add new columns via "Add Column" button
- [ ] User can rename columns via dropdown menu
- [ ] User can delete non-backlog columns (tasks move to backlog)
- [ ] Dragging a card to another column updates `kanbanColumnId`
- [ ] Detail pane "Todos" tab shows per-task checklist
- [ ] Adding, checking, and deleting todos works
- [ ] Selecting a task in kanban highlights it in detail pane
- [ ] Drill-down (breadcrumbs) works in kanban view too
- [ ] Auto-save triggers on kanban changes
