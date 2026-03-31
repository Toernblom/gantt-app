<script lang="ts">
  import PlusIcon from '@tabler/icons-svelte/icons/plus';
  import DotsVerticalIcon from '@tabler/icons-svelte/icons/dots-vertical';
  import TrashIcon from '@tabler/icons-svelte/icons/trash';
  import PencilIcon from '@tabler/icons-svelte/icons/pencil';

  import * as DropdownMenu from '$lib/components/ui/dropdown-menu/index.js';
  import * as ScrollArea from '$lib/components/ui/scroll-area/index.js';
  import { Button } from '$lib/components/ui/button/index.js';

  import type { GanttNode, KanbanColumn } from '$lib/types';
  import { kanbanStore } from '$lib/stores/kanban/index.js';
  import { dialogStore } from '$lib/stores/dialog/index.js';
  import KanbanCard from './kanban-card.svelte';

  interface Props {
    column: KanbanColumn;
    tasks: GanttNode[];
  }

  let { column, tasks }: Props = $props();

  let isDragOver = $state(false);
  let isEditing = $state(false);
  let editName = $state('');

  function handleDragOver(e: DragEvent) {
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
    isDragOver = true;
  }

  function handleDragLeave() {
    isDragOver = false;
  }

  function handleDrop(e: DragEvent) {
    e.preventDefault();
    isDragOver = false;
    const taskId = e.dataTransfer?.getData('text/plain');
    if (taskId) {
      kanbanStore.moveTask(taskId, column.id);
    }
  }

  function handleStartEdit() {
    editName = column.name;
    isEditing = true;
  }

  function handleFinishEdit() {
    const trimmed = editName.trim();
    if (trimmed && trimmed !== column.name) {
      kanbanStore.renameColumn(column.id, trimmed);
    }
    isEditing = false;
  }

  function handleEditKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') handleFinishEdit();
    if (e.key === 'Escape') isEditing = false;
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  role="list"
  class="flex h-full w-72 shrink-0 flex-col overflow-hidden rounded-lg border bg-muted/30"
  class:ring-2={isDragOver}
  class:ring-primary={isDragOver}
  ondragover={handleDragOver}
  ondragleave={handleDragLeave}
  ondrop={handleDrop}
>
  <!-- Column header -->
  <div class="flex items-center gap-2 px-3 py-2.5">
    {#if isEditing}
      <input
        class="h-6 flex-1 rounded border bg-background px-1.5 text-sm font-medium focus:outline-none focus:ring-1 focus:ring-ring"
        bind:value={editName}
        onblur={handleFinishEdit}
        onkeydown={handleEditKeydown}
        autofocus
      />
    {:else}
      <span class="flex-1 truncate text-sm font-medium">{column.name}</span>
    {/if}
    <span class="rounded-full bg-muted px-1.5 py-0.5 text-[10px] tabular-nums text-muted-foreground">
      {tasks.length}
    </span>

    <DropdownMenu.Root>
      <DropdownMenu.Trigger>
        {#snippet child({ props })}
          <Button variant="ghost" size="icon" class="size-6" {...props}>
            <DotsVerticalIcon class="size-3.5" />
          </Button>
        {/snippet}
      </DropdownMenu.Trigger>
      <DropdownMenu.Content class="w-40" align="end">
        <DropdownMenu.Item onclick={handleStartEdit}>
          <PencilIcon class="mr-2 size-4" />
          Rename
        </DropdownMenu.Item>
        <DropdownMenu.Item onclick={() => dialogStore.requestCreate()}>
          <PlusIcon class="mr-2 size-4" />
          Add Task
        </DropdownMenu.Item>
        {#if column.id !== 'backlog'}
          <DropdownMenu.Separator />
          <DropdownMenu.Item
            class="text-destructive focus:text-destructive"
            onclick={() => kanbanStore.removeColumn(column.id)}
          >
            <TrashIcon class="mr-2 size-4" />
            Delete Column
          </DropdownMenu.Item>
        {/if}
      </DropdownMenu.Content>
    </DropdownMenu.Root>
  </div>

  <!-- Cards area -->
  <div class="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
    <div class="flex flex-col gap-2">
      {#each tasks as task (task.id)}
        <KanbanCard {task} />
      {/each}
    </div>
  </div>
</div>
