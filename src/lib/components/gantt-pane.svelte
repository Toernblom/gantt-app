<script lang="ts">
	import ArrowBackUpIcon from "@tabler/icons-svelte/icons/arrow-back-up";
	import ArrowForwardUpIcon from "@tabler/icons-svelte/icons/arrow-forward-up";
	import FileExportIcon from "@tabler/icons-svelte/icons/file-export";
	import PlusIcon from "@tabler/icons-svelte/icons/plus";
	import * as Breadcrumb from "$lib/components/ui/breadcrumb/index.js";
	import * as ToggleGroup from "$lib/components/ui/toggle-group/index.js";
	import * as Tooltip from "$lib/components/ui/tooltip/index.js";
	import * as Sidebar from "$lib/components/ui/sidebar/index.js";
	import GanttChart from "./gantt-chart.svelte";
	import KanbanBoard from "./kanban-board.svelte";
	import TaskCreateDialog from "./task-create-dialog.svelte";
	import { Button } from "$lib/components/ui/button/index.js";
	import { Separator } from "$lib/components/ui/separator/index.js";
	import { ganttStore } from "$lib/stores/gantt/ganttStore.svelte.js";
	import { dialogStore } from "$lib/stores/dialog/index.js";
	import { persistenceStore } from "$lib/stores/persistence/index.js";
	import { historyStore } from "$lib/stores/history/index.js";
	import type { ZoomLevel } from "$lib/types.js";

	// Mirror the store's zoom level in a local string so the toggle group stays in sync.
	let zoomLevel = $derived(ganttStore.zoomLevel as string);

	function onZoomChange(value: string) {
		if (value) ganttStore.setZoom(value as ZoomLevel);
	}

</script>

<div class="flex h-full flex-col">
	<!-- Toolbar -->
	<div class="flex items-center gap-2 border-b px-4 py-2">
		<Sidebar.Trigger class="-ml-1" />
		<Separator orientation="vertical" class="h-4" />

		<!-- Breadcrumb -->
		<Breadcrumb.Root>
			<Breadcrumb.List>
				{#each ganttStore.breadcrumbs as segment, i (segment.id ?? 'root')}
					{#if i > 0}
						<Breadcrumb.Separator />
					{/if}
					<Breadcrumb.Item>
						{#if i < ganttStore.breadcrumbs.length - 1}
							<Breadcrumb.Link
								href="#"
								onclick={(e) => { e.preventDefault(); ganttStore.navigateTo(segment.depth); }}
							>
								{segment.name}
							</Breadcrumb.Link>
						{:else}
							<Breadcrumb.Page>{segment.name}</Breadcrumb.Page>
						{/if}
					</Breadcrumb.Item>
				{/each}
			</Breadcrumb.List>
		</Breadcrumb.Root>

		{#if persistenceStore.activeDirPath}
			<span class="text-xs text-muted-foreground/60">
				{#if persistenceStore.isSaving}
					Saving...
				{:else if persistenceStore.error}
					<span class="text-destructive">{persistenceStore.error}</span>
				{:else if persistenceStore.lastSaved}
					Saved
				{/if}
			</span>
		{/if}

		{#if !persistenceStore.activeDirPath}
			<span class="text-xs text-muted-foreground/50">Demo Project</span>
		{/if}

		<div class="ml-auto flex items-center gap-2">
			<!-- Undo/Redo -->
			<Tooltip.Provider>
				<Tooltip.Root>
					<Tooltip.Trigger>
						{#snippet child({ props })}
							<Button variant="ghost" size="icon" class="size-8"
								disabled={!historyStore.canUndo}
								onclick={() => ganttStore.undo()}
								{...props}>
								<ArrowBackUpIcon class="size-4" />
								<span class="sr-only">Undo</span>
							</Button>
						{/snippet}
					</Tooltip.Trigger>
					<Tooltip.Content>
						<span>Undo <kbd class="ml-1 rounded bg-muted px-1 py-0.5 font-mono text-xs">Ctrl+Z</kbd></span>
					</Tooltip.Content>
				</Tooltip.Root>

				<Tooltip.Root>
					<Tooltip.Trigger>
						{#snippet child({ props })}
							<Button variant="ghost" size="icon" class="size-8"
								disabled={!historyStore.canRedo}
								onclick={() => ganttStore.redo()}
								{...props}>
								<ArrowForwardUpIcon class="size-4" />
								<span class="sr-only">Redo</span>
							</Button>
						{/snippet}
					</Tooltip.Trigger>
					<Tooltip.Content>
						<span>Redo <kbd class="ml-1 rounded bg-muted px-1 py-0.5 font-mono text-xs">Ctrl+Shift+Z</kbd></span>
					</Tooltip.Content>
				</Tooltip.Root>
			</Tooltip.Provider>

			{#if ganttStore.viewMode === 'gantt'}
				<Separator orientation="vertical" class="h-4" />

				<!-- Zoom ToggleGroup -->
				<ToggleGroup.Root type="single" variant="outline" size="sm" value={zoomLevel} onValueChange={onZoomChange}>
					<ToggleGroup.Item value="day">Day</ToggleGroup.Item>
					<ToggleGroup.Item value="week">Week</ToggleGroup.Item>
					<ToggleGroup.Item value="month">Month</ToggleGroup.Item>
					<ToggleGroup.Item value="quarter">Qtr</ToggleGroup.Item>
				</ToggleGroup.Root>

				<!-- UI scale indicator (only when not 100%) -->
				{#if ganttStore.uiScale !== 1}
					<button
						class="rounded px-1.5 py-0.5 text-[10px] tabular-nums text-muted-foreground hover:bg-muted hover:text-foreground"
						onclick={() => ganttStore.resetUiScale()}
						title="Reset zoom (Ctrl+0)"
					>
						{Math.round(ganttStore.uiScale * 100)}%
					</button>
				{/if}

				<Separator orientation="vertical" class="h-4" />
			{/if}

			<!-- Export button -->
			<Tooltip.Provider>
				<Tooltip.Root>
					<Tooltip.Trigger>
						{#snippet child({ props })}
							<Button variant="ghost" size="icon" class="size-8" {...props}>
								<FileExportIcon class="size-4" />
								<span class="sr-only">Export</span>
							</Button>
						{/snippet}
					</Tooltip.Trigger>
					<Tooltip.Content>Export chart</Tooltip.Content>
				</Tooltip.Root>
			</Tooltip.Provider>

			<Separator orientation="vertical" class="h-4" />

			<!-- Add Task button -->
			<Button size="sm" onclick={() => dialogStore.requestCreate(ganttStore.focusedNode?.id)}>
				<PlusIcon class="mr-1 size-4" />
				Add Task
			</Button>
		</div>
	</div>

	<!-- Main area -->
	<div class="flex-1 overflow-hidden">
		{#if ganttStore.viewMode === 'kanban'}
			<KanbanBoard />
		{:else}
			<GanttChart />
		{/if}
	</div>
</div>

<TaskCreateDialog />
