import type { GanttNode, GanttRow, ZoomLevel, ZoomConfig } from '$lib/types';
import { ZOOM_CONFIGS } from '$lib/types';
import { projectStore } from '../project/index.js';
import { persistenceStore } from '../persistence/index.js';
import { historyStore } from '../history/index.js';
import { interactionStore } from '../interaction/interactionStore.svelte.js';
import type { RecentEntry } from '../persistence/index.js';
import {
  flattenNodes,
  computeDateRange,
  findNodeById,
  deleteNodeById,
  cleanDependencies,
  findAncestor,
  computeRowContexts,
  computeDependencyPairs,
  computeProgress,
  computeCriticalPath,
} from './helpers.js';
import type { BreadcrumbEntry, RowContext, DependencyPair, ResolvedDependency } from './models.js';
import { isTauri } from '../persistence/isTauri.js';

class GanttStore {
  // --- Core state ---
  focusPath = $state<string[]>([]);
  zoomLevel = $state<ZoomLevel>('week');
  selectedTaskId = $state<string | null>(null);
  hoveredTaskId = $state<string | null>(null);
  viewMode = $state<'gantt' | 'kanban'>(
    (typeof sessionStorage !== 'undefined' && sessionStorage.getItem('gantt-viewMode') as 'gantt' | 'kanban') || 'gantt'
  );
  uiScale = $state<number>(
    (typeof sessionStorage !== 'undefined' && parseFloat(sessionStorage.getItem('gantt-uiScale') ?? '')) || 1
  );

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

