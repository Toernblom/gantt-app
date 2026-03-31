# Gantt Chart Core Implementation

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the empty Gantt placeholder with a fully functional SVG-based Gantt chart featuring a frozen task list column, dual-row timeline header, interactive task bars across all four zoom levels, dependency arrows, and a today marker. Wire up the existing toolbar controls and connect selection to the detail pane.

**Architecture:** The `gantt-pane.svelte` main area becomes a horizontal split: a frozen task-list column on the left (HTML, ~240px) and a scrollable SVG timeline on the right. Vertical scrolling is synced between both sides. The timeline header stays pinned at top. All project data flows through a centralized Svelte 5 runes-based store.

**Key Decisions:**
- SVG-based rendering (not Canvas, not pure HTML grid)
- d3-scaleTime for date-to-pixel mapping (already installed)
- All four zoom levels (Day/Week/Month/Quarter) available from the start
- Frozen left column shows only task name + expand/collapse toggle
- Dual-row header (coarse unit on top, fine unit on bottom)
- Today marker: vertical red dashed line
- Sidebar stays project-level navigation — task tree lives inside the Gantt pane

---

## shadcn-svelte Component Map

Extensive use of shadcn components throughout:

| Component | Location | Purpose |
|-----------|----------|---------|
| **ScrollArea** | Task list, Timeline | Synced vertical scrolling, horizontal timeline scroll |
| **Collapsible** | Task list rows | Expand/collapse epics and parent tasks |
| **Tooltip** | Task bars, task list rows, header cells | Hover info: full task name, dates, progress |
| **Badge** | Task list rows | Epic color dot + task count on collapsed epics |
| **ContextMenu** | Task bars, empty timeline area, task list rows | Right-click actions (add/edit/delete task, add dependency) |
| **Popover** | Task bars | Quick-edit popover on click: name, dates, progress |
| **Separator** | Between task list and timeline, between epics | Visual dividers |
| **ToggleGroup** | Toolbar (existing) | Zoom level switching — wire to store |
| **Breadcrumb** | Toolbar (existing) | Project > Epic navigation — wire to store |
| **Button** | Toolbar, popover, dialogs | Actions throughout |
| **Dialog** | Global overlay | Create new task / edit task form |
| **AlertDialog** | Global overlay | Confirm task/epic deletion |
| **Select** | Dialog forms, popover | Epic assignment, dependency type (FS/SS/FF/SF) |
| **Calendar** | Dialog forms, popover | Start/end date picking |
| **Input** | Dialog forms, popover, inline edit | Task name editing |
| **Label** | Dialog forms | Form field labels |
| **Slider** | Popover quick-edit | Progress 0-100% |
| **Progress** | Task bars (SVG overlay), task list | Visual progress indicator |
| **Card** | Popover content | Structured quick-edit layout |
| **Kbd** | Tooltips, context menus | Keyboard shortcut hints |
| **Skeleton** | Timeline area | Loading state while computing layout |
| **DropdownMenu** | Task list row actions | Overflow actions menu |

---

## Data Model

### Types (`src/lib/types.ts`)

```typescript
export type ZoomLevel = 'day' | 'week' | 'month' | 'quarter';
export type DependencyType = 'FS' | 'SS' | 'FF' | 'SF';

export interface Project {
  name: string;
  description?: string;
  epics: Epic[];
}

export interface Epic {
  id: string;
  name: string;
  color: string;
  expanded: boolean;
  tasks: Task[];
}

export interface Task {
  id: string;
  name: string;
  startDate: string;   // ISO 8601 date string
  endDate: string;      // ISO 8601 date string
  progress: number;     // 0-100
  description?: string;
  color?: string;       // override epic color
  isMilestone: boolean;
  expanded: boolean;
  subtasks: Subtask[];
  dependencies: Dependency[];
}

export interface Subtask {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  progress: number;
  dependencies: Dependency[];
}

export interface Dependency {
  targetId: string;
  type: DependencyType;
  lag: number;          // days, can be negative
}

// Flattened row for rendering — computed from hierarchical data
export interface GanttRow {
  id: string;
  name: string;
  level: number;        // 0 = epic, 1 = task, 2 = subtask
  type: 'epic' | 'task' | 'subtask';
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

### Zoom Level Configuration

```typescript
export interface ZoomConfig {
  columnUnit: 'hour' | 'day' | 'week' | 'month';
  columnWidth: number;        // pixels per column unit
  topHeaderUnit: 'day' | 'week' | 'month' | 'quarter' | 'year';
  bottomHeaderUnit: 'hour' | 'day' | 'week' | 'month' | 'quarter';
  topHeaderFormat: string;    // date-fns/Intl format
  bottomHeaderFormat: string;
  snapUnit: 'hour' | 'day' | 'week';
}

