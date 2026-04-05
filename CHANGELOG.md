# Changelog

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
