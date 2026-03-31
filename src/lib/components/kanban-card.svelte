<script lang="ts">
  import type { GanttNode } from '$lib/types';
  import { ganttStore } from '$lib/stores/gantt/index.js';
  import { kanbanStore } from '$lib/stores/kanban/index.js';
  import { Badge } from '$lib/components/ui/badge/index.js';
  import { Progress } from '$lib/components/ui/progress/index.js';

  interface Props {
    task: GanttNode;
  }

  let { task }: Props = $props();

  let isSelected = $derived(ganttStore.selectedTaskId === task.id);
  let todoCount = $derived(task.todos?.length ?? 0);
  let todoDone = $derived(task.todos?.filter(t => t.done).length ?? 0);
  let hasTodos = $derived(todoCount > 0);

  function handleClick() {
    ganttStore.selectTask(task.id);
  }

  function handleDragStart(e: DragEvent) {
    if (!e.dataTransfer) return;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', task.id);
    kanbanStore.startDrag(task.id);
  }

  function handleDragEnd() {
    kanbanStore.endDrag();
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="rounded-lg border bg-card p-3 shadow-sm cursor-grab active:cursor-grabbing
    transition-all hover:shadow-md
    {isSelected ? 'ring-2 ring-primary' : 'hover:border-primary/30'}"
  draggable="true"
  ondragstart={handleDragStart}
  ondragend={handleDragEnd}
  onclick={handleClick}
>
  <div class="flex items-start gap-2">
    <span
      class="mt-1 size-2.5 shrink-0 rounded-full"
      style="background-color: {task.color}"
    ></span>
    <div class="min-w-0 flex-1">
      <p class="text-sm font-medium leading-tight">{task.name}</p>
      {#if task.startDate && task.endDate && !task.isMilestone}
        <p class="mt-1 text-xs text-muted-foreground">
          {task.startDate} &rarr; {task.endDate}
        </p>
      {/if}
      {#if task.isMilestone}
        <Badge variant="outline" class="mt-1 text-[10px]">Milestone</Badge>
      {/if}
    </div>
  </div>

  {#if task.progress > 0 || hasTodos}
    <div class="mt-2 flex items-center gap-2">
      {#if task.progress > 0}
        <Progress value={task.progress} class="h-1.5 flex-1" />
        <span class="text-[10px] tabular-nums text-muted-foreground">{task.progress}%</span>
      {/if}
    </div>
  {/if}

  {#if hasTodos}
    <div class="mt-1.5 text-[10px] text-muted-foreground">
      {todoDone}/{todoCount} todos
    </div>
  {/if}
</div>
