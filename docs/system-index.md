# System Index

Complete reference for the gantt-app codebase. Every system, file, and interaction documented.

## Architecture Overview

```
Browser
  |
  +-- SvelteKit App (src/routes/)
       |
       +-- +layout.svelte .............. Root shell: sidebar + content area + command palette + toaster
       |     |
       |     +-- AppSidebar ............ Project switcher, navigation links
       |     +-- Sidebar.Inset ......... Content area (renders page)
       |     +-- CommandPalette ........ Ctrl+K command search
       |     +-- Toaster ............... Toast notifications (svelte-sonner)
       |
       +-- +page.svelte ................ Main page: vertical resizable split
             |
             +-- GanttPane (65%) ....... Top: toolbar + gantt chart
             |     |
             |     +-- Toolbar ......... Breadcrumbs, zoom toggle, undo/redo, export, add task
             |     +-- [viewMode === 'gantt']
             |     |   GanttChart ...... CSS grid: frozen task list + scrollable SVG timeline
             |     |     |
             |     |     +-- GanttTaskList ...... Left column: tree rows with expand/collapse
             |     |     |     +-- GanttTaskRow .. Individual row with context menu
             |     |     |
             |     |     +-- GanttTimeline ..... Right column: SVG canvas
             |     |           +-- GanttGrid ......... Background lines + weekend shading
             |     |           +-- GanttBar .......... Draggable/resizable task bar
             |     |           +-- GanttMilestone .... Draggable diamond marker
             |     |           +-- GanttDependency ... SVG arrow paths between tasks
             |     |           +-- GanttTodayMarker .. Red dashed "today" line
             |     |
             |     +-- [viewMode === 'kanban']
             |         KanbanBoard .... Horizontal scroll of columns
             |           +-- KanbanColumn ...... Droppable column with header + cards
             |           |     +-- KanbanCard .. Draggable task card
             |           +-- "Add Column" ...... Inline form to create new columns
             |
             +-- DetailPane (35%) ...... Bottom: selected task details
                   +-- Tabs: Details, Description, Todos, Dependencies, Subtasks

  +-- TaskCreateDialog ................. Modal for creating/editing tasks (driven by dialogStore)
```

## Data Flow

```
projectStore          ganttStore                timelineStore
(projects, active) -> (task tree, selection, -> (padded range,
                       zoom, viewMode,          time scale,
                       todos, navigation,       pixel dimensions)
                       derived rows)

                      ganttStore            ->  dialogStore
                      (displayChildren,         (form state,
                       addChild, updateTask)     submit logic)

                      ganttStore            ->  kanbanStore
                      (displayChildren,         (column mgmt,
                       _triggerSave)             task grouping,
                                                drag state)
```

**Rule:** Data flows one direction. No circular dependencies between stores. Components read store state and call store methods — they never contain business logic.

---

## File Reference

### Configuration

| File | Purpose |
|---|---|
| `package.json` | Dependencies, scripts: `dev`, `build`, `check`, `preview` |
| `svelte.config.js` | SvelteKit config with adapter-auto, Svelte 5 runes |
| `vite.config.ts` | Vite + Tailwind + SvelteKit plugins |
| `tsconfig.json` | TypeScript strict mode, bundler module resolution |
| `components.json` | shadcn-svelte registry: zinc base color, `$lib/` paths |
| `VISION.md` | Product vision: local-first Gantt chart tool, feature roadmap |

### Routes

| File | Purpose |
|---|---|
| `src/routes/+layout.svelte` | Root layout: wraps content in `Sidebar.Provider` + `Sidebar.Inset`, renders `AppSidebar`, `CommandPalette`, `Toaster` |
| `src/routes/+page.svelte` | Home page: vertical `Resizable.PaneGroup` with `GanttPane` (65%) and `DetailPane` (35%) |
| `src/routes/layout.css` | Global Tailwind styles, OKLch theme tokens for light/dark, sidebar variables, font import (Inter) |

### Types (`src/lib/types.ts`)

