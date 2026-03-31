import { projectStore } from '../project/index.js';
import { findNodeById } from '../gantt/helpers.js';
import type { GanttNode } from '$lib/types';

export interface PriorityItem {
  task: GanttNode;
  progress: number;         // effective progress (todo-based or manual)
  score: number;
  ready: boolean;
  blockedBy: string[];      // names of incomplete dependency tasks
  unblocksCount: number;
  reason: string;           // human-readable explanation
}

class PriorityStore {
  items = $derived.by<PriorityItem[]>(() => {
    const allNodes = this._collectAll(projectStore.project.children);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Pre-compute: for each task id, how many other tasks depend on it
    const unblocksMap = new Map<string, number>();
    for (const node of allNodes) {
      for (const dep of node.dependencies) {
        unblocksMap.set(dep.targetId, (unblocksMap.get(dep.targetId) ?? 0) + 1);
      }
    }

    const items: PriorityItem[] = [];

    for (const task of allNodes) {
      // Effective progress: from todos if present, otherwise manual
      const progress = (task.todos && task.todos.length > 0)
        ? Math.round(task.todos.filter(t => t.done).length / task.todos.length * 100)
        : task.progress;

      // Skip completed and milestones
      if (progress >= 100) continue;
      if (task.isMilestone) continue;
      // Skip parent/epic nodes (nodes with children) — focus on leaf work
      if (task.children.length > 0) continue;

      let score = 0;
      const reasons: string[] = [];

      // Check dependency readiness — own deps + inherited strict deps from ancestors
      const blockedBy: string[] = [];
      // Own dependencies
      for (const dep of task.dependencies) {
        const target = findNodeById(projectStore.project.children, dep.targetId);
        if (target && this._effectiveProgress(target) < 100) {
          blockedBy.push(target.name);
        }
      }
      // Inherited: walk up ancestors — if any ancestor has requireDepsComplete,
      // check that ancestor's prerequisites are all 100%
      const ancestors = this._getAncestors(task.id, projectStore.project.children);
      for (const ancestor of ancestors) {
        if (!ancestor.requireDepsComplete) continue;
        for (const dep of ancestor.dependencies) {
          const target = findNodeById(projectStore.project.children, dep.targetId);
          if (target && this._effectiveProgress(target) < 100 && !blockedBy.includes(target.name)) {
            blockedBy.push(target.name);
          }
        }
      }
      const ready = blockedBy.length === 0;
      if (!ready) {
        score -= 1000;
        reasons.push(`Blocked by ${blockedBy.length} task${blockedBy.length > 1 ? 's' : ''}`);
      }

      // In-progress bonus
      if (progress > 0) {
        score += 25;
        reasons.push(`${progress}% done`);
      }

      // Downstream impact
      const unblocksCount = unblocksMap.get(task.id) ?? 0;
      if (unblocksCount > 0) {
        score += unblocksCount * 10;
        reasons.push(`Unblocks ${unblocksCount} task${unblocksCount > 1 ? 's' : ''}`);
      }

      // Timeline urgency
      const start = new Date(task.startDate);
      start.setHours(0, 0, 0, 0);
      const daysUntil = Math.round((start.getTime() - today.getTime()) / 86_400_000);
      if (daysUntil <= 0) {
        score += 30;
        if (daysUntil < 0) reasons.push(`Started ${-daysUntil}d ago`);
        else reasons.push('Starts today');
      } else if (daysUntil <= 7) {
        score += 15;
        reasons.push(`Starts in ${daysUntil}d`);
      }

      // Incomplete todos
      const incompleteTodos = task.todos.filter(t => !t.done).length;
      if (incompleteTodos > 0) {
        score += 5;
        reasons.push(`${incompleteTodos} todo${incompleteTodos > 1 ? 's' : ''} left`);
      }

      // Fallback reason
      if (reasons.length === 0 && ready) {
        reasons.push('Ready to start');
      }

      items.push({
        task,
        progress,
        score,
        ready,
        blockedBy,
        unblocksCount,
        reason: reasons[0] ?? '',
      });
    }

    // Sort: highest score first
    items.sort((a, b) => b.score - a.score);
    return items;
  });

  // Split for rendering convenience
  readyItems = $derived(this.items.filter(i => i.ready));
  blockedItems = $derived(this.items.filter(i => !i.ready));

  /** Get effective progress for a node (todo-based for leaves with todos, manual otherwise, recursive for parents). */
  private _effectiveProgress(node: GanttNode): number {
    if (node.children.length > 0) {
      // Parent: check if all children are effectively done
      const childProgresses = node.children.map(c => this._effectiveProgress(c));
      const total = childProgresses.reduce((a, b) => a + b, 0);
      return Math.round(total / node.children.length);
    }
    if (node.todos && node.todos.length > 0) {
      return Math.round(node.todos.filter(t => t.done).length / node.todos.length * 100);
    }
    return node.progress;
  }

  /** Walk the tree to find all ancestors of a target node (parent, grandparent, etc.). */
  private _getAncestors(targetId: string, roots: GanttNode[]): GanttNode[] {
    const path: GanttNode[] = [];
    const find = (nodes: GanttNode[], trail: GanttNode[]): boolean => {
      for (const node of nodes) {
        if (node.id === targetId) { path.push(...trail); return true; }
        if (node.children.length > 0 && find(node.children, [...trail, node])) return true;
      }
      return false;
    };
    find(roots, []);
    return path;
  }

  private _collectAll(nodes: GanttNode[]): GanttNode[] {
    const result: GanttNode[] = [];
    for (const node of nodes) {
      result.push(node);
      if (node.children.length > 0) {
        result.push(...this._collectAll(node.children));
      }
    }
    return result;
  }
}

export const priorityStore = new PriorityStore();
