# Gantt App — Vision

A modern, local-first Gantt chart project management tool. No cloud, no subscriptions — just files on your PC. Built to replace GanttProject with something that actually looks good.

## Layout

Three-pane resizable layout using shadcn-svelte Resizable components:

```
┌─────────────────┬──────────────────────────────┐
│                 │                              │
│   Pane One      │       Pane Two               │
│   Task Tree     │       Gantt Chart            │
│                 │                              │
│   - Epics       │   ── ████████ ──             │
│     - Tasks     │      ███ ──────              │
│     - Subtasks  │        ██████ ──             │
│                 │                              │
│                 ├──────────────────────────────┤
│                 │                              │
│                 │       Pane Three              │
│                 │       Task Details            │
│                 │                              │
│                 │   Description, notes,         │
│                 │   dates, assignments,         │
│                 │   dependencies — rich         │
│                 │   formatted view              │
│                 │                              │
└─────────────────┴──────────────────────────────┘
```

- **Pane One (left):** Hierarchical task tree. Epics at the top level, tasks and subtasks nested underneath. Click to select, expand/collapse epics.
- **Pane Two (top right):** The Gantt chart. Interactive timeline with draggable bars, dependency arrows, and zoom controls. When an epic is selected, the Gantt shows a sub-Gantt scoped to that epic's tasks.
- **Pane Three (bottom right):** Detail view for the selected task. Rich formatted description, metadata (dates, duration, progress, dependencies), and notes.

All three panes are resizable via drag handles.

## Core Concepts

### Epics
Top-level containers that group related work. Each epic has its own color, timeline, and sub-Gantt view. Selecting an epic in Pane One scopes Pane Two to show only that epic's tasks in detail.

### Tasks & Subtasks
Tasks belong to epics. They have:
- Name
- Start date and duration (or start/end dates)
- Dependencies (finish-to-start, start-to-start, etc.)
- Progress (0-100%)
- Description (rich text / markdown)
- Color (inherited from epic or overridden)

Subtasks nest under tasks for further breakdown.

### Dependencies
Visual arrows between Gantt bars. Support for:
- Finish-to-Start (FS)
- Start-to-Start (SS)
- Finish-to-Finish (FF)
- Start-to-Finish (SF)

### Critical Path
Automatic highlighting of the longest dependency chain — the sequence of tasks that determines the project's minimum duration.

## Core Features

### File-Based Storage
- Save/load project files (`.gantt.json`) using the browser File System Access API
- Open recent files
- Auto-save with undo history
- Human-readable JSON format — version control friendly

### Interactive Gantt Chart
- Drag to move tasks along the timeline
- Drag edges to resize duration
- Click-and-drag to draw dependency arrows
- Zoom: day / week / month / quarter views
- Today marker
- Scroll synced with the task tree

### Epic Sub-Gantt
- Click an epic in the tree to scope the Gantt to that epic
- Breadcrumb navigation: Project > Epic > ...
- Epic summary bars show aggregate progress on the project-level view

### Task Details (Pane Three)
- Markdown-rendered description
- Editable metadata: dates, duration, progress slider, dependency list
- Clean, readable layout

### Dark Theme
- Dark theme only. No light mode toggle.
- High contrast, easy on the eyes for long sessions
- Carefully chosen colors for Gantt bars, dependencies, and critical path

### Keyboard Shortcuts
- Arrow keys to navigate the task tree
- Enter to edit selected task
- Delete to remove
- Ctrl+S to save
- Ctrl+Z / Ctrl+Shift+Z for undo/redo

### Export
- PNG / SVG export of the Gantt chart
- CSV export of task data
- PDF export for printing

## Tech Stack

- **SvelteKit** — app framework
- **shadcn-svelte** — UI components (resizable panes, buttons, inputs, dialogs, etc.)
- **Tailwind CSS** — styling, dark theme
- **TypeScript** — type safety throughout
- **File System Access API** — local file read/write
- **Canvas or SVG** — Gantt chart rendering

## Design Principles

1. **Local first.** Your data stays on your machine. No accounts, no sync, no cloud.
2. **Fast.** Instant load, smooth interactions, no spinners.
3. **Beautiful.** Modern dark UI that you actually want to look at.
4. **Simple.** Do Gantt charts well. Don't try to be Jira.
5. **File-friendly.** JSON files you can commit to git, diff, and back up.
