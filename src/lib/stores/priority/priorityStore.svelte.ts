import { projectStore } from '../project/index.js';
import { findNodeById } from '../gantt/helpers.js';
import type { GanttNode } from '$lib/types';

export interface PriorityItem {
  task: GanttNode;
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
      // Skip completed and milestones
      if (task.progress >= 100) continue;
      if (task.isMilestone) continue;
      // Skip parent/epic nodes (nodes with children) — focus on leaf work
      if (task.children.length > 0) continue;

      let score = 0;
      const reasons: string[] = [];

      // Check dependency readiness
      const blockedBy: string[] = [];
      for (const dep of task.dependencies) {
        const target = findNodeById(projectStore.project.children, dep.targetId);
        if (target && target.progress < 100) {
          blockedBy.push(target.name);
        }
      }
      const ready = blockedBy.length === 0;
      if (!ready) {
        score -= 1000;
        reasons.push(`Blocked by ${blockedBy.length} task${blockedBy.length > 1 ? 's' : ''}`);
      }

      // In-progress bonus
      if (task.progress > 0) {
        score += 25;
        reasons.push(`${task.progress}% done — finish it`);
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
