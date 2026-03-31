# Store Extraction — BLoC/Cubit Pattern

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Extract all business logic from .svelte components into domain-specific stores following the cubit/BLoC pattern used in LLM-Teacher, making the codebase maintainable, expandable, and LLM-helpable.

**Architecture:** Break the monolithic `project.svelte.ts` into 4 domain stores: project, gantt, timeline, dialog. Each store owns its state, derived values, and methods. Components become pure presentation — they read store state and call store methods. Stores use Svelte 5 runes (class-based `$state`/`$derived`) matching the existing framework version, organized in the LLM-Teacher feature-directory pattern (`stores/{feature}/index.ts`, `{feature}Store.svelte.ts`, `models.ts`, `helpers.ts`).

**Tech Stack:** SvelteKit 2, Svelte 5 (runes), TypeScript, d3-scale, shadcn-svelte

---

## Store dependency graph

```
projectStore (standalone — project CRUD)
     ↓
ganttStore (task tree, selection, zoom, navigation, derived rows)
     ↓            ↓
timelineStore   dialogStore
(layout/scale)  (form state)
```

## What moves where

| Source Component | Logic Extracted | Target Store |
|---|---|---|
| `project.svelte.ts` (monolith) | Project CRUD, sample data | `project/` |
| `project.svelte.ts` (monolith) | Zoom, selection, hover, focusPath, task tree ops, all derived state | `gantt/` |
| `gantt-chart.svelte` | paddedRange, timeScale, totalWidth, totalHeight, keyboard nav | `timeline/` + `gantt/` |
| `gantt-timeline.svelte` | dependencyPairs computation | `gantt/` |
| `gantt-task-list.svelte` | rowContexts (tree guides) computation | `gantt/` |
| `detail-pane.svelte` | selectedEpic, duration, statusLabel, resolvedDependencies, resolvedSubtasks | `gantt/` |
| `gantt-pane.svelte` | Dialog state management ($effect bridge) | `dialog/` |
| `task-create-dialog.svelte` | Form state, submit logic, date helpers | `dialog/` |

### What stays in components
- Per-instance SVG drag/resize state (gantt-bar, gantt-milestone) — truly local to each instance
- DOM manipulation ($effect for scroll-into-view)
- Pure presentation (CSS, visibility, SVG rendering)

---

## Task 1: Shared utilities

**Files:**
- Modify: `src/lib/utils/timeline.ts`

Add `toLocalIso` (currently duplicated in gantt-bar.svelte and gantt-milestone.svelte) and `formatDisplayDate` (from detail-pane.svelte) to timeline utils.

**Step 1: Add shared utility functions to timeline.ts**

Append to `src/lib/utils/timeline.ts`:

```typescript
/**
 * Format a Date as YYYY-MM-DD using local time (not UTC).
 * Used by drag handlers to convert snapped dates to ISO strings.
 */
export function toLocalIso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Format an ISO date string for human display (e.g. "Mar 30, 2026").
 */
export function formatDisplayDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}
```

**Step 2: Verify**

Run: `npm run check`

**Step 3: Commit**

```bash
git add src/lib/utils/timeline.ts
git commit -m "refactor: add toLocalIso and formatDisplayDate to shared timeline utils"
```

---

## Task 2: Project store

**Files:**
- Create: `src/lib/stores/project/models.ts`
- Create: `src/lib/stores/project/projectStore.svelte.ts`
- Create: `src/lib/stores/project/index.ts`

Extract project management (CRUD, switching, sample data) from the monolithic store.

**Step 1: Create models.ts**

```typescript
// Re-export the core Project type for convenience
export type { Project } from '$lib/types';
```

**Step 2: Create projectStore.svelte.ts**

Move from `project.svelte.ts`:
- `SAMPLE_PROJECT`, `SAMPLE_PROJECT_2`, `SAMPLE_PROJECT_3`, `ALL_SAMPLE_PROJECTS`
- `deepClone` helper
- `projects` state, `activeProjectId` state
- `project` derived
- `switchProject()`, `createProject()`, `deleteProject()` methods

