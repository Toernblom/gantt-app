# Nested Sub-Gantt (Drill-Down) Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Double-clicking any task promotes it to an epic-like container and opens a nested sub-Gantt view scoped to that task's children. Breadcrumbs extend dynamically and clicking them navigates back up. Any task at any depth can become a container — enabling infinite nesting.

**Architecture:** Replace the fixed 3-level hierarchy (Project → Epic → Task → Subtask) with a **recursive tree** where every node is a `GanttNode` that can have children. The store tracks a `focusPath: string[]` — an ordered list of node IDs representing the current drill-down breadcrumb. `flattenRows()` only flattens children of the focused node. Double-click on any row pushes its ID onto `focusPath`, re-scoping the Gantt. Breadcrumb clicks pop back to that level.

**Key Decisions:**
- **Single recursive type** `GanttNode` replaces `Epic`, `Task`, `Subtask` — DRY, enables infinite depth
- **`focusPath`** is the navigation stack — `[]` = project root, `['epic-1']` = inside that epic, `['epic-1', 'task-2']` = inside that task
- **Double-click** = drill into (push focusPath). Single-click = select. Expand chevron = show inline children.
- **Migration** of sample data from old types to new `GanttNode[]` tree
- **Breadcrumb** renders from `focusPath`, each segment is clickable to pop back
- **Promotion** is implicit: double-clicking a leaf node pushes it into focusPath, showing an empty Gantt (ready for adding children)

---

## Data Model Changes

### Current (3 rigid levels)
```
Project { epics: Epic[] }
  Epic { tasks: Task[] }
    Task { subtasks: Subtask[] }
      Subtask (leaf)
```

### New (recursive)
```
Project { id, name, children: GanttNode[] }
  GanttNode { id, name, children: GanttNode[], ... }
    GanttNode { ... }
      GanttNode { ... }  // infinite depth
```

### New `GanttNode` interface
```typescript
export interface GanttNode {
  id: string;
  name: string;
  color: string;
  startDate: string;     // ISO date
  endDate: string;       // ISO date
  progress: number;      // 0-100
  description?: string;
  isMilestone: boolean;
  expanded: boolean;      // inline expand/collapse
  children: GanttNode[];
  dependencies: Dependency[];
}
```

### New `Project` interface
```typescript
export interface Project {
  id: string;
  name: string;
  description?: string;
  children: GanttNode[];  // was: epics: Epic[]
}
```

### Updated `GanttRow`
```typescript
export interface GanttRow {
  id: string;
  name: string;
  level: number;          // relative to focused node (0 = direct child)
  startDate: string;
  endDate: string;
  progress: number;
  color: string;
  isMilestone: boolean;
  hasChildren: boolean;
  expanded: boolean;
  dependencies: Dependency[];
}
```

Note: `type: 'epic' | 'task' | 'subtask'` is removed — all nodes are the same type. Level 0 rows (direct children of the focused node) are styled like epics. Deeper rows are styled like tasks/subtasks.

---

## Navigation Model

```
focusPath = []                        → shows project root children (top-level epics)
focusPath = ['epic-1']                → shows epic-1's children (tasks)
focusPath = ['epic-1', 'task-2']      → shows task-2's children (sub-tasks as full Gantt)
focusPath = ['epic-1', 'task-2', 'x'] → shows x's children (infinite depth)
```

**Breadcrumb rendering:**
```
[Project Name] > [epic-1 name] > [task-2 name] > [x name]
 ↑ click = pop to []  ↑ click = pop to ['epic-1']  ↑ current (not clickable)
```

---

## Implementation Tasks

### Task 1: New Type Definitions
**Files:**
- Modify: `src/lib/types.ts`

Replace the old 4-type hierarchy with the recursive `GanttNode` type.

**Step 1: Replace type definitions**

Replace `Epic`, `Task`, `Subtask` interfaces with one `GanttNode`. Update `Project` to use `children: GanttNode[]`. Remove the `type` field from `GanttRow` since all nodes are uniform. Keep `Dependency`, `ZoomConfig`, `ZoomLevel`, `ROW_HEIGHT`, `TASK_LIST_WIDTH`, `ZOOM_CONFIGS` unchanged.