Core data model — all stores and components import from here.

| Type | Fields | Purpose |
|---|---|---|
| `GanttNode` | id, name, color, startDate, endDate, progress, description, isMilestone, expanded, children[], dependencies[], todos[], kanbanColumnId | Recursive tree node — tasks, epics, subtasks are all GanttNodes |
| `Project` | id, name, description, children[], kanbanColumns[] | Top-level container holding root GanttNodes + kanban column definitions |
| `Dependency` | targetId, type, lag | Link between tasks (targetId = prerequisite) |
| `Todo` | id, text, done | Per-task checklist item |
| `KanbanColumn` | id, name | Kanban board column definition (default: Backlog) |
| `GanttRow` | id, name, level, dates, progress, color, isMilestone, hasChildren, expanded, dependencies[] | Flattened view of GanttNode tree for rendering |
| `ZoomLevel` | `'day' \| 'week' \| 'month' \| 'quarter'` | Zoom presets |
| `ZoomConfig` | columnUnit, columnWidth, topHeaderUnit, bottomHeaderUnit, formats, snapUnit | Per-zoom-level rendering config |
| `ROW_HEIGHT` | 36 | Pixel height of each row |
| `TASK_LIST_WIDTH` | 240 | Pixel width of the frozen left column |
| `ZOOM_CONFIGS` | Record<ZoomLevel, ZoomConfig> | Maps each zoom level to its column/header/snap settings |

### Stores

All stores use Svelte 5 runes (`$state`, `$derived`) in class-based singletons exported from `.svelte.ts` files. Each store directory has: `index.ts` (barrel export), `{name}Store.svelte.ts` (state + logic), and optionally `models.ts` (types) and `helpers.ts` (pure functions).

#### `src/lib/stores/project/`

**Purpose:** Project CRUD and active project selection. Contains sample data.

| File | Contents |
|---|---|
| `projectStore.svelte.ts` | `ProjectStore` class: `projects` (state), `activeProjectId` (state), `project` (derived active project). Methods: `switchProject()`, `createProject()`, `deleteProject()`. Also contains 3 sample projects as seed data and `deepClone` helper. |
| `models.ts` | Re-exports `Project` type from `$lib/types` |
| `index.ts` | Exports `projectStore` instance and `Project` type |

**Depends on:** Nothing (standalone root of the dependency graph).

#### `src/lib/stores/gantt/`

**Purpose:** Core gantt chart state. Owns the task tree, selection, zoom, navigation, and all derived computations consumed by components.

| File | Contents |
|---|---|
| `ganttStore.svelte.ts` | `GanttStore` class. **State:** `focusPath`, `zoomLevel`, `selectedTaskId`, `hoveredTaskId`. **Derived:** `focusedNode`, `displayChildren`, `breadcrumbs`, `rows` (flattened), `dateRange`, `zoomConfig`, `selectedTask`, `selectedEpic`, `selectedColor`, `duration`, `statusLabel`, `resolvedDependencies`, `resolvedSubtasks`, `rowContexts` (tree guides), `dependencyPairs`, `hasTasks`. **Methods:** `toggleExpand()`, `selectTask()`, `setZoom()`, `updateTask()`, `deleteTask()`, `setHoveredTask()`, `addChild()`, `getNodeById()`, `drillInto()`, `navigateTo()`, `switchProject()`, `createProject()`, `deleteProject()`, `handleKeyDown()`. |
| `helpers.ts` | Pure functions: `flattenNodes()`, `computeDateRange()`, `findNodeById()`, `deleteNodeById()`, `cleanDependencies()`, `findAncestor()`, `computeRowContexts()`, `computeDependencyPairs()` |
| `models.ts` | Types: `BreadcrumbEntry`, `RowContext`, `DependencyPair`, `ResolvedDependency` |
| `index.ts` | Exports `ganttStore` instance and model types |

**Depends on:** `projectStore` (reads `project.children` for all tree operations).

#### `src/lib/stores/timeline/`