```typescript
import type { Project } from '$lib/types';

// ---------------------------------------------------------------------------
// Sample data (keep exactly as in current project.svelte.ts)
// ---------------------------------------------------------------------------
const SAMPLE_PROJECT: Project = { /* ... exact copy ... */ };
const SAMPLE_PROJECT_2: Project = { /* ... exact copy ... */ };
const SAMPLE_PROJECT_3: Project = { /* ... exact copy ... */ };
const ALL_SAMPLE_PROJECTS: Project[] = [
  deepClone(SAMPLE_PROJECT),
  deepClone(SAMPLE_PROJECT_2),
  deepClone(SAMPLE_PROJECT_3),
];

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------
class ProjectStore {
  projects = $state<Project[]>(deepClone(ALL_SAMPLE_PROJECTS));
  activeProjectId = $state<string>('proj-1');

  project = $derived<Project>(
    this.projects.find((p) => p.id === this.activeProjectId) ?? this.projects[0],
  );

  switchProject(projectId: string): void {
    if (this.projects.some((p) => p.id === projectId)) {
      this.activeProjectId = projectId;
    }
  }

  createProject(name: string): string {
    const id = `proj-${Date.now()}`;
    this.projects.push({ id, name, description: '', children: [] });
    this.activeProjectId = id;
    return id;
  }

  deleteProject(projectId: string): void {
    if (this.projects.length <= 1) return;
    const idx = this.projects.findIndex((p) => p.id === projectId);
    if (idx === -1) return;
    this.projects.splice(idx, 1);
    if (this.activeProjectId === projectId) {
      this.activeProjectId = this.projects[0].id;
    }
  }
}

export const projectStore = new ProjectStore();
```

Note: `switchProject` no longer clears selection/hover/focusPath — that responsibility moves to `ganttStore` which will react to project changes or expose its own `switchProject` wrapper.

**Step 3: Create index.ts**

```typescript
export { projectStore } from './projectStore.svelte.js';
export type { Project } from './models.js';
```

**Step 4: Verify**

Run: `npm run check`

**Step 5: Commit**

```bash
git add src/lib/stores/project/
git commit -m "refactor: extract project store from monolith"
```

---

## Task 3: Gantt store

**Files:**
- Create: `src/lib/stores/gantt/models.ts`
- Create: `src/lib/stores/gantt/helpers.ts`
- Create: `src/lib/stores/gantt/ganttStore.svelte.ts`
- Create: `src/lib/stores/gantt/index.ts`

This is the largest store — it owns all gantt chart state, task tree operations, and derived computations currently spread across components.

**Step 1: Create models.ts**

```typescript
import type { GanttRow, DependencyType } from '$lib/types';

export type { GanttNode, GanttRow, ZoomLevel, Dependency, ZoomConfig } from '$lib/types';

export interface BreadcrumbEntry {
  id: string | null;
  name: string;
  depth: number;
}

export interface RowContext {
  guides: boolean[];
  isLast: boolean;
}

export interface DependencyPair {
  key: string;
  source: GanttRow;
  sourceIndex: number;
  target: GanttRow;
  targetIndex: number;
  type: DependencyType;
}

export interface ResolvedDependency {
  targetId: string;
  name: string;
  type: DependencyType;
  lag: string;
}
```

**Step 2: Create helpers.ts**

Move from `project.svelte.ts`: `flattenNodes`, `computeDateRange`, `findNodeById`, `deleteNodeById`, `cleanDependencies`. These are pure functions with no state.