```typescript
// OLD — delete these:
// export interface Epic { ... }
// export interface Task { ... }
// export interface Subtask { ... }

// NEW — single recursive node type:
export interface GanttNode {
  id: string;
  name: string;
  color: string;
  startDate: string;
  endDate: string;
  progress: number;
  description?: string;
  isMilestone: boolean;
  expanded: boolean;
  children: GanttNode[];
  dependencies: Dependency[];
}

export interface Project {
  id: string;
  name: string;
  description?: string;
  children: GanttNode[];
}

export interface GanttRow {
  id: string;
  name: string;
  level: number;
  startDate: string;
  endDate: string;
  progress: number;
  color: string;
  isMilestone: boolean;
  hasChildren: boolean;
  expanded: boolean;
  dependencies: Dependency[];
}
```

**Step 2: Verify no TypeScript errors from the type change alone**

Run: `npx svelte-check --tsconfig ./tsconfig.json`

This WILL produce errors in the store and components — that's expected. Just confirm the types file itself is valid.

**Step 3: Commit**

```bash
git add src/lib/types.ts
git commit -m "refactor: replace Epic/Task/Subtask with recursive GanttNode type"
```

---

### Task 2: Migrate Store to Recursive Model
**Files:**
- Modify: `src/lib/stores/project.svelte.ts`

Rewrite sample data, `flattenRows()`, `computeDateRange()`, all CRUD methods, and add `focusPath` navigation.

**Step 1: Rewrite sample data**

Convert the existing 3 sample projects from the old `{ epics: [{ tasks: [{ subtasks }] }] }` shape into the new `{ children: [{ children: [{ children }] }] }` shape. Keep the same IDs, names, dates, colors, and dependencies so the UI looks the same.

Example conversion for one epic:
```typescript
// OLD:
// { id: 'epic-1', name: 'Discovery', color: '#3b82f6', expanded: true,
//   tasks: [{ id: 'task-1-1', name: 'Interviews', subtasks: [...], dependencies: [...] }] }

// NEW:
{ id: 'epic-1', name: 'Discovery & Planning', color: '#3b82f6',
  startDate: '2026-03-16', endDate: '2026-03-27', progress: 0,
  isMilestone: false, expanded: true, dependencies: [],
  children: [
    { id: 'task-1-1', name: 'Stakeholder Interviews', color: '#3b82f6',
      startDate: '2026-03-16', endDate: '2026-03-18', progress: 100,
      isMilestone: false, expanded: false, dependencies: [], children: [],
      description: 'Conduct interviews...' },
    // ... more children
  ] }
```

Key change: epics now have explicit `startDate`/`endDate` (previously computed from child tasks). Set them to span their children. Each node has `color`, `dependencies`, `children`.

**Step 2: Add `focusPath` state and `focusedNode` derived**

```typescript
class ProjectStore {
  projects = $state<Project[]>(deepClone(ALL_SAMPLE_PROJECTS));
  activeProjectId = $state<string>('proj-1');
  focusPath = $state<string[]>([]);
  zoomLevel = $state<ZoomLevel>('week');
  selectedTaskId = $state<string | null>(null);
  hoveredTaskId = $state<string | null>(null);

  project = $derived<Project>(
    this.projects.find((p) => p.id === this.activeProjectId) ?? this.projects[0],
  );

  /**
   * The node whose children are currently displayed in the Gantt.
   * null = project root (show project.children).
   */
  focusedNode = $derived<GanttNode | null>(
    this.focusPath.length === 0
      ? null
      : findNodeById(this.project.children, this.focusPath[this.focusPath.length - 1])
  );

  /** The children to flatten and display. */
  displayChildren = $derived<GanttNode[]>(
    this.focusedNode ? this.focusedNode.children : this.project.children
  );

  rows = $derived<GanttRow[]>(flattenNodes(this.displayChildren));
  dateRange = $derived<[string, string]>(computeDateRange(this.rows));
  // ...
}
```

**Step 3: Rewrite `flattenRows` → `flattenNodes`**

```typescript
function flattenNodes(nodes: GanttNode[], parentColor?: string): GanttRow[] {
  const rows: GanttRow[] = [];

  function walk(node: GanttNode, level: number, inheritedColor: string) {
    const color = node.color || inheritedColor;
    rows.push({
      id: node.id,
      name: node.name,
      level,
      startDate: node.startDate,
      endDate: node.endDate,
      progress: node.progress,
      color,
      isMilestone: node.isMilestone,
      hasChildren: node.children.length > 0,
      expanded: node.expanded,
      dependencies: node.dependencies,
    });

    if (node.expanded) {
      for (const child of node.children) {
        walk(child, level + 1, color);
      }
    }
  }

  for (const node of nodes) {
    walk(node, 0, node.color);
  }

  return rows;
}
```