export const ZOOM_CONFIGS: Record<ZoomLevel, ZoomConfig> = {
  day: {
    columnUnit: 'hour',
    columnWidth: 30,
    topHeaderUnit: 'day',
    bottomHeaderUnit: 'hour',
    topHeaderFormat: 'EEE, MMM d',   // "Mon, Mar 30"
    bottomHeaderFormat: 'HH',         // "09", "10"
    snapUnit: 'hour',
  },
  week: {
    columnUnit: 'day',
    columnWidth: 40,
    topHeaderUnit: 'month',
    bottomHeaderUnit: 'day',
    topHeaderFormat: 'MMMM yyyy',     // "March 2026"
    bottomHeaderFormat: 'd',           // "1", "2", "3"
    snapUnit: 'day',
  },
  month: {
    columnUnit: 'week',
    columnWidth: 50,
    topHeaderUnit: 'quarter',
    bottomHeaderUnit: 'week',
    topHeaderFormat: "'Q'Q yyyy",     // "Q1 2026"
    bottomHeaderFormat: "'W'w",        // "W13"
    snapUnit: 'week',
  },
  quarter: {
    columnUnit: 'month',
    columnWidth: 60,
    topHeaderUnit: 'year',
    bottomHeaderUnit: 'month',
    topHeaderFormat: 'yyyy',          // "2026"
    bottomHeaderFormat: 'MMM',         // "Jan", "Feb"
    snapUnit: 'month',
  },
};
```

---

## Component Architecture

### File Structure

```
src/lib/
├── types.ts                          # All TypeScript interfaces
├── stores/
│   └── project.svelte.ts             # Centralized project state (Svelte 5 runes)
├── utils/
│   └── timeline.ts                   # Date math, d3-scale factories, row flattening
├── components/
│   ├── gantt-pane.svelte             # MODIFY: replace placeholder with gantt-chart
│   ├── gantt-chart.svelte            # NEW: main container (task list + timeline)
│   ├── gantt-task-list.svelte        # NEW: frozen left column with task tree
│   ├── gantt-task-row.svelte         # NEW: single row in task list (name + toggle)
│   ├── gantt-timeline.svelte         # NEW: scrollable SVG timeline
│   ├── gantt-header.svelte           # NEW: dual-row pinned header (SVG)
│   ├── gantt-bar.svelte              # NEW: single task bar (SVG group)
│   ├── gantt-milestone.svelte        # NEW: diamond milestone marker (SVG)
│   ├── gantt-dependency.svelte       # NEW: dependency arrow path (SVG)
│   ├── gantt-today-marker.svelte     # NEW: vertical red line for today
│   ├── gantt-grid.svelte             # NEW: background grid lines (SVG)
│   ├── task-create-dialog.svelte     # NEW: create/edit task dialog
│   ├── detail-pane.svelte            # MODIFY: wire to store selection
│   └── app-sidebar.svelte            # MODIFY: simplify to project-level nav
```

### Component Hierarchy

```
gantt-pane.svelte (toolbar + main area)
└── gantt-chart.svelte (horizontal split container)
    ├── gantt-task-list.svelte (frozen left, ~240px)
    │   └── gantt-task-row.svelte (×N, one per visible row)
    │       ├── Collapsible trigger (expand/collapse)
    │       ├── Tooltip (full task name on hover)
    │       ├── ContextMenu (right-click actions)
    │       └── Badge (epic indicator)
    │
    └── gantt-timeline.svelte (scrollable right side)
        ├── gantt-header.svelte (pinned top, dual-row)
        │   └── Tooltip (date range on hover per header cell)
        │
        └── <svg> (main drawing area)
            ├── gantt-grid.svelte (vertical + horizontal lines)
            ├── gantt-bar.svelte (×N, one per visible row)
            │   ├── <rect> task bar with rounded corners
            │   ├── <rect> progress fill overlay
            │   ├── Tooltip (hover: name, dates, progress%)
            │   ├── Popover (click: quick-edit Card with Input, Calendar, Slider)
            │   └── ContextMenu (right-click: edit, delete, add dep)
            │
            ├── gantt-milestone.svelte (×N, diamond markers)
            ├── gantt-dependency.svelte (×N, SVG path arrows)
            └── gantt-today-marker.svelte (single red dashed line)
