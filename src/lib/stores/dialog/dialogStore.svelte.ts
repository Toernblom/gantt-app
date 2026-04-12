import { ganttStore } from '../gantt/ganttStore.svelte.js';
import { timelineStore } from '../timeline/index.js';
import type { GanttNode } from '$lib/types';
import { TASK_LIST_WIDTH } from '$lib/types';
import type { DateValue } from '@internationalized/date';
import { CalendarDate, parseDate, today, getLocalTimeZone } from '@internationalized/date';

const TASK_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

class DialogStore {
  // --- Dialog state ---
  open = $state(false);
  mode = $state<'create' | 'edit'>('create');
  editTask = $state<GanttNode | undefined>(undefined);
  defaultEpicId = $state<string | undefined>(undefined);
  defaultStartDate = $state<string | undefined>(undefined);

  // --- Form fields ---
  taskName = $state('');
  selectedEpicId = $state('');
  startDateValue = $state<DateValue | undefined>(undefined);
  endDateValue = $state<DateValue | undefined>(undefined);
  isMilestone = $state(false);
  selectedColor = $state(TASK_COLORS[0]);

  // --- Popover state ---
  startPopoverOpen = $state(false);
  endPopoverOpen = $state(false);

  // --- Constants ---
  readonly taskColors = TASK_COLORS;

  // --- Derived ---
  /** All nodes in the project tree (flattened), usable as parent options. */
  allParentOptions = $derived.by<{ node: GanttNode; depth: number }[]>(() => {
    const result: { node: GanttNode; depth: number }[] = [];
    const walk = (nodes: GanttNode[], depth: number) => {
      for (const n of nodes) {
        result.push({ node: n, depth });
        walk(n.children, depth + 1);
      }
    };
    walk(ganttStore.displayChildren, 0);
    return result;
  });

  /** True when creating a sub-task under a specific parent (hide epic selector). */
  hasPresetParent = $derived(this.mode === 'create' && !!this.defaultEpicId);

  /** True when creating in overview mode — dates auto-set, no date pickers shown. */
  isOverviewCreate = $state(false);

  // --- Helpers ---
  isoToDateValue(iso: string | undefined): DateValue | undefined {
    if (!iso) return undefined;
    try { return parseDate(iso); } catch { return undefined; }
  }

  dateValueToIso(dv: DateValue | undefined): string {
    if (!dv) return today(getLocalTimeZone()).toString();
    return dv.toString();
  }

  formatDateDisplay(dv: DateValue | undefined): string {
    if (!dv) return 'Pick a date';
    const d = new Date(dv.year, dv.month - 1, dv.day);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  // --- Methods ---
  private _getViewportCenterIso(): string {
    const centerX = ganttStore.viewportScrollLeft + (ganttStore.viewportClientWidth - TASK_LIST_WIDTH) / 2;
    const centerDate = timelineStore.timeScale.invert(Math.max(0, centerX));
    const y = centerDate.getFullYear();
    const m = String(centerDate.getMonth() + 1).padStart(2, '0');
    const d = String(centerDate.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  requestCreate(epicId?: string, startDate?: string): void {
    this.editTask = undefined;
    this.defaultEpicId = epicId;
    this.isOverviewCreate = ganttStore.zoomLevel === 'overview';
    if (this.isOverviewCreate) {
      this.defaultStartDate = this._getViewportCenterIso();
    } else {
      this.defaultStartDate = startDate;
    }
    this.mode = 'create';
    this.resetForm();
    this.open = true;
  }

  requestEdit(taskId: string): void {
    const node = ganttStore.getNodeById(taskId);
    if (!node) return;
    this.editTask = node;
    this.isOverviewCreate = false;
    this.mode = 'edit';
    this.populateFromTask(node);
    this.open = true;
  }

  close(): void {
    this.open = false;
  }

  resetForm(): void {
    this.taskName = '';
    this.selectedEpicId = this.defaultEpicId ?? '';
    const defaultStart = this.defaultStartDate
      ? this.isoToDateValue(this.defaultStartDate)
      : today(getLocalTimeZone());
    this.startDateValue = defaultStart;
    const daysToAdd = this.isOverviewCreate ? 7 : 1;
    const defaultEnd =
      defaultStart instanceof CalendarDate
        ? defaultStart.add({ days: daysToAdd })
        : today(getLocalTimeZone()).add({ days: daysToAdd });
    this.endDateValue = defaultEnd;
    this.isMilestone = false;
    this.selectedColor = TASK_COLORS[0];
  }

  populateFromTask(task: GanttNode): void {
    this.taskName = task.name;
    // Find the parent that owns this task
    const ownerOption = this.allParentOptions.find((o) =>
      o.node.children.some((t) => t.id === task.id),
    );
    this.selectedEpicId = ownerOption?.node.id ?? '';
    this.startDateValue = this.isoToDateValue(task.startDate);
    this.endDateValue = this.isoToDateValue(task.endDate);
    this.isMilestone = task.isMilestone;
    this.selectedColor = task.color ?? TASK_COLORS[0];
  }

  submit(): void {
    const startIso = this.dateValueToIso(this.startDateValue);
    const endIso = this.dateValueToIso(this.endDateValue);

    if (this.mode === 'create') {
      const newNode: GanttNode = {
        id: `node-${Date.now()}`,
        name: this.taskName.trim() || 'Untitled Task',
        color: this.selectedColor,
        startDate: startIso,
        endDate: this.isMilestone ? startIso : endIso,
        progress: 0,
        isMilestone: this.isMilestone,
        expanded: false,
        children: [],
        dependencies: [],
        todos: [],
        kanbanColumnId: 'backlog',
      };
      ganttStore.addChild(this.selectedEpicId || null, newNode);
    } else if (this.mode === 'edit' && this.editTask) {
      ganttStore.updateTask(this.editTask.id, {
        name: this.taskName.trim() || this.editTask.name,
        startDate: startIso,
        endDate: this.isMilestone ? startIso : endIso,
        color: this.selectedColor,
        isMilestone: this.isMilestone,
      });
    }

    this.open = false;
  }
}

export const dialogStore = new DialogStore();