```typescript
import type { GanttNode, GanttRow, Dependency } from '$lib/types';

export function flattenNodes(nodes: GanttNode[], baseLevel = 0): GanttRow[] {
  const rows: GanttRow[] = [];
  for (const node of nodes) {
    rows.push({
      id: node.id,
      name: node.name,
      level: baseLevel,
      startDate: node.startDate,
      endDate: node.endDate,
      progress: node.progress,
      color: node.color,
      isMilestone: node.isMilestone,
      hasChildren: node.children.length > 0,
      expanded: node.expanded,
      dependencies: node.dependencies,
    });
    if (node.expanded && node.children.length > 0) {
      rows.push(...flattenNodes(node.children, baseLevel + 1));
    }
  }
  return rows;
}

export function computeDateRange(rows: GanttRow[]): [string, string] {
  if (rows.length === 0) {
    const today = new Date().toISOString().slice(0, 10);
    return [today, today];
  }
  let earliest = rows[0].startDate;
  let latest = rows[0].endDate;
  for (const row of rows) {
    if (row.startDate < earliest) earliest = row.startDate;
    if (row.endDate > latest) latest = row.endDate;
  }
  return [earliest, latest];
}

export function findNodeById(nodes: GanttNode[], id: string): GanttNode | null {
  for (const node of nodes) {
    if (node.id === id) return node;
    const found = findNodeById(node.children, id);
    if (found) return found;
  }
  return null;
}

export function deleteNodeById(nodes: GanttNode[], id: string): boolean {
  for (let i = 0; i < nodes.length; i++) {
    if (nodes[i].id === id) {
      nodes.splice(i, 1);
      return true;
    }
    if (deleteNodeById(nodes[i].children, id)) return true;
  }
  return false;
}

export function cleanDependencies(nodes: GanttNode[], deletedId: string): void {
  for (const node of nodes) {
    node.dependencies = node.dependencies.filter((d: Dependency) => d.targetId !== deletedId);
    cleanDependencies(node.children, deletedId);
  }
}

/**
 * Find the top-level ancestor node that contains a target node.
 * Returns the target itself if it's a top-level node.
 */
export function findAncestor(nodes: GanttNode[], targetId: string): GanttNode | null {
  for (const node of nodes) {
    if (node.id === targetId) return node;
    const found = findNodeById(node.children, targetId);
    if (found) return node;
  }
  return null;
}

/**
 * Compute tree guide context for each row.
 * guides: boolean[] — one per level (0..level-1), true if vertical guide line continues.
 * isLast: whether this row is the last child of its parent.
 */
export function computeRowContexts(rows: GanttRow[]): { guides: boolean[]; isLast: boolean }[] {
  const result: { guides: boolean[]; isLast: boolean }[] = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const guides: boolean[] = [];
    for (let lvl = 0; lvl < row.level; lvl++) {
      let hasMoreAtLevel = false;
      for (let j = i + 1; j < rows.length; j++) {
        if (rows[j].level < lvl) break;
        if (rows[j].level === lvl) { hasMoreAtLevel = true; break; }
      }
      if (lvl === 0) {
        hasMoreAtLevel = false;
        for (let j = i + 1; j < rows.length; j++) {
          if (rows[j].level === 0) { hasMoreAtLevel = true; break; }
        }
      }
      guides.push(hasMoreAtLevel);
    }
    let isLast = true;
    for (let j = i + 1; j < rows.length; j++) {
      if (rows[j].level < row.level) break;
      if (rows[j].level === row.level) { isLast = false; break; }
    }
    result.push({ guides, isLast });
  }
  return result;
}

/**
 * Build dependency pairs from flattened rows.
 * Each row's dependencies list prerequisites (targetId = prerequisite).
 * Returns pairs going FROM prerequisite TO dependent.
 */
export function computeDependencyPairs(
  rows: GanttRow[],
): { key: string; source: GanttRow; sourceIndex: number; target: GanttRow; targetIndex: number; type: import('$lib/types').DependencyType }[] {
  const indexById = new Map<string, number>(rows.map((r, i) => [r.id, i]));
  const pairs: { key: string; source: GanttRow; sourceIndex: number; target: GanttRow; targetIndex: number; type: import('$lib/types').DependencyType }[] = [];
  for (let depIdx = 0; depIdx < rows.length; depIdx++) {
    const dependentRow = rows[depIdx];
    for (const dep of dependentRow.dependencies) {
      const prereqIdx = indexById.get(dep.targetId);
      if (prereqIdx === undefined) continue;
      const prereqRow = rows[prereqIdx];
      pairs.push({
        key: `${prereqRow.id}-${dependentRow.id}-${dep.type}`,
        source: prereqRow,
        sourceIndex: prereqIdx,
        target: dependentRow,
        targetIndex: depIdx,
        type: dep.type,
      });
    }
  }
  return pairs;
}
```

**Step 3: Create ganttStore.svelte.ts**

