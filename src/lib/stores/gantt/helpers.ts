import type { GanttNode, GanttRow, Dependency } from '$lib/types';

export function flattenNodes(nodes: GanttNode[], baseLevel = 0): GanttRow[] {
  const rows: GanttRow[] = [];
  for (const node of nodes) {
    rows.push({
      id: node.id,
      name: node.name,
      level: baseLevel,
      startDate: node.startDate,
      endDate: node.endDate,
      progress: node.progress,
      color: node.color,
      isMilestone: node.isMilestone,
      hasChildren: node.children.length > 0,
      expanded: node.expanded,
      dependencies: node.dependencies,
    });
    if (node.expanded && node.children.length > 0) {
      rows.push(...flattenNodes(node.children, baseLevel + 1));
    }
  }
  return rows;
}

export function computeDateRange(rows: GanttRow[]): [string, string] {
  if (rows.length === 0) {
    const today = new Date().toISOString().slice(0, 10);
    return [today, today];
  }
  let earliest = rows[0].startDate;
  let latest = rows[0].endDate;
  for (const row of rows) {
    if (row.startDate < earliest) earliest = row.startDate;
    if (row.endDate > latest) latest = row.endDate;
  }
  return [earliest, latest];
}

export function findNodeById(nodes: GanttNode[], id: string): GanttNode | null {
  for (const node of nodes) {
    if (node.id === id) return node;
    const found = findNodeById(node.children, id);
    if (found) return found;
  }
  return null;
}

export function deleteNodeById(nodes: GanttNode[], id: string): boolean {
  for (let i = 0; i < nodes.length; i++) {
    if (nodes[i].id === id) {
      nodes.splice(i, 1);
      return true;
    }
    if (deleteNodeById(nodes[i].children, id)) return true;
  }
  return false;
}

export function cleanDependencies(nodes: GanttNode[], deletedId: string): void {
  for (const node of nodes) {
    node.dependencies = node.dependencies.filter((d: Dependency) => d.targetId !== deletedId);
    cleanDependencies(node.children, deletedId);
  }
}

/**
 * Find the top-level ancestor node that contains a target node.
 * Returns the target itself if it's a top-level node.
 */
export function findAncestor(nodes: GanttNode[], targetId: string): GanttNode | null {
  for (const node of nodes) {
    if (node.id === targetId) return node;
    const found = findNodeById(node.children, targetId);
    if (found) return node;
  }
  return null;
}

/**
 * Compute tree guide context for each row.
 * guides: boolean[] — one per level (0..level-1), true if vertical guide line continues.
 * isLast: whether this row is the last child of its parent.
 */
export function computeRowContexts(rows: GanttRow[]): { guides: boolean[]; isLast: boolean }[] {
  const result: { guides: boolean[]; isLast: boolean }[] = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const guides: boolean[] = [];
    for (let lvl = 0; lvl < row.level; lvl++) {
      let hasMoreAtLevel = false;
      for (let j = i + 1; j < rows.length; j++) {
        if (rows[j].level < lvl) break;
        if (rows[j].level === lvl) { hasMoreAtLevel = true; break; }
      }
      if (lvl === 0) {
        hasMoreAtLevel = false;
        for (let j = i + 1; j < rows.length; j++) {
          if (rows[j].level === 0) { hasMoreAtLevel = true; break; }
        }
      }
      guides.push(hasMoreAtLevel);
    }
    let isLast = true;
    for (let j = i + 1; j < rows.length; j++) {
      if (rows[j].level < row.level) break;
      if (rows[j].level === row.level) { isLast = false; break; }
    }
    result.push({ guides, isLast });
  }
  return result;
}

/**
 * Build dependency pairs from flattened rows.
 * Each row's dependencies list prerequisites (targetId = prerequisite).
 * Returns pairs going FROM prerequisite TO dependent.
 */
export function computeDependencyPairs(
  rows: GanttRow[],
): { key: string; source: GanttRow; sourceIndex: number; target: GanttRow; targetIndex: number; type: import('$lib/types').DependencyType }[] {
  const indexById = new Map<string, number>(rows.map((r, i) => [r.id, i]));
  const pairs: { key: string; source: GanttRow; sourceIndex: number; target: GanttRow; targetIndex: number; type: import('$lib/types').DependencyType }[] = [];
  for (let depIdx = 0; depIdx < rows.length; depIdx++) {
    const dependentRow = rows[depIdx];
    for (const dep of dependentRow.dependencies) {
      const prereqIdx = indexById.get(dep.targetId);
      if (prereqIdx === undefined) continue;
      const prereqRow = rows[prereqIdx];
      pairs.push({
        key: `${prereqRow.id}-${dependentRow.id}-${dep.type}`,
        source: prereqRow,
        sourceIndex: prereqIdx,
        target: dependentRow,
        targetIndex: depIdx,
        type: dep.type,
      });
    }
  }
  return pairs;
}
