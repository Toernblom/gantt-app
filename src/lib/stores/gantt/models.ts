import type { GanttRow, DependencyType } from '$lib/types';

export type { GanttNode, GanttRow, ZoomLevel, Dependency, ZoomConfig } from '$lib/types';

export interface BreadcrumbEntry {
  id: string | null;
  name: string;
  depth: number;
}

export interface RowContext {
  guides: boolean[];
  isLast: boolean;
}

export interface DependencyPair {
  key: string;
  source: GanttRow;
  sourceIndex: number;
  target: GanttRow;
  targetIndex: number;
  type: DependencyType;
}

export interface ResolvedDependency {
  targetId: string;
  name: string;
  type: DependencyType;
  lag: string;
}