```typescript
import type { GanttNode, GanttRow, ZoomLevel, ZoomConfig } from '$lib/types';
import { ZOOM_CONFIGS } from '$lib/types';
import { projectStore } from '../project/index.js';
import {
  flattenNodes,
  computeDateRange,
  findNodeById,
  deleteNodeById,
  cleanDependencies,
  findAncestor,
  computeRowContexts,
  computeDependencyPairs,
} from './helpers.js';
import type { BreadcrumbEntry, RowContext, DependencyPair, ResolvedDependency } from './models.js';

class GanttStore {
  // --- Core state ---
  focusPath = $state<string[]>([]);
  zoomLevel = $state<ZoomLevel>('week');
  selectedTaskId = $state<string | null>(null);
  hoveredTaskId = $state<string | null>(null);

  // --- Dialog request state (consumed by dialog store) ---
  createDialogRequest = $state<{ epicId?: string; startDate?: string; editNode?: GanttNode } | null>(null);

  // --- Derived: navigation ---
  focusedNode = $derived<GanttNode | null>(
    this.focusPath.length > 0
      ? findNodeById(projectStore.project.children, this.focusPath[this.focusPath.length - 1])
      : null,
  );

  displayChildren = $derived<GanttNode[]>(
    this.focusedNode ? this.focusedNode.children : projectStore.project.children,
  );

  breadcrumbs = $derived.by<BreadcrumbEntry[]>(() => {
    const crumbs: BreadcrumbEntry[] = [
      { id: null, name: projectStore.project.name, depth: 0 },
    ];
    for (let i = 0; i < this.focusPath.length; i++) {
      const node = findNodeById(projectStore.project.children, this.focusPath[i]);
      if (node) {
        crumbs.push({ id: node.id, name: node.name, depth: i + 1 });
      }
    }
    return crumbs;
  });

  // --- Derived: rows & date range ---
  rows = $derived<GanttRow[]>(flattenNodes(this.displayChildren));
  dateRange = $derived<[string, string]>(computeDateRange(this.rows));
  zoomConfig = $derived<ZoomConfig>(ZOOM_CONFIGS[this.zoomLevel]);

  // --- Derived: selection ---
  selectedTask = $derived<GanttNode | null>(
    this.selectedTaskId ? findNodeById(projectStore.project.children, this.selectedTaskId) : null,
  );

  selectedEpic = $derived<GanttNode | null>(
    this.selectedTaskId
      ? findAncestor(projectStore.project.children, this.selectedTaskId)
      : null,
  );

  // --- Derived: detail pane helpers ---
  duration = $derived.by<string>(() => {
    if (!this.selectedTask) return '';
    const start = new Date(this.selectedTask.startDate);
    const end = new Date(this.selectedTask.endDate);
    const days = Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;
    return `${days}d`;
  });

  statusLabel = $derived.by<string>(() => {
    const p = this.selectedTask?.progress ?? 0;
    if (p === 100) return 'Done';
    if (p === 0) return 'Not Started';
    return 'In Progress';
  });

  resolvedDependencies = $derived<ResolvedDependency[]>(
    (this.selectedTask?.dependencies ?? []).map((dep) => ({
      targetId: dep.targetId,
      name: findNodeById(projectStore.project.children, dep.targetId)?.name ?? dep.targetId,
      type: dep.type,
      lag: dep.lag === 0 ? '0d' : dep.lag > 0 ? `+${dep.lag}d` : `${dep.lag}d`,
    })),
  );

  resolvedSubtasks = $derived<GanttNode[]>(this.selectedTask?.children ?? []);

  // --- Derived: tree guides (from gantt-task-list.svelte) ---
  rowContexts = $derived<RowContext[]>(computeRowContexts(this.rows));

  // --- Derived: dependency pairs (from gantt-timeline.svelte) ---
  dependencyPairs = $derived<DependencyPair[]>(computeDependencyPairs(this.rows));

  // --- Derived: has tasks ---
  hasTasks = $derived(this.rows.length > 0);

  // --- Methods: task tree ---
  toggleExpand(id: string): void {
    const node = findNodeById(projectStore.project.children, id);
    if (node) node.expanded = !node.expanded;
  }

  selectTask(id: string | null): void {
    this.selectedTaskId = id;
  }

  setZoom(level: ZoomLevel): void {
    this.zoomLevel = level;
  }

  updateTask(id: string, updates: Partial<GanttNode>): void {
    const node = findNodeById(projectStore.project.children, id);
    if (node) Object.assign(node, updates);
  }

  deleteTask(id: string): void {
    deleteNodeById(projectStore.project.children, id);
    if (this.selectedTaskId === id) this.selectedTaskId = null;
    const pathIndex = this.focusPath.indexOf(id);
    if (pathIndex !== -1) {
      this.focusPath = this.focusPath.slice(0, pathIndex);
      this.selectedTaskId = null;
    }
    cleanDependencies(projectStore.project.children, id);
  }

  setHoveredTask(id: string | null): void {
    this.hoveredTaskId = id;
  }

  addChild(parentId: string | null, node: GanttNode): void {
    if (parentId === null) {
      projectStore.project.children.push(node);
    } else {
      const parent = findNodeById(projectStore.project.children, parentId);
      if (parent) parent.children.push(node);
    }
  }

  getNodeById(id: string): GanttNode | null {
    return findNodeById(projectStore.project.children, id);
  }

  // --- Methods: dialog requests ---
  requestCreateTask(epicId?: string, startDate?: string): void {
    this.createDialogRequest = { epicId, startDate };
  }

  requestEditTask(id: string): void {
    const node = findNodeById(projectStore.project.children, id);
    if (node) {
      this.createDialogRequest = { editNode: node };
    }
  }

  clearDialogRequest(): void {
    this.createDialogRequest = null;
  }

  // --- Methods: navigation ---
  drillInto(id: string): void {
    this.focusPath = [...this.focusPath, id];
    this.selectedTaskId = null;
  }

  navigateTo(depth: number): void {
    this.focusPath = this.focusPath.slice(0, depth);
    this.selectedTaskId = null;
  }

  // --- Methods: project switching (clears gantt state) ---
  switchProject(projectId: string): void {
    projectStore.switchProject(projectId);
    this.selectedTaskId = null;
    this.hoveredTaskId = null;
    this.focusPath = [];
  }

  createProject(name: string): void {
    projectStore.createProject(name);
    this.selectedTaskId = null;
    this.hoveredTaskId = null;
    this.focusPath = [];
  }

  deleteProject(projectId: string): void {
    const wasActive = projectStore.activeProjectId === projectId;
    projectStore.deleteProject(projectId);
    if (wasActive) {
      this.selectedTaskId = null;
      this.hoveredTaskId = null;
      this.focusPath = [];
    }
  }

  // --- Methods: keyboard navigation (from gantt-chart.svelte) ---
  handleKeyDown(e: KeyboardEvent): void {
    const rows = this.rows;
    if (rows.length === 0) return;

    const currentId = this.selectedTaskId;
    const currentIndex = currentId ? rows.findIndex((r) => r.id === currentId) : -1;

    switch (e.key) {
      case 'ArrowDown': {
        e.preventDefault();
        const nextIndex = currentIndex < rows.length - 1 ? currentIndex + 1 : 0;
        this.selectTask(rows[nextIndex].id);
        break;
      }
      case 'ArrowUp': {
        e.preventDefault();
        const prevIndex = currentIndex > 0 ? currentIndex - 1 : rows.length - 1;
        this.selectTask(rows[prevIndex].id);
        break;
      }
      case 'ArrowRight': {
        if (currentIndex === -1) break;
        const row = rows[currentIndex];
        if (row.hasChildren && !row.expanded) {
          e.preventDefault();
          this.toggleExpand(row.id);
        }
        break;
      }
      case 'ArrowLeft': {
        if (currentIndex === -1) break;
        const row = rows[currentIndex];
        if (row.hasChildren && row.expanded) {
          e.preventDefault();
          this.toggleExpand(row.id);
        }
        break;
      }
      case 'Escape': {
        e.preventDefault();
        this.selectTask(null);
        break;
      }
      case 'Delete':
      case 'Backspace': {
        if (currentId) {
          e.preventDefault();
          this.deleteTask(currentId);
        }
        break;
      }
    }
  }
}

export const ganttStore = new GanttStore();
```