**Purpose:** Timeline layout computations — pixel-space calculations derived from gantt state.

| File | Contents |
|---|---|
| `timelineStore.svelte.ts` | `TimelineStore` class. **Derived:** `paddedRange` (date range with padding), `timeScale` (d3 scaleTime mapping dates to pixels), `totalWidth` (SVG canvas width), `totalHeight` (SVG canvas height). |
| `index.ts` | Exports `timelineStore` instance |

**Depends on:** `ganttStore` (reads `dateRange`, `zoomConfig`, `rows`).

#### `src/lib/stores/dialog/`

**Purpose:** Task create/edit dialog form state and submission logic.

| File | Contents |
|---|---|
| `dialogStore.svelte.ts` | `DialogStore` class. **State:** `open`, `mode` (create/edit), `editTask`, `defaultEpicId`, form fields (`taskName`, `selectedEpicId`, `startDateValue`, `endDateValue`, `isMilestone`, `selectedColor`), popover state. **Derived:** `epicOptions` (from `ganttStore.displayChildren`). **Methods:** `requestCreate()`, `requestEdit()`, `close()`, `submit()`, `resetForm()`, `populateFromTask()`. **Helpers:** `isoToDateValue()`, `dateValueToIso()`, `formatDateDisplay()`. |
| `index.ts` | Exports `dialogStore` instance |

**Depends on:** `ganttStore` (reads `displayChildren`, calls `addChild()` and `updateTask()`).

#### `src/lib/stores/kanban/`

**Purpose:** Kanban board column management, task-to-column grouping, and drag state.

| File | Contents |
|---|---|
| `kanbanStore.svelte.ts` | `KanbanStore` class. **Derived:** `columns` (from `projectStore.project.kanbanColumns`), `columnTasks` (Map of columnId to GanttNode[] — recursively flattens `ganttStore.displayChildren` and groups by `kanbanColumnId`). **State:** `draggedTaskId`. **Methods:** `addColumn(name)`, `removeColumn(id)` (backlog protected — moves tasks back), `renameColumn(id, name)`, `reorderColumns(ids[])`, `moveTask(taskId, columnId)`, `startDrag(taskId)`, `endDrag()`. |
| `index.ts` | Exports `kanbanStore` instance |

**Depends on:** `ganttStore` (reads `displayChildren`, calls `_triggerSave()`), `projectStore` (reads/mutates `project.kanbanColumns`).

### Utils

| File | Purpose |
|---|---|
| `src/lib/utils.ts` | `cn()` — Tailwind class name merge (clsx + tailwind-merge). Type utilities: `WithoutChild`, `WithoutChildren`, `WithElementRef`. |
| `src/lib/utils/timeline.ts` | Timeline math (no external state). **Scale:** `createTimeScale()` — d3 scaleTime from date range + zoom config. **Headers:** `getTopHeaderGroups()`, `getBottomHeaderCells()` — compute header cell positions. **Date formatting:** `formatDate()` — custom format string parser (yyyy, MMM, dd, EEE, HH, Q, w tokens). **Arithmetic:** `addTime()`, `diffTime()`, `floorDate()`, `roundDate()`. **Helpers:** `isWeekend()`, `getToday()`, `padDateRange()`, `toLocalIso()`, `formatDisplayDate()`. |

### Hooks

| File | Purpose |
|---|---|
| `src/lib/hooks/is-mobile.svelte.ts` | `IsMobile` class extending Svelte 5 `MediaQuery` — reactive mobile breakpoint detection (768px). Used by sidebar for responsive behavior. |

### Components

#### Core Gantt Components (`src/lib/components/`)

