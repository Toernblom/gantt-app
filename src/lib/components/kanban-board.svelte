<script lang="ts">
  import PlusIcon from '@tabler/icons-svelte/icons/plus';
  import LayoutGridIcon from '@tabler/icons-svelte/icons/layout-grid';

  import { Button } from '$lib/components/ui/button/index.js';
  import { Input } from '$lib/components/ui/input/index.js';

  import { kanbanStore } from '$lib/stores/kanban/index.js';
  import { ganttStore } from '$lib/stores/gantt/ganttStore.svelte.js';
  import KanbanColumn from './kanban-column.svelte';

  let isAddingColumn = $state(false);
  let newColumnName = $state('');

  function handleAddColumn() {
    const name = newColumnName.trim();
    if (!name) return;
    kanbanStore.addColumn(name);
    newColumnName = '';
    isAddingColumn = false;
  }

  function handleAddKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') handleAddColumn();
    if (e.key === 'Escape') { isAddingColumn = false; newColumnName = ''; }
  }
</script>

{#if ganttStore.hasTasks}
  <div class="flex h-full gap-3 overflow-x-auto p-4">
    {#each kanbanStore.columns as column (column.id)}
      <KanbanColumn
        {column}
        tasks={kanbanStore.columnTasks.get(column.id) ?? []}
      />
    {/each}

    <!-- Add column button / inline form -->
    <div class="flex h-fit w-72 shrink-0 flex-col">
      {#if isAddingColumn}
        <div class="flex flex-col gap-2 rounded-lg border bg-muted/30 p-3">
          <Input
            bind:value={newColumnName}
            placeholder="Column name..."
            class="h-8 text-sm"
            onkeydown={handleAddKeydown}
            autofocus
          />
          <div class="flex gap-2">
            <Button size="sm" class="flex-1 text-xs" onclick={handleAddColumn}>
              Add
            </Button>
            <Button variant="outline" size="sm" class="text-xs" onclick={() => { isAddingColumn = false; newColumnName = ''; }}>
              Cancel
            </Button>
          </div>
        </div>
      {:else}
        <Button
          variant="outline"
          class="w-full justify-start border-dashed text-muted-foreground"
          onclick={() => isAddingColumn = true}
        >
          <PlusIcon class="mr-2 size-4" />
          Add Column
        </Button>
      {/if}
    </div>
  </div>
{:else}
  <div class="flex h-full items-center justify-center">
    <div class="flex flex-col items-center gap-3 text-muted-foreground">
      <LayoutGridIcon class="size-12 opacity-20" />
      {#if ganttStore.focusPath.length > 0}
        <p class="text-sm font-medium">No sub-tasks yet</p>
        <p class="text-xs opacity-60">Add tasks to build out this section</p>
      {:else}
        <p class="text-sm font-medium">No tasks yet</p>
        <p class="text-xs opacity-60">Create a task to get started</p>
      {/if}
    </div>
  </div>
{/if}
