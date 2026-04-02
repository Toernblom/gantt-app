import type { Project, GanttNode } from '$lib/types';
import type { PriorityItem } from '../priority/priorityStore.svelte.js';
import { computeProgress } from '../gantt/helpers.js';

interface LlmTask {
  name: string;
  progress: number;
  startDate: string;
  endDate: string;
  description?: string;
  isMilestone?: true;
  dependencies?: string[];
  todos?: { text: string; done: boolean }[];
  children?: LlmTask[];
}

interface LlmUpNextItem {
  name: string;
  progress: number;
  reason: string;
  blockedBy?: string[];
  unblocksCount?: number;
}

interface LlmExport {
  _comment: string;
  name: string;
  description?: string;
  upNext: LlmUpNextItem[];
  blocked: LlmUpNextItem[];
  tasks: LlmTask[];
}

function effectiveProgress(node: GanttNode): number {
  if (node.children.length > 0) return computeProgress(node);
  if (node.todos && node.todos.length > 0) {
    const done = node.todos.filter(t => t.done).length;
    return Math.round((done / node.todos.length) * 100);
  }
  return node.progress;
}

function buildLlmTask(node: GanttNode, allNodes: GanttNode[]): LlmTask {
  const task: LlmTask = {
    name: node.name,
    progress: effectiveProgress(node),
    startDate: node.startDate,
    endDate: node.endDate,
  };
  if (node.description) task.description = node.description;
  if (node.isMilestone) task.isMilestone = true;
  if (node.dependencies.length > 0) {
    task.dependencies = node.dependencies.map(d => d.targetName ?? d.targetId);
  }
  if (node.todos.length > 0) {
    task.todos = node.todos.map(t => ({ text: t.text, done: t.done }));
  }
  if (node.children.length > 0) {
    task.children = node.children.map(c => buildLlmTask(c, allNodes));
  }
  return task;
}

function buildUpNextItem(item: PriorityItem): LlmUpNextItem {
  const entry: LlmUpNextItem = {
    name: item.task.name,
    progress: item.progress,
    reason: item.reason,
  };
  if (item.blockedBy.length > 0) entry.blockedBy = item.blockedBy;
  if (item.unblocksCount > 0) entry.unblocksCount = item.unblocksCount;
  return entry;
}

export function buildLlmExport(
  project: Project,
  readyItems: PriorityItem[],
  blockedItems: PriorityItem[],
): LlmExport {
  const allNodes: GanttNode[] = [];
  const collect = (nodes: GanttNode[]) => {
    for (const n of nodes) { allNodes.push(n); collect(n.children); }
  };
  collect(project.children);

  const result: LlmExport = {
    _comment: 'READ-ONLY. Auto-generated from project.json. Edit project.json to make changes.',
    name: project.name,
    tasks: project.children.map(c => buildLlmTask(c, allNodes)),
    upNext: readyItems.map(buildUpNextItem),
    blocked: blockedItems.map(buildUpNextItem),
  };
  if (project.description) result.description = project.description;
  return result;
}