| Component | Script Lines | Purpose | Store Dependencies |
|---|---|---|---|
| `gantt-pane.svelte` | ~30 | Toolbar container: breadcrumbs, zoom toggle, undo/redo, export, "Add Task" button. Hosts `TaskCreateDialog`. | `ganttStore`, `dialogStore` |
| `gantt-chart.svelte` | ~25 | CSS grid layout: corner cell + header + frozen task list + SVG timeline. Scroll-into-view on selection. Keyboard nav delegated to `ganttStore.handleKeyDown()`. | `ganttStore`, `timelineStore` |
| `gantt-task-list.svelte` | ~10 | Renders `GanttTaskRow` for each `ganttStore.rows` entry, passing tree guide context from `ganttStore.rowContexts`. | `ganttStore` |
| `gantt-task-row.svelte` | ~40 | Individual task row: expand/collapse chevron, color dot, name, badge, context menu (Add Sub-task, Edit, Delete). Click/double-click/hover handlers. | `ganttStore`, `dialogStore` |
| `gantt-timeline.svelte` | ~20 | SVG canvas wrapper: renders grid, bars, milestones, dependencies, today marker. Hover/selection highlight bands. | `ganttStore` (+ props from `gantt-chart`) |
| `gantt-header.svelte` | ~25 | Dual-row pinned header: top row (month/quarter/year), bottom row (hour/day/week/month). Weekend tinting. | Props only (no direct store import) |
| `gantt-grid.svelte` | ~30 | SVG background: vertical column lines, horizontal row lines, weekend shading rectangles. | Props only |
| `gantt-bar.svelte` | ~290 | SVG task bar with drag-to-move, drag-to-resize, snap preview ghost. Handles click/double-click/hover. Per-instance drag state stays local. | `ganttStore` |
| `gantt-milestone.svelte` | ~130 | SVG diamond marker with drag-to-move. Click/double-click/hover. Per-instance drag state stays local. | `ganttStore` |
| `gantt-dependency.svelte` | ~90 | SVG orthogonal path between two task bars. Smart routing for FS/SS/FF/SF dependency types. Hover highlighting. | Props only |
| `gantt-today-marker.svelte` | ~15 | Red dashed vertical line + "Today" label at current date position. | Props only |

#### Other Core Components

| Component | Script Lines | Purpose | Store Dependencies |
|---|---|---|---|
| `detail-pane.svelte` | ~100 | Bottom pane with 5 tabs. **Details:** schedule cards, progress slider, color picker, epic select. **Description:** markdown textarea. **Todos:** per-task checklist with add/toggle/delete. **Dependencies:** table of linked tasks. **Subtasks:** checkbox list. | `ganttStore`, `projectStore` |
| `task-create-dialog.svelte` | ~20 | Modal form: task name, epic select, date pickers, milestone toggle, color picker. All state from `dialogStore`. | `dialogStore` |
| `app-sidebar.svelte` | ~30 | Left sidebar: project dropdown (switch/create/delete), views list (Gantt Chart, Task List — toggle `ganttStore.viewMode`), recent projects list, settings link. | `ganttStore`, `projectStore` |
| `command-palette.svelte` | ~20 | Ctrl+K command dialog: New Task, New Epic, Open Project, Gantt Chart, Settings. Stub actions (no store wiring yet). | None |
| `kanban-board.svelte` | ~40 | Horizontal scroll of `KanbanColumn`s + "Add Column" inline form. Empty state when no tasks. Shown when `ganttStore.viewMode === 'kanban'`. | `kanbanStore`, `ganttStore` |
| `kanban-column.svelte` | ~70 | Single kanban column: editable header, task count badge, dropdown menu (Rename/Add Task/Delete), droppable card area with drag-over highlighting. | `kanbanStore`, `dialogStore` |
| `kanban-card.svelte` | ~40 | Compact draggable task card: color dot, name, dates, milestone badge, progress bar, todo count. HTML5 drag events. Click selects task. | `ganttStore`, `kanbanStore` |

#### UI Component Library (`src/lib/components/ui/`)

36 shadcn-svelte component directories. These are the design system primitives — do not modify directly. Generated via `npx shadcn-svelte@latest add <component>`.