**Step 4: Create index.ts**

```typescript
export { ganttStore } from './ganttStore.svelte.js';
export type {
  BreadcrumbEntry,
  RowContext,
  DependencyPair,
  ResolvedDependency,
} from './models.js';
export {
  findNodeById,
  findAncestor,
} from './helpers.js';
```

**Step 5: Verify**

Run: `npm run check`

**Step 6: Commit**

```bash
git add src/lib/stores/gantt/
git commit -m "refactor: extract gantt store with all derived state and keyboard nav"
```

---

## Task 4: Timeline store

**Files:**
- Create: `src/lib/stores/timeline/timelineStore.svelte.ts`
- Create: `src/lib/stores/timeline/index.ts`

Extract timeline layout computations from gantt-chart.svelte.

**Step 1: Create timelineStore.svelte.ts**

```typescript
import { ganttStore } from '../gantt/index.js';
import { ROW_HEIGHT } from '$lib/types';
import { createTimeScale, padDateRange } from '$lib/utils/timeline.js';
import type { ScaleTime } from 'd3-scale';

class TimelineStore {
  paddedRange = $derived.by<[Date, Date]>(() => {
    const [rawStart, rawEnd] = ganttStore.dateRange;
    return padDateRange(new Date(rawStart), new Date(rawEnd), ganttStore.zoomConfig);
  });

  timeScale = $derived<ScaleTime<number, number>>(
    createTimeScale(this.paddedRange, ganttStore.zoomConfig),
  );

  totalWidth = $derived<number>(this.timeScale.range()[1]);
  totalHeight = $derived<number>(ganttStore.rows.length * ROW_HEIGHT);
}

export const timelineStore = new TimelineStore();
```

**Step 2: Create index.ts**

```typescript
export { timelineStore } from './timelineStore.svelte.js';
```

**Step 3: Verify**

Run: `npm run check`

**Step 4: Commit**

```bash
git add src/lib/stores/timeline/
git commit -m "refactor: extract timeline store for layout computations"
```

---

## Task 5: Dialog store

**Files:**
- Create: `src/lib/stores/dialog/dialogStore.svelte.ts`
- Create: `src/lib/stores/dialog/index.ts`

Extract dialog form state and submit logic from task-create-dialog.svelte and gantt-pane.svelte.

**Step 1: Create dialogStore.svelte.ts**

