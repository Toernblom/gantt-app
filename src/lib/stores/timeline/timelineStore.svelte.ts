import { ganttStore } from '../gantt/ganttStore.svelte.js';
import { ROW_HEIGHT } from '$lib/types';
import { createTimeScale, padDateRange } from '$lib/utils/timeline.js';
import type { ScaleTime } from 'd3-scale';

class TimelineStore {
  paddedRange = $derived.by<[Date, Date]>(() => {
    const [rawStart, rawEnd] = ganttStore.dateRange;
    return padDateRange(new Date(rawStart), new Date(rawEnd), ganttStore.zoomConfig);
  });

  timeScale = $derived<ScaleTime<number, number>>(
    createTimeScale(this.paddedRange, ganttStore.zoomConfig),
  );

  totalWidth = $derived<number>(this.timeScale.range()[1]);
  totalHeight = $derived<number>(ganttStore.rows.length * ROW_HEIGHT);
}

export const timelineStore = new TimelineStore();