| Category | Components |
|---|---|
| Layout | `sidebar`, `resizable`, `scroll-area`, `separator`, `card`, `collapsible` |
| Forms | `input`, `input-group`, `textarea`, `label`, `checkbox`, `switch`, `button`, `select`, `calendar`, `slider` |
| Data | `table`, `data-table`, `badge`, `skeleton`, `progress`, `chart` |
| Navigation | `breadcrumb`, `tabs`, `toggle`, `toggle-group`, `dropdown-menu`, `command` |
| Overlays | `dialog`, `drawer`, `alert-dialog`, `popover`, `sheet`, `context-menu`, `tooltip` |
| Feedback | `sonner` (toasts), `avatar` |

### Plans (`docs/plans/`)

| File | Status | Purpose |
|---|---|---|
| `2026-03-30-foundation-and-layout.md` | Done | Tailwind + shadcn setup, three-pane layout, sidebar |
| `2026-03-30-gantt-chart-implementation.md` | Done | Gantt chart: SVG rendering, drag, zoom, dependencies |
| `2026-03-30-nested-sub-gantt.md` | Done | Drill-down navigation with focusPath, breadcrumbs |
| `2026-03-30-store-extraction.md` | Done | BLoC/cubit store extraction from components |

---

## Key Interactions

### How task selection works
1. User clicks a task bar (`gantt-bar.svelte`) or task row (`gantt-task-row.svelte`)
2. Component calls `ganttStore.selectTask(id)`
3. `ganttStore.selectedTaskId` updates (state)
4. `ganttStore.selectedTask` re-derives (finds node by id in tree)
5. `ganttStore.selectedEpic`, `selectedColor`, `duration`, `statusLabel`, `resolvedDependencies`, `resolvedSubtasks` all re-derive
6. `detail-pane.svelte` reactively renders the new selection
7. `gantt-chart.svelte`'s `$effect` scrolls the selected row into view

### How drill-down navigation works
1. User double-clicks a task bar or task row
2. Component calls `ganttStore.drillInto(id)`
3. `ganttStore.focusPath` grows by one entry, `selectedTaskId` clears
4. `ganttStore.focusedNode` re-derives (finds node at end of path)
5. `ganttStore.displayChildren` re-derives (children of focused node)
6. `ganttStore.rows` re-derives (flattens new display children)
7. `ganttStore.breadcrumbs` re-derives (builds navigation trail)
8. `timelineStore.paddedRange`, `timeScale`, `totalWidth`, `totalHeight` all re-derive
9. The entire gantt chart re-renders showing the focused scope

### How drag-to-move works
1. User mousedowns on a task bar (`gantt-bar.svelte`)
2. Component captures SVG coordinates, stores original dates, sets `isDragging = true`
3. mousemove updates `dragOffsetX` (local state — per-instance)
4. `snapPreview` derives the snapped target position from the offset
5. Ghost rectangle renders at snap position
6. Bar translates by raw pixel offset (CSS transform)
7. mouseup: if `snapPreview` exists, calls `ganttStore.updateTask(id, { startDate, endDate })`
8. `ganttStore` mutates the node in the tree, triggering reactive re-render

### How task creation works
1. User clicks "Add Task" button (`gantt-pane.svelte`) or context menu "Add Sub-task" (`gantt-task-row.svelte`)
2. Component calls `dialogStore.requestCreate(epicId?)`
3. `dialogStore` resets form fields, sets `open = true`
4. `task-create-dialog.svelte` renders the modal (reads all state from `dialogStore`)
5. User fills form, clicks "Create Task"
6. `dialogStore.submit()` constructs a `GanttNode`, calls `ganttStore.addChild(parentId, node)`
7. `ganttStore` pushes the node into the tree, reactive derivations update

### How zoom works
1. User clicks a zoom level in the toggle group (`gantt-pane.svelte`)
2. Component calls `ganttStore.setZoom(level)`
3. `ganttStore.zoomLevel` updates, `ganttStore.zoomConfig` re-derives from `ZOOM_CONFIGS`
4. `timelineStore.paddedRange` re-derives (different padding per column unit)
5. `timelineStore.timeScale` re-derives (new d3 scale with different column widths)
6. `timelineStore.totalWidth` re-derives
7. All SVG elements re-render with new positions