**Step 4: Rewrite helper functions for recursive tree**

```typescript
/** Find a node anywhere in the tree by ID. */
function findNodeById(nodes: GanttNode[], id: string): GanttNode | null {
  for (const node of nodes) {
    if (node.id === id) return node;
    const found = findNodeById(node.children, id);
    if (found) return found;
  }
  return null;
}

/** Find a node in the tree, searching from project.children. */
function findNodeInProject(project: Project, id: string): GanttNode | null {
  return findNodeById(project.children, id);
}
```

**Step 5: Rewrite store methods for recursive tree**

All methods (`toggleExpand`, `updateTask`, `deleteTask`, `addTask`) need to search the recursive tree instead of the fixed 3-level structure:

```typescript
toggleExpand(id: string): void {
  const node = findNodeById(this.project.children, id);
  if (node) node.expanded = !node.expanded;
}

updateTask(id: string, updates: Partial<GanttNode>): void {
  const node = findNodeById(this.project.children, id);
  if (node) Object.assign(node, updates);
}

deleteTask(id: string): void {
  if (deleteNodeById(this.project.children, id)) {
    if (this.selectedTaskId === id) this.selectedTaskId = null;
    this._cleanDependencies(id);
    // Also remove from focusPath if it was in the path
    const idx = this.focusPath.indexOf(id);
    if (idx !== -1) this.focusPath = this.focusPath.slice(0, idx);
  }
}

/** Recursively delete a node from a children array. Returns true if found. */
private static _deleteNode(nodes: GanttNode[], id: string): boolean {
  const idx = nodes.findIndex((n) => n.id === id);
  if (idx !== -1) { nodes.splice(idx, 1); return true; }
  for (const node of nodes) {
    if (ProjectStore._deleteNode(node.children, id)) return true;
  }
  return false;
}
```

**Step 6: Add navigation methods**

```typescript
/** Double-click: drill into a node, showing its children as a full Gantt. */
drillInto(id: string): void {
  const node = findNodeById(this.project.children, id);
  if (!node) return;
  this.focusPath = [...this.focusPath, id];
  this.selectedTaskId = null;
  this.hoveredTaskId = null;
}

/** Breadcrumb click: navigate back to a specific depth. */
navigateTo(depth: number): void {
  // depth 0 = project root, depth 1 = first focusPath item, etc.
  this.focusPath = this.focusPath.slice(0, depth);
  this.selectedTaskId = null;
  this.hoveredTaskId = null;
}

/** Breadcrumb segments for rendering. */
breadcrumbs = $derived.by<{ id: string | null; name: string; depth: number }[]>(() => {
  const segments: { id: string | null; name: string; depth: number }[] = [
    { id: null, name: this.project.name, depth: 0 },
  ];
  let nodes = this.project.children;
  for (let i = 0; i < this.focusPath.length; i++) {
    const node = nodes.find((n) => n.id === this.focusPath[i]);
    if (!node) break;
    segments.push({ id: node.id, name: node.name, depth: i + 1 });
    nodes = node.children;
  }
  return segments;
});
```

**Step 7: Update `selectedTask` derived**

```typescript
selectedTask = $derived<GanttNode | null>(
  this.selectedTaskId ? findNodeById(this.project.children, this.selectedTaskId) : null,
);
```

**Step 8: Update `switchProject` to reset focusPath**

```typescript
switchProject(projectId: string): void {
  if (this.projects.some((p) => p.id === projectId)) {
    this.activeProjectId = projectId;
    this.focusPath = [];
    this.selectedTaskId = null;
    this.hoveredTaskId = null;
  }
}
```

**Step 9: Run type check**

Run: `npx svelte-check --tsconfig ./tsconfig.json`
Fix any remaining type errors in the store.

**Step 10: Commit**

```bash
git add src/lib/stores/project.svelte.ts
git commit -m "refactor: migrate store to recursive GanttNode with focusPath navigation"
```

---

### Task 3: Update Detail Pane for GanttNode
**Files:**
- Modify: `src/lib/components/detail-pane.svelte`

The detail pane currently imports `Task`, `Subtask` and checks `'subtasks' in selectedTask` to distinguish them. Replace with `GanttNode` — all nodes have the same shape.

