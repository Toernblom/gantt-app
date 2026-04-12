# Changelog

## 0.1.25

- New CLI tool for querying and mutating `project.json` from the terminal — designed for LLM agents but works for humans too
- Commands: `list`, `show`, `up-next`, `add task`, `update`, `delete`, `add-todo`, `toggle-todo`, `remove-todo`, `move-todo`, `add-dep`, `remove-dep`
- Task references accept name (fuzzy substring match) or ID prefix — LLMs don't need to carry full IDs
- Auto-discovers project by walking up from CWD for `.ganttapp` marker; `--project <path>` overrides
- Atomic writes (temp + rename) and auto-regenerates `project_llm.json` after every mutation
- Bundled with the Tauri release via esbuild — auto-updates alongside the app
- Dev usage: `npm run gantt -- <command>` or `ganttapp <command>` after `npm link`
- Creating tasks in overview zoom mode now auto-places them at the viewport center with a 7-day duration and hides the date pickers

## 0.1.24

- Fixed file watcher missing external edits to `project.json` on Windows when an LLM/editor saved atomically (temp-file + rename) — the view now refreshes automatically instead of requiring F5
- Root cause: watching the file directly made `notify-rs` lose its handle when the inode was swapped by the rename; now watching the parent directory and filtering events by filename
- Also accept `create` events in addition to `modify`, so atomic rewrites that surface as a new file are picked up

## 0.1.23

- New "Hide from Up Next" toggle on epic tasks (Details tab → Properties): hides the whole subtree (sub-tasks + todos) from the Up Next panel in one click
- Useful for parking epics you're not ready to work on without having to tweak progress or dependencies

## 0.1.22

- Left-clicking a task no longer animates the view towards it — felt jarring during normal selection
- Fuzzy search (Ctrl+K), "Up Next" clicks, and keyboard arrow navigation still animate-scroll to the task as before
- `project_llm.json` now starts with an `_comment` field marking it as auto-generated so users know not to edit it by hand

## 0.1.21

- Right-click and drag to pan the Gantt chart (both axes)
- Context menu suppressed on the chart area to enable panning

## 0.1.20

- Fixed recent projects not being saved (APPDATA directory wasn't being created before write)

## 0.1.19

- Fixed "forbidden path" error on Windows when opening or creating projects
- Root cause: Tauri v2 requires both `$APPDATA` and `$APPDATA/**` in scope (directory itself + contents); bare `**` doesn't match absolute Windows paths
- Added `fs:scope-appdata-recursive` base scope and explicit `$APPDATA` entries to all FS permissions
- Recent-projects storage now uses `BaseDirectory.AppData` instead of resolving absolute paths
- Recents save errors no longer block project loading (misleading "Failed to read project" error)

## 0.1.18

## 0.1.17

- Fixed save-then-revert bug: typing in description or resizing task bars no longer reverts to stale data
- Root cause: file watcher detected our own disk writes as "external changes" and reloaded old state mid-edit
- File watcher now skips events when a save is pending or in progress

## 0.1.16

- Drag-to-reorder tasks in the sidebar via grip handle (hover left edge of any row)
- Three-zone drop: top/bottom of row = sibling insert, middle = reparent as child
- Cross-parent reparenting: drag tasks between different phases/epics
- Circular drop prevention (can't drop a parent into its own subtree)
- Auto-expands target parent on drop
- Zoom level and view mode now persist across app restarts (switched from sessionStorage to localStorage)
- Fixed undo reliability: `_skipNextSnapshot` flag no longer poisons subsequent snapshots after undo/redo

## 0.1.15

- Completion banner: small pennant flag on parent task bars when all subtasks are done
- Long-press "Check for Updates" button to view the current version's changelog

## 0.1.14

- LLM project export: auto-generates `project_llm.json` alongside `project.json` on every save — lean, ID-free view with Up Next and Blocked sections
- LLM export uses effective progress (todo-based) instead of raw stored value
- LLM export includes read-only comment directing edits to `project.json`
- Zoom level now persists across page loads (saved to sessionStorage)
- Fixed scroll-to-center firing when dragging/repositioning an already-selected task
- Fixed HMR reload loop caused by `project_llm.json` writes in dev mode

## 0.1.13

- Overview zoom mode: new tab next to Day/Week/Month/Qtr with blank headers for a clean, date-free visual roadmap

## 0.1.12

- Multi-select: Ctrl+click to toggle tasks, or drag-select on empty timeline space to box-select
- Multi-drag: drag any selected bar to move all selected tasks together with ghost previews
- Dragging a collapsed epic now moves all subtasks with it
- Double-click todo text to edit inline (Enter to save, Escape to cancel)
- Fixed undo for tree moves (snapshot now captured before mutation)

## 0.1.11

- Fixed task selection not working in Tauri builds (circular chunk dependencies broke store initialization)
- Dependency linking now uses long-press (500ms hold + drag) instead of Shift+click
- Click dependency arrows to select them, press Delete to remove
- Auto-progress from todos: leaf tasks with todos calculate progress from completion ratio
- Strict sequencing toggle: hide tasks from Up Next until all predecessors reach 100%
- Parent/epic todo tab now shows aggregated todos from all children
- Task create dialog shows full nested tree for parent selection
- Command palette re-triggers scroll-to-center when selecting a task
- Kanban cards show effective progress (todo-based when applicable)
- Critical path now only includes leaf tasks, not parent/epic containers

## 0.1.10

- Faster CI builds (cached Rust compilation)
- Browser fallback for local development (npm run dev)

## 0.1.9

- "What's New" dialog now works on consecutive updates
- Faster CI builds with stabilized Rust cache

## 0.1.8

- Fixed "What's New" dialog not appearing after update
- Changelog now fetched from GitHub release notes
- Version change detection works reliably across reinstalls

## 0.1.7

- Added "What's New" dialog after auto-update
- Added "Check for Updates" button in sidebar
- Fixed file system permissions for project read/write
- Enabled DevTools in release builds (F12)

## 0.1.3

- Ported app to Tauri for native Windows desktop
- File watcher for bi-directional sync (edit JSON externally, UI updates instantly)
- Auto-updater with GitHub Releases
- Recent projects stored locally

## 0.1.0

- Initial release
- Gantt chart with drag, resize, zoom, dependencies
- Kanban board view
- Undo/redo, critical path, search
- Local-first file persistence