```

---

## Store Design (`src/lib/stores/project.svelte.ts`)

```typescript
// Svelte 5 runes-based store — single source of truth

class ProjectStore {
  // Project data
  project = $state<Project>(defaultProject);

  // UI state
  zoomLevel = $state<ZoomLevel>('week');
  selectedTaskId = $state<string | null>(null);
  hoveredTaskId = $state<string | null>(null);
  scrollLeft = $state(0);
  scrollTop = $state(0);

  // Derived: flatten hierarchy into renderable rows
  rows = $derived<GanttRow[]>(flattenRows(this.project));

  // Derived: date range for the timeline
  dateRange = $derived(computeDateRange(this.rows));

  // Derived: selected task object
  selectedTask = $derived(
    this.selectedTaskId ? findTaskById(this.project, this.selectedTaskId) : null
  );

  // Methods
  toggleExpand(id: string) { ... }
  selectTask(id: string | null) { ... }
  setZoom(level: ZoomLevel) { ... }
  addTask(epicId: string, task: Task) { ... }
  updateTask(id: string, updates: Partial<Task>) { ... }
  deleteTask(id: string) { ... }
  addDependency(fromId: string, toId: string, type: DependencyType) { ... }
  moveTask(id: string, newStartDate: string) { ... }
  resizeTask(id: string, newEndDate: string) { ... }
}

