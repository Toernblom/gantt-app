<script lang="ts">
  import TargetArrowIcon from '@tabler/icons-svelte/icons/target-arrow';
  import LockIcon from '@tabler/icons-svelte/icons/lock';
  import ChevronRightIcon from '@tabler/icons-svelte/icons/chevron-right';
  import FlameIcon from '@tabler/icons-svelte/icons/flame';
  import ArrowUpIcon from '@tabler/icons-svelte/icons/arrow-up';

  import { Badge } from '$lib/components/ui/badge/index.js';
  import { Progress } from '$lib/components/ui/progress/index.js';
  import { Separator } from '$lib/components/ui/separator/index.js';

  import { priorityStore } from '$lib/stores/priority/index.js';
  import { ganttStore } from '$lib/stores/gantt/ganttStore.svelte.js';
  import type { PriorityItem } from '$lib/stores/priority/index.js';

  let showBlocked = $state(false);

  function handleClick(item: PriorityItem) {
    ganttStore.selectTask(item.task.id);
  }
</script>

<div class="flex h-full flex-col">
  <!-- Header -->
  <div class="flex items-center gap-2 border-b px-4 py-2">
    <TargetArrowIcon class="size-4 text-muted-foreground" />
    <span class="text-sm font-medium">Up Next</span>
    <Badge variant="secondary" class="ml-auto text-[10px]">
      {priorityStore.readyItems.length}
    </Badge>
  </div>

  <!-- Scrollable content -->
  <div class="flex-1 overflow-y-auto">
    {#if priorityStore.readyItems.length === 0 && priorityStore.blockedItems.length === 0}
      <div class="flex flex-col items-center gap-2 p-8 text-muted-foreground">
        <TargetArrowIcon class="size-10 opacity-20" />
        <p class="text-sm font-medium">No tasks</p>
        <p class="text-xs opacity-60">Add tasks to see priorities</p>
      </div>
    {:else}
      <!-- Ready items -->
      <div class="flex flex-col gap-1.5 p-3">
        {#each priorityStore.readyItems as item, i (item.task.id)}
          {@const isSelected = ganttStore.selectedTaskId === item.task.id}
          <!-- svelte-ignore a11y_click_events_have_key_events -->
          <!-- svelte-ignore a11y_interactive_supports_focus -->
          <div
            role="button"
            class="rounded-lg border p-3 transition-all cursor-pointer
              {isSelected ? 'border-primary bg-accent/60' : 'hover:border-primary/30 hover:bg-muted/30'}"
            onclick={() => handleClick(item)}
          >
            <div class="flex items-start gap-2">
              {#if i === 0}
                <FlameIcon class="mt-0.5 size-4 shrink-0 text-orange-400" />
              {:else}
                <span
                  class="mt-1 size-2.5 shrink-0 rounded-full"
                  style="background-color: {item.task.color}"
                ></span>
              {/if}
              <div class="min-w-0 flex-1">
                <p class="text-sm font-medium leading-tight">{item.task.name}</p>
                <p class="mt-1 text-xs text-muted-foreground">{item.reason}</p>
              </div>
              {#if item.unblocksCount > 0}
                <Badge variant="outline" class="shrink-0 text-[10px]">
                  <ArrowUpIcon class="mr-0.5 size-3" />
                  {item.unblocksCount}
                </Badge>
              {/if}
            </div>
            {#if item.progress > 0}
              <div class="mt-2 flex items-center gap-2">
                <Progress value={item.progress} class="h-1.5 flex-1" />
                <span class="text-[10px] tabular-nums text-muted-foreground">{item.progress}%</span>
              </div>
            {/if}
          </div>
        {/each}
      </div>

      <!-- Blocked section -->
      {#if priorityStore.blockedItems.length > 0}
        <Separator />
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <!-- svelte-ignore a11y_interactive_supports_focus -->
        <div
          role="button"
          class="flex cursor-pointer items-center gap-2 px-4 py-2 text-muted-foreground hover:bg-muted/30"
          onclick={() => showBlocked = !showBlocked}
        >
          <LockIcon class="size-3.5" />
          <span class="text-xs font-medium">Blocked</span>
          <Badge variant="secondary" class="ml-auto text-[10px]">
            {priorityStore.blockedItems.length}
          </Badge>
          <ChevronRightIcon class="size-3.5 transition-transform {showBlocked ? 'rotate-90' : ''}" />
        </div>

        {#if showBlocked}
          <div class="flex flex-col gap-1 px-3 pb-3">
            {#each priorityStore.blockedItems as item (item.task.id)}
              {@const isSelected = ganttStore.selectedTaskId === item.task.id}
              <!-- svelte-ignore a11y_click_events_have_key_events -->
              <!-- svelte-ignore a11y_interactive_supports_focus -->
              <div
                role="button"
                class="rounded-lg border border-transparent p-2.5 opacity-50 transition-all cursor-pointer
                  {isSelected ? 'border-primary opacity-80' : 'hover:opacity-70'}"
                onclick={() => handleClick(item)}
              >
                <div class="flex items-start gap-2">
                  <span
                    class="mt-1 size-2 shrink-0 rounded-full"
                    style="background-color: {item.task.color}"
                  ></span>
                  <div class="min-w-0 flex-1">
                    <p class="text-xs font-medium leading-tight">{item.task.name}</p>
                    <p class="mt-0.5 text-[10px] text-muted-foreground">
                      {item.blockedBy.slice(0, 2).join(', ')}{item.blockedBy.length > 2 ? ` +${item.blockedBy.length - 2}` : ''}
                    </p>
                  </div>
                </div>
              </div>
            {/each}
          </div>
        {/if}
      {/if}
    {/if}
  </div>
</div>
