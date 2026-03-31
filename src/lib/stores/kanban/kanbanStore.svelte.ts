import { projectStore } from '../project/index.js';
import { ganttStore } from '../gantt/index.js';
import type { GanttNode, KanbanColumn } from '$lib/types';
import { findNodeById } from '../gantt/helpers.js';

class KanbanStore {
  // --- Derived: current project's columns ---
  columns = $derived<KanbanColumn[]>(projectStore.project.kanbanColumns ?? [{ id: 'backlog', name: 'Backlog' }]);

  // --- Derived: tasks grouped by column ---
  // Uses ganttStore.displayChildren to respect drill-down (same tasks shown in gantt view).
  // Flattens all visible tasks (non-recursive — only the direct display children and their children one level).
  columnTasks = $derived.by<Map<string, GanttNode[]>>(() => {
    const map = new Map<string, GanttNode[]>();
    // Initialize all columns (even empty ones show)
    for (const col of this.columns) {
      map.set(col.id, []);
    }
    // Collect all leaf tasks from displayChildren tree (recursively)
    const allTasks = this._collectAllNodes(ganttStore.displayChildren);
    for (const task of allTasks) {
      const colId = task.kanbanColumnId || 'backlog';
      const list = map.get(colId);
      if (list) {
        list.push(task);
      } else {
        // Task references a column that doesn't exist — put in backlog
        const backlog = map.get('backlog');
        if (backlog) backlog.push(task);
      }
    }
    return map;
  });

  // --- Drag state ---
  draggedTaskId = $state<string | null>(null);

  // --- Methods: column management ---
  addColumn(name: string): void {
    const id = `col-${Date.now()}`;
    projectStore.project.kanbanColumns.push({ id, name });
    ganttStore['_triggerSave']();
  }

  removeColumn(columnId: string): void {
    if (columnId === 'backlog') return; // Can't remove backlog
    const cols = projectStore.project.kanbanColumns;
    const idx = cols.findIndex(c => c.id === columnId);
    if (idx === -1) return;
    // Move all tasks in this column back to backlog
    const allTasks = this._collectAllNodes(projectStore.project.children);
    for (const task of allTasks) {
      if (task.kanbanColumnId === columnId) {
        task.kanbanColumnId = 'backlog';
      }
    }
    cols.splice(idx, 1);
    ganttStore['_triggerSave']();
  }

  renameColumn(columnId: string, name: string): void {
    const col = projectStore.project.kanbanColumns.find(c => c.id === columnId);
    if (col) col.name = name;
    ganttStore['_triggerSave']();
  }

  reorderColumns(orderedIds: string[]): void {
    const lookup = new Map(projectStore.project.kanbanColumns.map(c => [c.id, c]));
    const reordered: KanbanColumn[] = [];
    for (const id of orderedIds) {
      const col = lookup.get(id);
      if (col) reordered.push(col);
    }
    projectStore.project.kanbanColumns.splice(0, projectStore.project.kanbanColumns.length, ...reordered);
    ganttStore['_triggerSave']();
  }

  // --- Methods: task movement ---
  moveTask(taskId: string, targetColumnId: string): void {
    const node = findNodeById(projectStore.project.children, taskId);
    if (!node) return;
    node.kanbanColumnId = targetColumnId;
    ganttStore['_triggerSave']();
  }

  // --- Methods: drag ---
  startDrag(taskId: string): void {
    this.draggedTaskId = taskId;
  }

  endDrag(): void {
    this.draggedTaskId = null;
  }

  // --- Private helpers ---
  private _collectAllNodes(nodes: GanttNode[]): GanttNode[] {
    const result: GanttNode[] = [];
    for (const node of nodes) {
      result.push(node);
      if (node.children.length > 0) {
        result.push(...this._collectAllNodes(node.children));
      }
    }
    return result;
  }
}

export const kanbanStore = new KanbanStore();
