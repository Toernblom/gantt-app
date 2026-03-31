<script lang="ts">
  import GanttChartIcon from "@tabler/icons-svelte/icons/chart-bar";
  import PlusIcon from "@tabler/icons-svelte/icons/plus";
  import SearchIcon from "@tabler/icons-svelte/icons/search";

  import * as Command from "$lib/components/ui/command/index.js";

  import { ganttStore } from "$lib/stores/gantt/ganttStore.svelte.js";
  import { dialogStore } from "$lib/stores/dialog/index.js";
  import { projectStore } from "$lib/stores/project/index.js";
  import type { GanttNode } from "$lib/types.js";

  let open = $state(false);

  function handleKeydown(e: KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key === "k") {
      e.preventDefault();
      open = !open;
    }
  }

  // Collect all nodes from the project for search
  function collectAll(nodes: GanttNode[]): GanttNode[] {
    const result: GanttNode[] = [];
    for (const n of nodes) {
      result.push(n);
      if (n.children.length > 0) result.push(...collectAll(n.children));
    }
    return result;
  }

  let allTasks = $derived(collectAll(projectStore.project.children));

  function handleSelectTask(taskId: string) {
    open = false;
    // Switch to gantt if needed, then select after a tick so the chart mounts first
    if (ganttStore.viewMode === 'kanban') ganttStore.setViewMode('gantt');
    // Clear then re-set selection to retrigger the scroll-to-center $effect
    ganttStore.selectTask(null);
    requestAnimationFrame(() => {
      ganttStore.selectTask(taskId);
    });
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<Command.Dialog bind:open title="Command Palette" description="Search tasks and commands...">
  <Command.Input placeholder="Search tasks..." />
  <Command.List>
    <Command.Empty>No results found.</Command.Empty>

    <Command.Group heading="Tasks">
      {#each allTasks as task (task.id)}
        <Command.Item
          value={task.name}
          onSelect={() => handleSelectTask(task.id)}
        >
          <span
            class="mr-2 size-2 shrink-0 rounded-full"
            style="background-color: {task.color}"
          ></span>
          <span class="flex-1 truncate">{task.name}</span>
          {#if task.isMilestone}
            <span class="text-[10px] text-muted-foreground">milestone</span>
          {/if}
        </Command.Item>
      {/each}
    </Command.Group>

    <Command.Separator />

    <Command.Group heading="Actions">
      <Command.Item onSelect={() => { dialogStore.requestCreate(); open = false; }}>
        <PlusIcon class="mr-2 size-4" />
        <span>New Task</span>
      </Command.Item>
      <Command.Item onSelect={() => { ganttStore.setViewMode('gantt'); open = false; }}>
        <GanttChartIcon class="mr-2 size-4" />
        <span>Gantt Chart</span>
      </Command.Item>
      <Command.Item onSelect={() => { ganttStore.setViewMode('kanban'); open = false; }}>
        <SearchIcon class="mr-2 size-4" />
        <span>Kanban Board</span>
      </Command.Item>
    </Command.Group>
  </Command.List>
</Command.Dialog>