**Step 1: Update imports and type references**

```typescript
// OLD:
import type { Task, Subtask } from "$lib/types.js";
// NEW:
import type { GanttNode } from "$lib/types.js";
```

**Step 2: Simplify type checks**

Remove `isTask` / `taskAsTask` casting. Since everything is a `GanttNode`, access `.children`, `.description`, `.isMilestone` directly on `selectedTask`. Replace all `taskAsTask?.` references with `selectedTask?.`.

Replace the epic lookup:
```typescript
// OLD: searched project.epics → epic.tasks → task.subtasks
// NEW:
let selectedEpic = $derived.by(() => {
  if (!selectedTaskId) return null;
  // Find the top-level ancestor node (level 0 from project root)
  function findAncestor(nodes: GanttNode[], targetId: string): GanttNode | null {
    for (const node of nodes) {
      if (node.id === targetId) return node;
      const found = findAncestor(node.children, targetId);
      if (found) return node; // return the root-level node, not the found one
    }
    return null;
  }
  return findAncestor(projectStore.project.children, selectedTaskId);
});
```

Replace `resolvedSubtasks`:
```typescript
// OLD: taskAsTask?.subtasks ?? []
// NEW:
let resolvedSubtasks = $derived(selectedTask?.children ?? []);
```

**Step 3: Run type check, fix remaining errors**

Run: `npx svelte-check --tsconfig ./tsconfig.json`

**Step 4: Commit**

```bash
git add src/lib/components/detail-pane.svelte
git commit -m "refactor: update detail pane for GanttNode type"
```

---

### Task 4: Update Task List for GanttNode
**Files:**
- Modify: `src/lib/components/gantt-task-row.svelte`
- Modify: `src/lib/components/gantt-task-list.svelte`

**Step 1: Update task-row collapsed child count**

The `collapsedChildCount` derivation currently searches `project.epics` / `epic.tasks` / `task.subtasks`. Replace with a generic tree search:

```typescript
let collapsedChildCount = $derived.by(() => {
  if (row.expanded || !row.hasChildren) return 0;
  const node = findNodeById(projectStore.project.children, row.id);
  return node?.children.length ?? 0;
});
```

Import `findNodeById` from the store or from a shared util. Since it's a private function in the store, either export it or add a method to the store: `projectStore.getNodeById(id)`.

**Step 2: Update row styling — remove `row.type` references**

Replace `row.type === 'epic'` with `row.level === 0`:
```svelte
<!-- OLD: row.type === 'epic' -->
<!-- NEW: row.level === 0 -->
```

Replace `row.type === 'subtask'` with `row.level >= 2`.

Apply this to all places in the template: the bold text for epics, the color dot visibility, etc.

**Step 3: Add double-click handler**

```typescript
function handleDoubleClick() {
  if (row.hasChildren || row.level === 0) {
    projectStore.drillInto(row.id);
  } else {
    // Promote leaf to container and drill in
    projectStore.drillInto(row.id);
  }
}
```

Add `ondblclick={handleDoubleClick}` to the row div (alongside `onclick`). To prevent the single-click selection from firing on double-click, use a small timer pattern:

```typescript
let clickTimer: ReturnType<typeof setTimeout> | null = null;

function handleRowClick() {
  if (clickTimer) return; // ignore if double-click pending
  clickTimer = setTimeout(() => {
    projectStore.selectTask(row.id);
    clickTimer = null;
  }, 200);
}

function handleDoubleClick() {
  if (clickTimer) {
    clearTimeout(clickTimer);
    clickTimer = null;
  }
  projectStore.drillInto(row.id);
}
```

**Step 4: Update gantt-task-list.svelte**

The tree guide computation references `rows[j].level` which still works with the new model. No structural changes needed, only the import if `GanttRow.type` is removed.

**Step 5: Run type check**

Run: `npx svelte-check --tsconfig ./tsconfig.json`

**Step 6: Commit**

```bash
git add src/lib/components/gantt-task-row.svelte src/lib/components/gantt-task-list.svelte
git commit -m "feat: add double-click drill-down on task rows"
```

---

### Task 5: Add Double-Click to SVG Bars
**Files:**
- Modify: `src/lib/components/gantt-bar.svelte`
- Modify: `src/lib/components/gantt-milestone.svelte`

**Step 1: Add double-click handler to gantt-bar.svelte**

Same click/double-click timer pattern as the task row:

