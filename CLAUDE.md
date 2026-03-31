# Gantt App

Modern, local-first Gantt chart project management tool. No cloud, no subscriptions — files on your PC. See `VISION.md` for full product vision.

## System Reference

**Read `docs/system-index.md` before making changes.** It documents every system, file, store, component, and how they interact. It includes architecture diagrams, data flow, interaction walkthroughs (selection, drill-down, drag, zoom, task creation, project switching), and all naming/styling conventions.

## Key Rules

- **All business logic lives in stores** (`src/lib/stores/`), never in `.svelte` components. Components are presentation-only — they read store state and call store methods. See the BLoC/Cubit pattern section in the system index.
- **Exception:** Per-instance SVG drag/resize state stays local in `gantt-bar.svelte` and `gantt-milestone.svelte`.
- **Store dependency order:** `projectStore` -> `ganttStore` -> `timelineStore` / `dialogStore`. No circular dependencies.
- **Don't modify `src/lib/components/ui/`** — these are shadcn-svelte generated primitives.
- **Theming:** Light/dark/system via `mode-watcher`. Default is dark. Toggle lives in the sidebar footer.

## Commands

```bash
npm run dev       # Start dev server
npm run build     # Production build
npm run check     # TypeScript + Svelte type checking
npm run preview   # Preview production build
```

## Tech Stack

SvelteKit 2, Svelte 5 (runes), TypeScript (strict), Tailwind CSS 4, shadcn-svelte, d3-scale, paneforge (resizable panes).