### How project switching works
1. User selects a project in the sidebar dropdown (`app-sidebar.svelte`)
2. Component calls `ganttStore.switchProject(id)` (not `projectStore` directly)
3. `ganttStore.switchProject()` calls `projectStore.switchProject(id)`, then clears `selectedTaskId`, `hoveredTaskId`, `focusPath`
4. `projectStore.activeProjectId` updates, `projectStore.project` re-derives
5. All ganttStore derived values cascade: `displayChildren`, `rows`, `dateRange`, etc.
6. Entire UI re-renders with the new project's data

### How view switching works (Gantt / Kanban)
1. User clicks "Gantt Chart" or "Task List" in the sidebar (`app-sidebar.svelte`)
2. Component calls `ganttStore.setViewMode('gantt')` or `ganttStore.setViewMode('kanban')`
3. `ganttStore.viewMode` updates
4. `gantt-pane.svelte` conditionally renders `<GanttChart />` or `<KanbanBoard />`
5. Zoom controls hide in kanban mode
6. Both views share the same `displayChildren` (drill-down works in both)

### How kanban drag-and-drop works
1. User drags a card (`kanban-card.svelte`) — HTML5 `dragstart` fires
2. `kanbanStore.startDrag(taskId)` sets `draggedTaskId`, `dataTransfer` carries task ID
3. Dragging over a column (`kanban-column.svelte`) — `dragover` fires, column highlights
4. User drops on target column — `drop` fires
5. `kanbanStore.moveTask(taskId, columnId)` sets `node.kanbanColumnId` on the GanttNode
6. `kanbanStore.columnTasks` re-derives — card moves to new column
7. `_triggerSave()` persists the change

### How todos work
1. User selects a task, opens the "Todos" tab in the detail pane
2. Typing in the input and clicking "Add" calls `ganttStore.addTodo(taskId, text)`
3. A new `Todo` is pushed to `node.todos`, `_triggerSave()` fires
4. Clicking a checkbox calls `ganttStore.toggleTodo(taskId, todoId)` — flips `todo.done`
5. Clicking the X button calls `ganttStore.removeTodo(taskId, todoId)` — filters it out
6. Todo count is shown on kanban cards (`todoDone/todoCount`)

---

## Conventions

### Store pattern (BLoC/Cubit)
- Each feature has its own directory under `src/lib/stores/`
- Files: `index.ts`, `{name}Store.svelte.ts`, optional `models.ts`, `helpers.ts`
- Stores are class-based singletons using Svelte 5 runes (`$state`, `$derived`)
- All business logic lives in stores — components are presentation-only
- Exception: per-instance SVG drag/resize state stays in components (gantt-bar, gantt-milestone)
- Reference: LLM-Teacher project at `/home/antonlx/development/LLM-Teacher/webapp/src/lib/stores/`

### Component pattern
- Components import stores and read state reactively
- Event handlers call store methods — no logic in the handler itself
- Props are used only when the component is a generic child that receives data from its parent (e.g., `gantt-header` receives `timeScale` from `gantt-chart`)
- shadcn-svelte UI primitives in `ui/` are not modified directly

### Naming
- Store files: `camelCaseStore.svelte.ts`
- Helper files: `camelCase.ts`
- Component files: `kebab-case.svelte`
- Types: `PascalCase` interfaces in `types.ts` or `models.ts`
- Constants: `UPPER_SNAKE_CASE` (e.g., `ROW_HEIGHT`, `TASK_LIST_WIDTH`)

### Styling
- Tailwind CSS 4 with OKLch color tokens in `layout.css`
- Dark theme enforced (`.dark` class on `<html>`)
- shadcn-svelte semantic tokens: `bg-background`, `text-foreground`, `border`, `muted`, etc.
- No custom CSS files — all styling via Tailwind utility classes