  // Effective color: node's own color → ancestor color → fallback blue
  selectedColor = $derived<string>(
    this.selectedTask?.color
      ? this.selectedTask.color
      : this.selectedEpic?.color ?? '#3b82f6',
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

  // --- Derived: critical path ---
  criticalPath = $derived<Set<string>>(computeCriticalPath(projectStore.project.children));

  // --- Derived: has tasks ---
  hasTasks = $derived(this.rows.length > 0);

  // --- Derived: parent progress ---
  /**
   * Map of node id → auto-calculated progress for parent nodes.
   * Leaf nodes keep their manual progress; parents aggregate from children.
   * Components should read from this for display rather than node.progress for parents.
   */
  autoProgress = $derived.by<Map<string, number>>(() => {
    const map = new Map<string, number>();
    const walk = (nodes: GanttNode[]) => {
      for (const node of nodes) {
        // Parents: always auto from children
        if (node.children.length > 0) {
          map.set(node.id, computeProgress(node));
        }
        // Leaves with todos: auto from todo completion
        else if (node.todos && node.todos.length > 0) {
          const done = node.todos.filter(t => t.done).length;
          map.set(node.id, Math.round((done / node.todos.length) * 100));
        }
        walk(node.children);
      }
    };
    walk(projectStore.project.children);
    return map;
  });

  /** Get the effective progress for any node. Auto if it has children or todos, manual otherwise. */
  getEffectiveProgress(id: string): number {
    return this.autoProgress.get(id) ?? (this.getNodeById(id)?.progress ?? 0);
  }

  /** Whether a node's progress is auto-calculated (has children or has todos). */
  isAutoProgress(id: string): boolean {
    return this.autoProgress.has(id);
  }

  // --- Methods: task tree ---
  toggleExpand(id: string): void {
    const node = findNodeById(projectStore.project.children, id);
    if (node) node.expanded = !node.expanded;
    this._triggerSave();
  }

  selectTask(id: string | null): void {
    if (id) {
      // Expand all ancestors so the task is visible in the row list
      this._expandAncestors(id);
      interactionStore.clearDependencySelection();
    }
    this.selectedTaskId = id;
  }

  /** Walk the tree to find the path to a node, and expand every ancestor along the way. */
  private _expandAncestors(targetId: string): void {
    const path: GanttNode[] = [];
    const find = (nodes: GanttNode[], trail: GanttNode[]): boolean => {
      for (const node of nodes) {
        if (node.id === targetId) {
          path.push(...trail);
          return true;
        }
        if (node.children.length > 0 && find(node.children, [...trail, node])) {
          return true;
        }
      }
      return false;
    };
    find(this.displayChildren, []);
    for (const ancestor of path) {
      if (!ancestor.expanded) ancestor.expanded = true;
    }
  }

  setZoom(level: ZoomLevel): void {
    this.zoomLevel = level;
  }

  updateTask(id: string, updates: Partial<GanttNode>): void {
    const node = findNodeById(projectStore.project.children, id);
    if (node) Object.assign(node, updates);
    this._triggerSave();
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
    this._triggerSave();
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
    this._triggerSave();
  }

  getNodeById(id: string): GanttNode | null {
    return findNodeById(projectStore.project.children, id);
  }

  addDependency(taskId: string, targetId: string, type: import('$lib/types').DependencyType = 'FS'): void {
    const node = findNodeById(projectStore.project.children, taskId);
    if (!node) return;
    // Don't add duplicate
    if (node.dependencies.some(d => d.targetId === targetId)) return;
    node.dependencies.push({ targetId, type, lag: 0 });
    this._triggerSave();
  }

  removeDependency(taskId: string, targetId: string): void {
    const node = findNodeById(projectStore.project.children, taskId);
    if (!node) return;
    node.dependencies = node.dependencies.filter(d => d.targetId !== targetId);
    this._triggerSave();
  }

  // --- Methods: view mode ---
  setViewMode(mode: 'gantt' | 'kanban'): void {
    this.viewMode = mode;
    if (typeof sessionStorage !== 'undefined') sessionStorage.setItem('gantt-viewMode', mode);
  }

  setUiScale(scale: number): void {
    this.uiScale = Math.round(Math.max(0.5, Math.min(2, scale)) * 100) / 100;
    if (typeof sessionStorage !== 'undefined') sessionStorage.setItem('gantt-uiScale', String(this.uiScale));
  }

  resetUiScale(): void {
    this.setUiScale(1);
  }

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

  // --- Methods: navigation ---
  drillInto(id: string): void {
    this.focusPath = [...this.focusPath, id];
    this.selectedTaskId = null;
  }

  navigateTo(depth: number): void {
    this.focusPath = this.focusPath.slice(0, depth);
    this.selectedTaskId = null;
  }

  // --- Methods: project persistence ---
  async openFolder(): Promise<void> {
    const project = await persistenceStore.openFolder();
    if (project) {
      projectStore.loadProject(project);
      historyStore.clear();
      this.focusPath = [];
      this.selectedTaskId = null;
      this.hoveredTaskId = null;
    }
  }

  async openRecent(entry: RecentEntry): Promise<void> {
    const project = await persistenceStore.openRecent(entry);
    if (project) {
      projectStore.loadProject(project);
      historyStore.clear();
      this.focusPath = [];
      this.selectedTaskId = null;
      this.hoveredTaskId = null;
    }
  }

  async createProjectFolder(): Promise<void> {
    const project = await persistenceStore.createInFolder();
    if (project) {
      projectStore.loadProject(project);
      historyStore.clear();
      this.focusPath = [];
      this.selectedTaskId = null;
      this.hoveredTaskId = null;
    }
  }

  // --- Methods: keyboard navigation (from gantt-chart.svelte) ---
  handleKeyDown(e: KeyboardEvent): void {
    // Ctrl+Z / Ctrl+Shift+Z: undo / redo
    if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
      e.preventDefault();
      if (e.shiftKey) this.redo();
      else this.undo();
      return;
    }

    // Ctrl+0: reset UI scale
    if ((e.ctrlKey || e.metaKey) && e.key === '0') {
      e.preventDefault();
      this.resetUiScale();
      return;
    }

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
        e.preventDefault();
        // Delete selected dependency first, then selected task
        if (interactionStore.selectedDep) {
          interactionStore.deleteSelectedDependency();
        } else if (currentId) {
          this.deleteTask(currentId);
        }
        break;
      }
    }
  }

  // --- Methods: undo/redo ---
  undo(): void {
    historyStore.undo();
    this._triggerSaveWithoutSnapshot();
  }

  redo(): void {
    historyStore.redo();
    this._triggerSaveWithoutSnapshot();
  }

  // --- Private: auto-save ---
  private _triggerSave(): void {
    historyStore.snapshot();
    persistenceStore.scheduleSave(projectStore.project);
  }

  private _triggerSaveWithoutSnapshot(): void {
    persistenceStore.scheduleSave(projectStore.project);
  }
}

export const ganttStore = new GanttStore();

// Load recent projects on startup, auto-open the first one, and wire external reload
if (typeof window !== 'undefined') {
  // Wire up external file change handler (Tauri only, but safe to set always)
  persistenceStore.onExternalChange = (project) => {
    projectStore.loadProject(project);
  };

  if (isTauri) {
    persistenceStore.loadRecents().then(() => {
      const recents = persistenceStore.recentProjects;
      if (recents.length > 0) {
        ganttStore.openRecent(recents[0]);
      }
    });
  }
}