```typescript
let clickTimer: ReturnType<typeof setTimeout> | null = null;

function handleClick() {
  if (clickTimer) return;
  clickTimer = setTimeout(() => {
    projectStore.selectTask(row.id);
    clickTimer = null;
  }, 200);
}

function handleDoubleClick() {
  if (clickTimer) {
    clearTimeout(clickTimer);
    clickTimer = null;
  }
  projectStore.drillInto(row.id);
}
```

Add `ondblclick={handleDoubleClick}` to the `<g>` element:

```svelte
<g
  role="button"
  aria-label={row.name}
  onclick={handleClick}
  ondblclick={handleDoubleClick}
  onmouseenter={handleMouseEnter}
  onmouseleave={handleMouseLeave}
  style="cursor: pointer;"
  opacity={isHovered ? 1 : 0.95}
>
```

**Step 2: Update row.type references**

Replace `row.type === 'epic'` with `row.level === 0` in `isCollapsedEpic`:

```typescript
let isCollapsedEpic = $derived(row.level === 0 && !row.expanded);
```

**Step 3: Add double-click to gantt-milestone.svelte**

Same pattern — add `ondblclick` handler to the `<g>` element.

**Step 4: Run type check**

Run: `npx svelte-check --tsconfig ./tsconfig.json`

**Step 5: Commit**

```bash
git add src/lib/components/gantt-bar.svelte src/lib/components/gantt-milestone.svelte
git commit -m "feat: add double-click drill-down on SVG bars and milestones"
```

---

### Task 6: Dynamic Breadcrumb Navigation
**Files:**
- Modify: `src/lib/components/gantt-pane.svelte`

**Step 1: Replace static breadcrumb with dynamic segments**

Replace the current hardcoded breadcrumb:

```svelte
<!-- OLD: -->
<Breadcrumb.Root>
  <Breadcrumb.List>
    <Breadcrumb.Item>
      <Breadcrumb.Link href="#">{projectStore.project.name}</Breadcrumb.Link>
    </Breadcrumb.Item>
    <Breadcrumb.Separator />
    <Breadcrumb.Item>
      <Breadcrumb.Page>All Tasks</Breadcrumb.Page>
    </Breadcrumb.Item>
  </Breadcrumb.List>
</Breadcrumb.Root>

<!-- NEW: -->
<Breadcrumb.Root>
  <Breadcrumb.List>
    {#each projectStore.breadcrumbs as segment, i (segment.id ?? 'root')}
      {#if i > 0}
        <Breadcrumb.Separator />
      {/if}
      <Breadcrumb.Item>
        {#if i < projectStore.breadcrumbs.length - 1}
          <!-- Clickable: navigates back to this level -->
          <Breadcrumb.Link
            href="#"
            onclick={(e) => { e.preventDefault(); projectStore.navigateTo(segment.depth); }}
          >
            {segment.name}
          </Breadcrumb.Link>
        {:else}
          <!-- Current level: not clickable -->
          <Breadcrumb.Page>{segment.name}</Breadcrumb.Page>
        {/if}
      </Breadcrumb.Item>
    {/each}
  </Breadcrumb.List>
</Breadcrumb.Root>
```

**Step 2: Run type check**

Run: `npx svelte-check --tsconfig ./tsconfig.json`

**Step 3: Commit**

```bash
git add src/lib/components/gantt-pane.svelte
git commit -m "feat: dynamic breadcrumb navigation for nested sub-Gantt"
```

---

### Task 7: Update Sidebar for GanttNode
**Files:**
- Modify: `src/lib/components/app-sidebar.svelte`

No structural changes needed — the sidebar shows project-level data (`projectStore.projects`, `projectStore.project`), not the internal node hierarchy. Verify it still compiles.

**Step 1: Run type check**

Run: `npx svelte-check --tsconfig ./tsconfig.json`

**Step 2: Commit (only if changes needed)**

---

### Task 8: Update Task Create Dialog
**Files:**
- Modify: `src/lib/components/task-create-dialog.svelte`

**Step 1: Update type references**

Replace `Task` import with `GanttNode`. The dialog creates a new task — update it to create a `GanttNode`:

```typescript
// OLD: creates a Task object
// NEW: creates a GanttNode
const newNode: GanttNode = {
  id: `node-${Date.now()}`,
  name: taskName,
  color: selectedColor,
  startDate: startIso,
  endDate: endIso,
  progress: 0,
  isMilestone,
  expanded: false,
  children: [],
  dependencies: [],
};
```