export const projectStore = new ProjectStore();
```

---

## Row Flattening Logic

The hierarchical data must be flattened into a linear row list based on expand/collapse state:

```
Input (data structure):
  Epic A (expanded=true, color=#3b82f6)
    Task 1 (expanded=true)
      Subtask 1a
      Subtask 1b
    Task 2 (expanded=false, has subtasks)
  Epic B (expanded=false, has tasks)

Output (flat rows):
  [0] Epic A      level=0  type=epic     hasChildren=true  expanded=true
  [1]   Task 1    level=1  type=task     hasChildren=true  expanded=true
  [2]     Sub 1a  level=2  type=subtask  hasChildren=false
  [3]     Sub 1b  level=2  type=subtask  hasChildren=false
  [4]   Task 2    level=1  type=task     hasChildren=true  expanded=false
  [5] Epic B      level=0  type=epic     hasChildren=true  expanded=false
```

Each row gets a consistent height (ROW_HEIGHT = 36px). The same row index drives both the task list and SVG bar placement.

---

## SVG Timeline Rendering

### Coordinate System

```
SVG viewBox: (0, 0, totalWidth, totalHeight)

totalWidth  = d3.scaleTime domain span × columnWidth per unit
totalHeight = visibleRows.length × ROW_HEIGHT

x position of a date:  timeScale(date)  — d3.scaleTime
y position of row N:   N × ROW_HEIGHT
```

### d3-scaleTime Setup

```typescript
import { scaleTime } from 'd3-scale';

function createTimeScale(dateRange, zoomConfig, containerWidth) {
  const [startDate, endDate] = dateRange;
  // Add padding: 1 unit before start, 2 units after end
  const paddedStart = subtractUnit(startDate, zoomConfig.columnUnit, 1);
  const paddedEnd = addUnit(endDate, zoomConfig.columnUnit, 2);

  const totalColumns = countUnits(paddedStart, paddedEnd, zoomConfig.columnUnit);
  const totalWidth = totalColumns * zoomConfig.columnWidth;

  return scaleTime()
    .domain([paddedStart, paddedEnd])
    .range([0, totalWidth]);
}
```

### Task Bar Rendering

```
For each GanttRow:
  x      = timeScale(row.startDate)
  width  = timeScale(row.endDate) - x
  y      = rowIndex * ROW_HEIGHT + barPadding
  height = ROW_HEIGHT - 2 * barPadding
  rx/ry  = 4 (rounded corners)
  fill   = row.color

Progress overlay:
  Same position, but width = fullWidth * (progress / 100)
  Slightly lighter/darker shade
```

### Epic Summary Bars

When an epic row is collapsed, render a summary bar spanning from the earliest task start to the latest task end within that epic. Use a hatched or gradient fill to distinguish from regular task bars.

### Milestone Markers

Tasks with `isMilestone: true` render as a diamond (rotated square) instead of a bar:
```
<rect x y width=12 height=12 transform="rotate(45)" />
```

### Dependency Arrows

SVG `<path>` elements connecting bars:
- **Finish-to-Start (FS):** Arrow from right edge of source → left edge of target
- **Start-to-Start (SS):** Arrow from left edge of source → left edge of target
- **Finish-to-Finish (FF):** Arrow from right edge of source → right edge of target
- **Start-to-Finish (SF):** Arrow from left edge of source → right edge of target

Path routing: Horizontal out from source, vertical jog, horizontal into target. Use `<marker>` SVG element for arrowheads.

```svg
<defs>
  <marker id="arrowhead" markerWidth="8" markerHeight="6"
          refX="8" refY="3" orient="auto">
    <path d="M 0 0 L 8 3 L 0 6 Z" fill="currentColor" />
  </marker>
</defs>
<path d="M x1,y1 H midX V y2 H x2"
      stroke="var(--muted-foreground)"
      stroke-width="1.5"
      fill="none"
      marker-end="url(#arrowhead)" />
```

### Grid Lines

- **Vertical lines:** At each column boundary (day/week/month depending on zoom)
- **Horizontal lines:** At each row boundary (every ROW_HEIGHT)
- **Weekend shading:** Subtle background rect on Saturday/Sunday columns (week/day zoom)
- **Colors:** `var(--border)` for grid, `var(--muted)` for weekend shading

### Today Marker

```svg
<line x1={timeScale(today)} y1={0}
      x2={timeScale(today)} y2={totalHeight}
      stroke="var(--destructive)"
      stroke-width="2"
      stroke-dasharray="6,4"
      opacity="0.8" />
```

---

## Synced Scrolling Strategy

The frozen task list and SVG timeline must scroll vertically in sync:

```
┌──────────────┬───────────────────────────────┐
│  HEADER      │  TIMELINE HEADER (pinned)     │ ← position: sticky top
│  (empty)     │  [Month row] [Day row]        │
├──────────────┼───────────────────────────────┤
│  Task list   │  SVG Timeline                 │ ← synced vertical scroll
│  (overflow-y)│  (overflow-x + overflow-y)    │
│              │                               │
│  scrolls ↕   │  scrolls ↕ (synced) + ↔      │
└──────────────┴───────────────────────────────┘
```

Implementation:
- Both sides share a single scroll container (or use `onscroll` event forwarding)
- Preferred approach: single `<div>` with `overflow: auto` wrapping both, where the task list uses `position: sticky; left: 0` to freeze horizontally
- This avoids manual scroll sync and uses native CSS sticky positioning

```html
<div class="gantt-scroll-container" style="overflow: auto;">
  <!-- Each row is a flex container -->
  <div class="gantt-row" style="display: flex;">
    <div class="task-cell" style="position: sticky; left: 0; width: 240px;">
      Task name...
    </div>
    <svg class="bar-cell" style="flex: 1;">
      <!-- bar rendered here -->
    </svg>
  </div>
</div>
```

Actually, better approach: Use a single SVG for the timeline portion with its own scroll wrapper, and use a `foreignObject` or separate HTML div for the task list, synced via a shared scroll handler. The cleanest approach:

**Final approach:** One outer scroll container. Task list column is `position: sticky; left: 0; z-index: 10` with a background. Timeline extends to the right. Vertical scroll is naturally shared. Horizontal scroll only moves the timeline.

---

## Interactions (Phase 1)

### Click to Select
- Click a task bar → `projectStore.selectTask(id)` → detail pane updates
- Click task name in list → same behavior
- Visual: selected bar gets a bright border/outline ring
- shadcn: Popover appears anchored to the bar with quick-edit Card

### Hover
- Hover bar → Tooltip with: task name, start date, end date, progress%, duration
- Hover row in task list → subtle highlight on both task list and corresponding SVG row

### Right-Click Context Menu
- On a task bar: Edit Task, Delete Task, Add Dependency, View Dependencies
- On empty timeline: Add Task Here (pre-fills date from click position), Add Milestone
- On task list row: same as bar context menu + Move Up/Down

### Expand/Collapse
- Click chevron in task list → `projectStore.toggleExpand(id)`
- Rows animate in/out, SVG reflows

### Zoom Switching
- ToggleGroup in toolbar → `projectStore.setZoom(level)`
- Timeline re-renders with new column widths and header format
- Attempts to keep the current viewport center date stable

---

## Task Create/Edit Dialog

shadcn Dialog with form fields:

```
┌─────────────────────────────────────────────┐
│  Create Task                            [×] │
├─────────────────────────────────────────────┤
│                                             │
│  Task Name     [________________________]   │
│                                             │
│  Epic          [Select epic...        ▾]    │  ← shadcn Select
│                                             │
│  Start Date    [📅 Mar 30, 2026      ]      │  ← shadcn Calendar in Popover
│  End Date      [📅 Apr 15, 2026      ]      │  ← shadcn Calendar in Popover
│                                             │
│  Milestone     [toggle]                     │  ← shadcn Switch
│                                             │
│  Color         ● ● ● ● ● ●                 │  ← color picker dots
│                                             │
├─────────────────────────────────────────────┤
│                    [Cancel]  [Create Task]   │  ← shadcn Buttons
└─────────────────────────────────────────────┘
```

---

## Sample Data

Ship with realistic sample data so the chart is immediately useful to verify:

```typescript
const sampleProject: Project = {
  name: "Website Redesign",
  description: "Complete redesign of the company website",
  epics: [
    {
      id: "e1", name: "Discovery & Planning", color: "#3b82f6", expanded: true,
      tasks: [
        { id: "t1", name: "Stakeholder interviews", startDate: "2026-03-16", endDate: "2026-03-20", progress: 100, ... },
        { id: "t2", name: "Competitive analysis", startDate: "2026-03-18", endDate: "2026-03-25", progress: 80, ... },
        { id: "t3", name: "Requirements document", startDate: "2026-03-23", endDate: "2026-03-27", progress: 40, dependencies: [{ targetId: "t1", type: "FS", lag: 0 }], ... },
      ]
    },
    {
      id: "e2", name: "Design", color: "#10b981", expanded: true,
      tasks: [
        { id: "t4", name: "Wireframes", startDate: "2026-03-30", endDate: "2026-04-03", progress: 0, dependencies: [{ targetId: "t3", type: "FS", lag: 1 }], ... },
        { id: "t5", name: "Visual design", startDate: "2026-04-06", endDate: "2026-04-17", progress: 0, subtasks: [...], ... },
        { id: "t6", name: "Design review", startDate: "2026-04-17", endDate: "2026-04-17", isMilestone: true, ... },
      ]
    },
    {
      id: "e3", name: "Development", color: "#f59e0b", expanded: false,
      tasks: [
        { id: "t7", name: "Frontend build", startDate: "2026-04-20", endDate: "2026-05-15", progress: 0, ... },
        { id: "t8", name: "Backend API", startDate: "2026-04-20", endDate: "2026-05-08", progress: 0, ... },
        { id: "t9", name: "Integration testing", startDate: "2026-05-11", endDate: "2026-05-22", progress: 0, ... },
        { id: "t10", name: "Launch", startDate: "2026-05-25", endDate: "2026-05-25", isMilestone: true, ... },
      ]
    }
  ]
};
```

---

## Implementation Tasks

### Task 1: Data Foundation
**Files:** `src/lib/types.ts`, `src/lib/stores/project.svelte.ts`, `src/lib/utils/timeline.ts`

1. Create all TypeScript interfaces (Project, Epic, Task, Subtask, Dependency, GanttRow, ZoomConfig)
2. Create zoom configuration constants (ZOOM_CONFIGS, ROW_HEIGHT)
3. Build the ProjectStore class with Svelte 5 runes ($state, $derived)
4. Implement `flattenRows()` — hierarchical data → flat GanttRow array based on expand/collapse
5. Implement `computeDateRange()` — find min start and max end across all visible rows
6. Implement d3-scaleTime factory function for each zoom level
7. Implement date utility helpers (addUnit, subtractUnit, countUnits, formatHeader)
8. Add sample project data

### Task 2: Gantt Chart Container & Task List
**Files:** `src/lib/components/gantt-chart.svelte`, `src/lib/components/gantt-task-list.svelte`, `src/lib/components/gantt-task-row.svelte`

1. Create `gantt-chart.svelte` — horizontal flex container with frozen left + scrollable right
2. Implement sticky positioning for the task list column (position: sticky, left: 0)
3. Create `gantt-task-list.svelte` — renders list of GanttRow items with indentation by level
4. Create `gantt-task-row.svelte` — single row with:
   - Indentation padding based on `row.level`
   - Collapsible chevron toggle (shadcn Collapsible trigger) when `hasChildren`
   - Task name with Tooltip for overflow
   - Epic color Badge dot
   - ContextMenu (right-click: Add Task, Edit, Delete)
   - DropdownMenu on hover for row actions
5. Click handler on row → `projectStore.selectTask(id)`
6. Selected row highlight styling
7. Shared ROW_HEIGHT constant for alignment with SVG

### Task 3: SVG Timeline — Grid & Header
**Files:** `src/lib/components/gantt-timeline.svelte`, `src/lib/components/gantt-header.svelte`, `src/lib/components/gantt-grid.svelte`

1. Create `gantt-timeline.svelte` — wrapper with pinned header + scrollable SVG body
2. Create `gantt-header.svelte` — dual-row header rendered as SVG or HTML:
   - Top row: coarser time unit (months, quarters, years) with Tooltip showing date range
   - Bottom row: finer time unit (days, weeks, months)
   - Styling: `var(--muted)` background, `var(--border)` dividers, `var(--foreground)` text
3. Create `gantt-grid.svelte` — SVG group with:
   - Vertical lines at each column boundary
   - Horizontal lines at each ROW_HEIGHT
   - Weekend shading (subtle `var(--muted)` rects on Sat/Sun in day/week zoom)
4. Wire zoom level changes to re-render with correct ZoomConfig

### Task 4: SVG Task Bars & Milestones
**Files:** `src/lib/components/gantt-bar.svelte`, `src/lib/components/gantt-milestone.svelte`

1. Create `gantt-bar.svelte` — SVG `<g>` group per task:
   - Background `<rect>` with rounded corners (rx=4), filled with `row.color`
   - Progress overlay `<rect>` with slightly different opacity, width = progress%
   - Epic summary bars when collapsed: hatched fill spanning child date range
   - Selected state: bright ring/outline using SVG stroke
   - Hover state: slight brightness increase
2. Create `gantt-milestone.svelte` — rotated diamond SVG marker
3. Add Tooltip (via Svelte) on hover: shows task name, dates, duration, progress
4. Add Popover on click: quick-edit Card with Input (name), Calendar (dates), Slider (progress)
5. Add ContextMenu on right-click: Edit Task, Delete Task, Add Dependency

### Task 5: Today Marker & Dependency Arrows
**Files:** `src/lib/components/gantt-today-marker.svelte`, `src/lib/components/gantt-dependency.svelte`

1. Create `gantt-today-marker.svelte` — red dashed vertical SVG line at today's x position
2. Create `gantt-dependency.svelte` — SVG path with arrowhead marker:
   - Calculate start point based on dependency type (FS/SS/FF/SF) and source bar position
   - Calculate end point based on target bar position
   - Route path: horizontal → vertical jog → horizontal (avoid overlapping bars)
   - SVG `<marker>` arrowhead definition in `<defs>`
   - Color: `var(--muted-foreground)`, highlighted on hover
3. Render all dependencies by iterating through rows and their dependency arrays

### Task 6: Wire Up Toolbar & Detail Pane
**Files:** `src/lib/components/gantt-pane.svelte` (modify), `src/lib/components/detail-pane.svelte` (modify)

1. Modify `gantt-pane.svelte`:
   - Replace placeholder with `<GanttChart />`
   - Wire ToggleGroup zoom to `projectStore.setZoom()`
   - Wire Breadcrumb to show current epic scope (if epic selected)
   - Wire undo/redo buttons (placeholder for now, prep for undo system)
   - Wire context menu actions to store methods
2. Modify `detail-pane.svelte`:
   - Read from `projectStore.selectedTask` instead of hardcoded data
   - Wire all form inputs to `projectStore.updateTask()`
   - Wire dependency table to real dependency data
   - Wire subtask list to real subtask data
   - Show empty state when `selectedTaskId === null`

### Task 7: Modify Sidebar
**Files:** `src/lib/components/app-sidebar.svelte` (modify)

1. Remove the epics/tasks tree from sidebar (that now lives in Gantt task list)
2. Keep: project header dropdown, Views group (Gantt Chart, Task List), Settings
3. Add: Recent Projects list (placeholder for file storage)
4. Keep sidebar focused on project-level navigation

### Task 8: Task Create Dialog
**Files:** `src/lib/components/task-create-dialog.svelte`

1. Create Dialog with form:
   - Input: task name (required)
   - Select: epic assignment
   - Calendar in Popover: start date
   - Calendar in Popover: end date
   - Switch: milestone toggle
   - Color picker dots
2. Wire "Add Task" context menu actions to open this dialog
3. Pre-fill epic and date when triggered from context menu (date from click position)
4. On submit: `projectStore.addTask(epicId, task)`

### Task 9: Polish & Visual Refinement
1. Smooth transitions on expand/collapse (row height animation)
2. Hover cross-highlighting: hovering a row in task list highlights the SVG bar, and vice versa
3. Keyboard navigation: arrow keys to move selection, Enter to edit
4. Ensure dark theme colors work well: high contrast bars on dark grid
5. Responsive: handle narrow viewport by collapsing task list
6. Skeleton loading state while initial layout computes

---

## Visual Reference

```
┌──sidebar──┐┌──task list──┬──────────timeline───────────────────┐
│           ││             │ March 2026        │ April 2026      │
│ My Project││             │ 16 17 18 19 20 21 │ 22 23 24 25 26 │
│ ─────────────────────────┼───────────────────┼─────────────────│
│ Views     ││ ▼ Discovery │ ████████████████  │                 │ ← epic bar
│  ◉ Gantt  ││   Interviews│   ██████████      │                 │
│  ○ List   ││   Analysis  │     ████████████████               │
│           ││   Req. Doc  │          │████████│                 │
│ ─────────────────────────┼──────────┼────────┼─────────────────│
│ Recent    ││ ▼ Design    │          │        │  ████████       │
│           ││   Wireframes│          │    ┌───┼──→████████      │
│           ││   Visual    │          │    │   │       ████████  │
│           ││   ◆ Review  │          │    │   │            ◆    │ ← milestone
│ ─────────────────────────┼──────────┼────┼───┼─────────────────│
│ Settings  ││ ▶ Developm… │          │    │   │  ░░░░░░░░░░░░░ │ ← collapsed
│           ││             │          │  today │                 │
└───────────┘└─────────────┴──────────┴────────┴─────────────────┘
                                           ↑ red dashed line
```

---

## Out of Scope (Future Work)

- Drag to move task bars along timeline
- Drag bar edges to resize duration
- Draw dependency arrows by clicking
- Critical path highlighting
- File System Access API (save/load .gantt.json)
- Undo/redo system
- PNG/SVG/CSV export
- Resource assignment
- Baseline comparison
