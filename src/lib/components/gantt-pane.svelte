<script lang="ts">
	import ArrowBackUpIcon from "@tabler/icons-svelte/icons/arrow-back-up";
	import ArrowForwardUpIcon from "@tabler/icons-svelte/icons/arrow-forward-up";
	import FileExportIcon from "@tabler/icons-svelte/icons/file-export";
	import CalendarIcon from "@tabler/icons-svelte/icons/calendar";
	import GanttChartIcon from "@tabler/icons-svelte/icons/chart-bar";

	import * as Breadcrumb from "$lib/components/ui/breadcrumb/index.js";
	import * as ToggleGroup from "$lib/components/ui/toggle-group/index.js";
	import * as Tooltip from "$lib/components/ui/tooltip/index.js";
	import * as ContextMenu from "$lib/components/ui/context-menu/index.js";
	import * as ScrollArea from "$lib/components/ui/scroll-area/index.js";
	import * as Sidebar from "$lib/components/ui/sidebar/index.js";
	import { Button } from "$lib/components/ui/button/index.js";
	import { Separator } from "$lib/components/ui/separator/index.js";

	let zoomLevel = $state("week");
</script>

<div class="flex h-full flex-col">
	<!-- Toolbar -->
	<div class="flex items-center gap-2 border-b px-4 py-2">
		<Sidebar.Trigger class="-ml-1" />
		<Separator orientation="vertical" class="h-4" />

		<!-- Breadcrumb -->
		<Breadcrumb.Root>
			<Breadcrumb.List>
				<Breadcrumb.Item>
					<Breadcrumb.Link href="#">My Project</Breadcrumb.Link>
				</Breadcrumb.Item>
				<Breadcrumb.Separator />
				<Breadcrumb.Item>
					<Breadcrumb.Page>All Tasks</Breadcrumb.Page>
				</Breadcrumb.Item>
			</Breadcrumb.List>
		</Breadcrumb.Root>

		<div class="ml-auto flex items-center gap-2">
			<!-- Undo/Redo -->
			<Tooltip.Provider>
				<Tooltip.Root>
					<Tooltip.Trigger>
						{#snippet child({ props })}
							<Button variant="ghost" size="icon" class="size-8" {...props}>
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
							<Button variant="ghost" size="icon" class="size-8" {...props}>
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

			<Separator orientation="vertical" class="h-4" />

			<!-- Zoom ToggleGroup -->
			<ToggleGroup.Root type="single" variant="outline" size="sm" bind:value={zoomLevel}>
				<ToggleGroup.Item value="day">Day</ToggleGroup.Item>
				<ToggleGroup.Item value="week">Week</ToggleGroup.Item>
				<ToggleGroup.Item value="month">Month</ToggleGroup.Item>
				<ToggleGroup.Item value="quarter">Qtr</ToggleGroup.Item>
			</ToggleGroup.Root>

			<Separator orientation="vertical" class="h-4" />

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
		</div>
	</div>

	<!-- Main area with ContextMenu -->
	<div class="flex-1 overflow-hidden">
		<ContextMenu.Root>
			<ContextMenu.Trigger class="block h-full">
				<ScrollArea.Root class="h-full">
					<div class="flex h-full min-h-[300px] flex-col items-center justify-center gap-3 p-8 text-muted-foreground">
						<GanttChartIcon class="size-12 opacity-20" />
						<p class="text-sm">
							Gantt chart — zoom: <strong class="text-foreground">{zoomLevel}</strong>
						</p>
						<p class="text-xs opacity-60">Right-click for options</p>
					</div>
				</ScrollArea.Root>
			</ContextMenu.Trigger>
			<ContextMenu.Content class="w-52">
				<ContextMenu.Item>
					<CalendarIcon class="mr-2 size-4" />
					<span>Add Task Here</span>
				</ContextMenu.Item>
				<ContextMenu.Item>
					<span class="mr-2">◆</span>
					<span>Add Milestone</span>
				</ContextMenu.Item>
				<ContextMenu.Separator />
				<ContextMenu.Item>Zoom to Fit</ContextMenu.Item>
				<ContextMenu.Item>Show Critical Path</ContextMenu.Item>
				<ContextMenu.Separator />
				<ContextMenu.Item>Select All</ContextMenu.Item>
			</ContextMenu.Content>
		</ContextMenu.Root>
	</div>
</div>