```typescript
import { ganttStore } from '../gantt/index.js';
import type { GanttNode } from '$lib/types';
import type { DateValue } from '@internationalized/date';
import { CalendarDate, parseDate, today, getLocalTimeZone } from '@internationalized/date';

const TASK_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

class DialogStore {
  // --- Dialog state ---
  open = $state(false);
  mode = $state<'create' | 'edit'>('create');
  editTask = $state<GanttNode | undefined>(undefined);
  defaultEpicId = $state<string | undefined>(undefined);
  defaultStartDate = $state<string | undefined>(undefined);

  // --- Form fields ---
  taskName = $state('');
  selectedEpicId = $state('');
  startDateValue = $state<DateValue | undefined>(undefined);
  endDateValue = $state<DateValue | undefined>(undefined);
  isMilestone = $state(false);
  selectedColor = $state(TASK_COLORS[0]);

  // --- Popover state ---
  startPopoverOpen = $state(false);
  endPopoverOpen = $state(false);

  // --- Constants ---
  readonly taskColors = TASK_COLORS;

  // --- Derived ---
  epicOptions = $derived(ganttStore.displayChildren);

  // --- Helpers ---
  isoToDateValue(iso: string | undefined): DateValue | undefined {
    if (!iso) return undefined;
    try { return parseDate(iso); } catch { return undefined; }
  }

  dateValueToIso(dv: DateValue | undefined): string {
    if (!dv) return today(getLocalTimeZone()).toString();
    return dv.toString();
  }

  formatDateDisplay(dv: DateValue | undefined): string {
    if (!dv) return 'Pick a date';
    const d = new Date(dv.year, dv.month - 1, dv.day);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  // --- Methods ---
  requestCreate(epicId?: string, startDate?: string): void {
    this.editTask = undefined;
    this.defaultEpicId = epicId;
    this.defaultStartDate = startDate;
    this.mode = 'create';
    this.resetForm();
    this.open = true;
  }

  requestEdit(taskId: string): void {
    const node = ganttStore.getNodeById(taskId);
    if (!node) return;
    this.editTask = node;
    this.mode = 'edit';
    this.populateFromTask(node);
    this.open = true;
  }

  close(): void {
    this.open = false;
  }

  resetForm(): void {
    this.taskName = '';
    this.selectedEpicId = this.defaultEpicId ?? this.epicOptions[0]?.id ?? '';
    const defaultStart = this.defaultStartDate
      ? this.isoToDateValue(this.defaultStartDate)
      : today(getLocalTimeZone());
    this.startDateValue = defaultStart;
    const tomorrow =
      defaultStart instanceof CalendarDate
        ? defaultStart.add({ days: 1 })
        : today(getLocalTimeZone()).add({ days: 1 });
    this.endDateValue = tomorrow;
    this.isMilestone = false;
    this.selectedColor = TASK_COLORS[0];
  }

  populateFromTask(task: GanttNode): void {
    this.taskName = task.name;
    const ownerEpic = this.epicOptions.find((e) =>
      e.children.some((t) => t.id === task.id),
    );
    this.selectedEpicId = ownerEpic?.id ?? this.epicOptions[0]?.id ?? '';
    this.startDateValue = this.isoToDateValue(task.startDate);
    this.endDateValue = this.isoToDateValue(task.endDate);
    this.isMilestone = task.isMilestone;
    this.selectedColor = task.color ?? TASK_COLORS[0];
  }

  submit(): void {
    const startIso = this.dateValueToIso(this.startDateValue);
    const endIso = this.dateValueToIso(this.endDateValue);

    if (this.mode === 'create') {
      const newNode: GanttNode = {
        id: `node-${Date.now()}`,
        name: this.taskName.trim() || 'Untitled Task',
        color: this.selectedColor,
        startDate: startIso,
        endDate: this.isMilestone ? startIso : endIso,
        progress: 0,
        isMilestone: this.isMilestone,
        expanded: false,
        children: [],
        dependencies: [],
      };
      ganttStore.addChild(this.selectedEpicId || null, newNode);
    } else if (this.mode === 'edit' && this.editTask) {
      ganttStore.updateTask(this.editTask.id, {
        name: this.taskName.trim() || this.editTask.name,
        startDate: startIso,
        endDate: this.isMilestone ? startIso : endIso,
        color: this.selectedColor,
        isMilestone: this.isMilestone,
      });
    }

    this.open = false;
  }
}

export const dialogStore = new DialogStore();
```

**Step 2: Create index.ts**

```typescript
export { dialogStore } from './dialogStore.svelte.js';
```

**Step 3: Verify**

Run: `npm run check`

**Step 4: Commit**

