# Changelog

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
