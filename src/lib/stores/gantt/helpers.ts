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
 * Recursively compute progress for parent nodes from their children.
 * Weighted average by duration (in days). Leaf nodes keep their manual progress.
 * Returns the computed progress for the given node.
 */
export function computeProgress(node: GanttNode): number {
  if (node.children.length === 0) return node.progress;

  let totalWeight = 0;
  let weightedSum = 0;
  for (const child of node.children) {
    const childProgress = computeProgress(child);
    const start = new Date(child.startDate).getTime();
    const end = new Date(child.endDate).getTime();
    const days = Math.max(1, Math.round((end - start) / 86_400_000) + 1);
    weightedSum += childProgress * days;
    totalWeight += days;
  }
  return totalWeight > 0 ? Math.round(weightedSum / totalWeight) : 0;
}

/**
 * Compute the critical path: the longest chain of FS-dependent tasks
 * that determines the project's minimum duration.
 * Returns a Set of task IDs on the critical path.
 */
export function computeCriticalPath(nodes: GanttNode[]): Set<string> {
  // Collect all nodes recursively
  const allNodes: GanttNode[] = [];
  const collect = (list: GanttNode[]) => {
    for (const n of list) {
      allNodes.push(n);
      collect(n.children);
    }
  };
  collect(nodes);

  const nodeMap = new Map(allNodes.map(n => [n.id, n]));

  // For each node, compute the longest path FROM it to the end of the project.
  // Use memoized DFS. "Length" = sum of durations along the chain.
  const memo = new Map<string, { length: number; path: string[] }>();

  function longestFrom(id: string): { length: number; path: string[] } {
    if (memo.has(id)) return memo.get(id)!;
    const node = nodeMap.get(id);
    if (!node) { memo.set(id, { length: 0, path: [] }); return memo.get(id)!; }

    const start = new Date(node.startDate).getTime();
    const end = new Date(node.endDate).getTime();
    const duration = Math.max(1, Math.round((end - start) / 86_400_000) + 1);

    // Find all tasks that depend on this one (this node is their prerequisite)
    const dependents = allNodes.filter(n =>
      n.dependencies.some(d => d.targetId === id && d.type === 'FS')
    );

    if (dependents.length === 0) {
      const result = { length: duration, path: [id] };
      memo.set(id, result);
      return result;
    }

    let best = { length: 0, path: [] as string[] };
    for (const dep of dependents) {
      const sub = longestFrom(dep.id);
      if (sub.length > best.length) best = sub;
    }

    const result = { length: duration + best.length, path: [id, ...best.path] };
    memo.set(id, result);
    return result;
  }

  // Find the global longest path starting from any node
  let globalBest = { length: 0, path: [] as string[] };
  for (const node of allNodes) {
    // Only start from nodes with no FS prerequisites (entry points)
    const hasPrereqs = node.dependencies.some(d => d.type === 'FS');
    if (!hasPrereqs) {
      const result = longestFrom(node.id);
      if (result.length > globalBest.length) globalBest = result;
    }
  }

  return new Set(globalBest.path);
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