```bash
git add src/lib/stores/dialog/
git commit -m "refactor: extract dialog store for task create/edit form"
```

---

## Task 6: Update components — gantt-chart, gantt-timeline, gantt-task-list, gantt-pane

**Files:**
- Modify: `src/lib/components/gantt-chart.svelte`
- Modify: `src/lib/components/gantt-timeline.svelte`
- Modify: `src/lib/components/gantt-task-list.svelte`
- Modify: `src/lib/components/gantt-pane.svelte`

### gantt-chart.svelte

Remove: `paddedRange`, `timeScale`, `totalWidth`, `totalHeight` derivations (now in timelineStore). Remove `handleKeyDown` function (now in ganttStore). Remove `hasTasks` derivation (now in ganttStore).

Import from new stores. Keep only: `scrollEl` state, scroll-into-view `$effect`, and template.

```svelte
<script lang="ts">
  import GanttTaskList from "./gantt-task-list.svelte";
  import GanttTimeline from "./gantt-timeline.svelte";
  import GanttHeader from "./gantt-header.svelte";
  import LayoutGridIcon from "@tabler/icons-svelte/icons/layout-grid";

  import { TASK_LIST_WIDTH } from "$lib/types.js";
  import { ganttStore } from "$lib/stores/gantt/index.js";
  import { timelineStore } from "$lib/stores/timeline/index.js";

  const HEADER_HEIGHT = 64;

  let scrollEl = $state<HTMLDivElement | undefined>(undefined);

  $effect(() => {
    const id = ganttStore.selectedTaskId;
    if (!id || !scrollEl) return;
    const rowEl = scrollEl.querySelector(`[data-row-id="${id}"]`);
    if (rowEl) {
      rowEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  });
</script>

<!-- Template uses ganttStore.hasTasks, ganttStore.focusPath, ganttStore.handleKeyDown,
     timelineStore.totalWidth, timelineStore.totalHeight, timelineStore.timeScale,
     timelineStore.paddedRange, ganttStore.zoomConfig -->
```

### gantt-timeline.svelte

Remove: `DependencyPair` interface, `dependencyPairs` derivation (now in ganttStore).

```svelte
<script lang="ts">
  import { ganttStore } from '$lib/stores/gantt/index.js';
  import { timelineStore } from '$lib/stores/timeline/index.js';
  import { ROW_HEIGHT } from '$lib/types';
  // ... component imports

  // All props removed — read from stores directly
  // dependencyPairs comes from ganttStore.dependencyPairs
  // rows comes from ganttStore.rows
  // timeScale comes from timelineStore.timeScale
  // totalWidth/totalHeight from timelineStore
  // zoomConfig from ganttStore.zoomConfig
</script>
```

### gantt-task-list.svelte

Remove: `rowContexts` derivation (now in ganttStore).

```svelte
<script lang="ts">
  import { ganttStore } from '$lib/stores/gantt/index.js';
  import GanttTaskRow from './gantt-task-row.svelte';
</script>

<div>
  {#each ganttStore.rows as row, i (row.id)}
    <GanttTaskRow {row} guides={ganttStore.rowContexts[i].guides} isLastChild={ganttStore.rowContexts[i].isLast} />
  {/each}
</div>
```

### gantt-pane.svelte

Remove: `createDialogOpen`, `dialogMode`, `editTask`, `defaultEpicId` state. Remove the `$effect` bridge. Use dialogStore directly.

```svelte
<script lang="ts">
  // ... icon/ui imports
  import { ganttStore } from "$lib/stores/gantt/index.js";
  import { dialogStore } from "$lib/stores/dialog/index.js";
  import type { ZoomLevel } from "$lib/types.js";

  let zoomLevel = $derived(ganttStore.zoomLevel as string);

  function onZoomChange(value: string) {
    if (value) ganttStore.setZoom(value as ZoomLevel);
  }
</script>

<!-- "Add Task" button calls dialogStore.requestCreate(ganttStore.focusedNode?.id) -->
<!-- TaskCreateDialog uses dialogStore.open, dialogStore.mode, etc. -->
```

**Step 1: Update all four components as described above.**

**Step 2: Verify**

Run: `npm run check`

**Step 3: Commit**

```bash
git add src/lib/components/gantt-chart.svelte src/lib/components/gantt-timeline.svelte \
  src/lib/components/gantt-task-list.svelte src/lib/components/gantt-pane.svelte
git commit -m "refactor: update gantt-chart, timeline, task-list, pane to use new stores"
```

---

## Task 7: Update components — gantt-bar, gantt-milestone, gantt-task-row, detail-pane, app-sidebar, task-create-dialog