**Step 2: Update `addTask` to work with focusPath context**

The dialog should add a child to the currently focused node (or project root if at root). Update the store's `addTask`:

```typescript
// In store:
addChild(parentId: string | null, node: GanttNode): void {
  if (parentId === null) {
    // Add to project root
    this.project.children.push(node);
  } else {
    const parent = findNodeById(this.project.children, parentId);
    if (parent) parent.children.push(node);
  }
}
```

The dialog calls `projectStore.addChild(focusedNodeId, newNode)` where `focusedNodeId` is `projectStore.focusedNode?.id ?? null`.

**Step 3: Update epic select dropdown**

The "Epic" select in the dialog listed `project.epics`. Now it should list `projectStore.displayChildren` (the direct children of the current focus):

```typescript
let parentOptions = $derived(projectStore.displayChildren);
```

**Step 4: Run type check**

Run: `npx svelte-check --tsconfig ./tsconfig.json`

**Step 5: Commit**

```bash
git add src/lib/components/task-create-dialog.svelte
git commit -m "refactor: update task create dialog for GanttNode type"
```

---

### Task 9: Export findNodeById & Wire Up Remaining Refs
**Files:**
- Modify: `src/lib/stores/project.svelte.ts`

**Step 1: Export the helper or add a store method**

Components need to look up nodes by ID (e.g., detail-pane finding the ancestor, task-row counting children). Add a public method:

```typescript
getNodeById(id: string): GanttNode | null {
  return findNodeById(this.project.children, id);
}
```

**Step 2: Search all components for remaining references to old types**

Run: `grep -rn 'Epic\|\.epics\|\.tasks\b\|\.subtasks\|type.*epic\|type.*task\|type.*subtask' src/lib/`

Fix any remaining references to the old type names or field names.

**Step 3: Full type check + visual test**

Run: `npx svelte-check --tsconfig ./tsconfig.json`
Then open the app and verify:
- Default view shows the same project data as before
- Expand/collapse works
- Clicking a task selects it, detail pane shows info
- Double-clicking an epic drills into it
- Breadcrumb updates and clicking it navigates back
- Double-clicking a task inside an epic shows that task's children (may be empty)
- Creating a task adds it to the current scope

**Step 4: Commit**

```bash
git add -A
git commit -m "feat: complete nested sub-Gantt with drill-down navigation"
```

---

### Task 10: Empty State for Drilled-Into Nodes
**Files:**
- Modify: `src/lib/components/gantt-chart.svelte`

When drilling into a node with no children, the Gantt should show a helpful empty state instead of a blank grid.

**Step 1: Update `hasTasks` check**

The `hasTasks` derived already checks `projectStore.rows.length > 0`. When a drilled-into node has no children, rows will be empty. The existing empty state in gantt-chart.svelte will show. Update the message:

```svelte
{:else}
  <div
    role="grid"
    aria-label="Gantt chart"
    class="flex h-full items-center justify-center overflow-hidden outline-none"
    tabindex="0"
    onkeydown={handleKeyDown}
  >
    <div class="flex flex-col items-center gap-3 text-muted-foreground">
      <LayoutGridIcon class="size-12 opacity-20" />
      {#if projectStore.focusPath.length > 0}
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

**Step 2: Commit**

```bash
git add src/lib/components/gantt-chart.svelte
git commit -m "feat: contextual empty state for drilled-into nodes"
```

---

## Testing Checklist

After all tasks are complete, verify these scenarios:

1. **Default view** — project root shows epics as level-0 rows, identical to before
2. **Expand/collapse** — chevron toggles inline children, tree guides update
3. **Single click** — selects task, detail pane populates
4. **Double-click epic** — drills in, breadcrumb shows Project > Epic, Gantt shows epic's tasks at level 0
5. **Double-click task inside epic** — drills deeper, breadcrumb extends, shows task's subtasks as full Gantt
6. **Breadcrumb click** — clicking any segment navigates back to that depth
7. **Double-click leaf node** — drills in, shows empty state with "No sub-tasks yet"
8. **Context menu delete** — deleting a node in focusPath pops back to valid depth
9. **Project switching** — resets focusPath to `[]`
10. **Task creation** — adds child to currently focused node
11. **Dependency arrows** — still render correctly within the current scope
12. **Scroll alignment** — task list and bars stay aligned at all depths
