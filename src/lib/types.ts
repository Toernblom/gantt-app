export type ZoomLevel = 'day' | 'week' | 'month' | 'quarter' | 'overview';
export type DependencyType = 'FS' | 'SS' | 'FF' | 'SF';

export interface Todo {
  id: string;
  text: string;
  done: boolean;
}

export interface KanbanColumn {
  id: string;
  name: string;
}

export interface GanttNode {
  id: string;
  name: string;
  color: string;
  startDate: string;
  endDate: string;
  progress: number;
  description?: string;
  isMilestone: boolean;
  expanded: boolean;
  children: GanttNode[];
  dependencies: Dependency[];
  todos: Todo[];
  kanbanColumnId: string;
  /** When true, this task (and its children) won't appear in Up Next until all dependency predecessors reach 100% progress. */
  requireDepsComplete?: boolean;
}

export interface Project {
  id: string;
  name: string;
  description?: string;
  children: GanttNode[];
  kanbanColumns: KanbanColumn[];
}

export interface Dependency {
  targetId: string;
  /** Denormalized name for human/LLM readability in the JSON file. Ignored by app logic. */
  targetName?: string;
  type: DependencyType;
  lag: number;
}

// Flattened row for rendering
export interface GanttRow {
  id: string;
  name: string;
  level: number;
  startDate: string;
  endDate: string;
  progress: number;
  color: string;
  isMilestone: boolean;
  hasChildren: boolean;
  expanded: boolean;
  dependencies: Dependency[];
}

export interface ZoomConfig {
  columnUnit: 'hour' | 'day' | 'week' | 'month';
  columnWidth: number;
  topHeaderUnit: 'day' | 'week' | 'month' | 'quarter' | 'year';
  bottomHeaderUnit: 'hour' | 'day' | 'week' | 'month' | 'quarter';
  topHeaderFormat: string;
  bottomHeaderFormat: string;
  snapUnit: 'hour' | 'day' | 'week' | 'month';
}

export const ROW_HEIGHT = 36;
export const TASK_LIST_WIDTH = 240;

export const ZOOM_CONFIGS: Record<ZoomLevel, ZoomConfig> = {
  day: {
    columnUnit: 'hour',
    columnWidth: 30,
    topHeaderUnit: 'day',
    bottomHeaderUnit: 'hour',
    topHeaderFormat: 'EEE, MMM d',
    bottomHeaderFormat: 'HH:00',
    snapUnit: 'hour',
  },
  week: {
    columnUnit: 'day',
    columnWidth: 40,
    topHeaderUnit: 'month',
    bottomHeaderUnit: 'day',
    topHeaderFormat: 'MMMM yyyy',
    bottomHeaderFormat: 'd',
    snapUnit: 'day',
  },
  month: {
    columnUnit: 'week',
    columnWidth: 50,
    topHeaderUnit: 'quarter',
    bottomHeaderUnit: 'week',
    topHeaderFormat: "'Q'Q yyyy",
    bottomHeaderFormat: "'W'w",
    snapUnit: 'week',
  },
  quarter: {
    columnUnit: 'month',
    columnWidth: 60,
    topHeaderUnit: 'year',
    bottomHeaderUnit: 'month',
    topHeaderFormat: 'yyyy',
    bottomHeaderFormat: 'MMM',
    snapUnit: 'month',
  },
  overview: {
    columnUnit: 'day',
    columnWidth: 40,
    topHeaderUnit: 'month',
    bottomHeaderUnit: 'day',
    topHeaderFormat: '',
    bottomHeaderFormat: '',
    snapUnit: 'day',
  },
};