**Files:**
- Modify: `src/lib/components/gantt-bar.svelte`
- Modify: `src/lib/components/gantt-milestone.svelte`
- Modify: `src/lib/components/gantt-task-row.svelte`
- Modify: `src/lib/components/detail-pane.svelte`
- Modify: `src/lib/components/app-sidebar.svelte`
- Modify: `src/lib/components/task-create-dialog.svelte`

### gantt-bar.svelte

- Replace `import { projectStore }` with `import { ganttStore }`
- Replace all `projectStore.` references with `ganttStore.`
- Replace local `toLocalIso` with import from `$lib/utils/timeline`
- Keep all drag/resize state local (per-instance)

### gantt-milestone.svelte

- Same pattern: replace `projectStore` with `ganttStore`
- Replace local `toLocalIso` with import

### gantt-task-row.svelte

- Replace `projectStore` with `ganttStore`
- Context menu "Add Sub-task" calls `dialogStore.requestCreate(row.id)` instead of `ganttStore.requestCreateTask(row.id)`
- Context menu "Edit" calls `dialogStore.requestEdit(row.id)` instead of `ganttStore.requestEditTask(row.id)`

### detail-pane.svelte

Major simplification — remove all derived computations that moved to ganttStore:
- Remove: `selectedEpic`, `duration`, `statusLabel`, `resolvedDependencies`, `resolvedSubtasks`, `formatDate` function
- Import these from ganttStore: `ganttStore.selectedEpic`, `ganttStore.duration`, `ganttStore.statusLabel`, `ganttStore.resolvedDependencies`, `ganttStore.resolvedSubtasks`
- Import `formatDisplayDate` from utils
- Keep only: write-back handler functions (thin wrappers calling ganttStore methods), `taskColors` constant

### app-sidebar.svelte

- Replace `projectStore` with `ganttStore` (since ganttStore wraps project operations and clears selection)
- `ganttStore.switchProject()`, `ganttStore.createProject()`, `ganttStore.deleteProject()`
- For read-only data: `projectStore.projects`, `projectStore.project` can still be imported from project store

### task-create-dialog.svelte

Major simplification — all form state moved to dialogStore:
- Remove: all `$state` form fields, `isoToDateValue`, `dateValueToIso`, `formatDateDisplay`, `resetForm`, `handleSubmit`, `handleCancel`, the `$effect` for form population
- Props simplified: no more `open`, `mode`, `editTask`, etc. — all read from dialogStore
- Template binds to `dialogStore.taskName`, `dialogStore.selectedColor`, etc.
- Submit calls `dialogStore.submit()`
- Cancel calls `dialogStore.close()`

**Step 1: Update all six components as described above.**

**Step 2: Verify**

Run: `npm run check`

**Step 3: Commit**

```bash
git add src/lib/components/gantt-bar.svelte src/lib/components/gantt-milestone.svelte \
  src/lib/components/gantt-task-row.svelte src/lib/components/detail-pane.svelte \
  src/lib/components/app-sidebar.svelte src/lib/components/task-create-dialog.svelte
git commit -m "refactor: update remaining components to use domain stores"
```

---

## Task 8: Delete old store and verify

**Files:**
- Delete: `src/lib/stores/project.svelte.ts`

**Step 1: Delete the old monolithic store**

```bash
rm src/lib/stores/project.svelte.ts
```

**Step 2: Grep for any remaining imports of the old store**

```bash
grep -r "stores/project.svelte" src/
```

Fix any remaining imports.

**Step 3: Full verification**

```bash
npm run check
npm run build
```

**Step 4: Commit**

```bash
git add -A
git commit -m "refactor: remove monolithic project store — extraction complete"
```

---

## Final directory structure

```
src/lib/stores/
├── project/
│   ├── index.ts
│   ├── models.ts
│   └── projectStore.svelte.ts
├── gantt/
│   ├── index.ts
│   ├── models.ts
│   ├── helpers.ts
│   └── ganttStore.svelte.ts
├── timeline/
│   ├── index.ts
│   └── timelineStore.svelte.ts
└── dialog/
    ├── index.ts
    └── dialogStore.svelte.ts
```

## Verification checklist

After all tasks complete:
- [ ] `npm run check` passes (TypeScript + Svelte)
- [ ] `npm run build` succeeds
- [ ] No component imports `stores/project.svelte`
- [ ] Every `.svelte` component's `<script>` block is presentation-only (reads store state, calls store methods, manages local DOM/SVG state)
- [ ] All business logic lives in store files
- [ ] All derived computations live in store files
- [ ] All type definitions are in `models.ts` or `$lib/types.ts`
- [ ] All pure helper functions are in `helpers.ts` or `$lib/utils/`
