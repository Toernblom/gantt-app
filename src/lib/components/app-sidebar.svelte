<script lang="ts">
	import ChevronDownIcon from "@tabler/icons-svelte/icons/chevron-down";
	import FolderOpenIcon from "@tabler/icons-svelte/icons/folder-open";
	import GanttChartIcon from "@tabler/icons-svelte/icons/chart-bar";
	import ListIcon from "@tabler/icons-svelte/icons/list";
	import DownloadIcon from "@tabler/icons-svelte/icons/download";
	import RefreshIcon from "@tabler/icons-svelte/icons/refresh";
	import FolderIcon from "@tabler/icons-svelte/icons/folder";
	import TrashIcon from "@tabler/icons-svelte/icons/trash";

	import * as Sidebar from "$lib/components/ui/sidebar/index.js";
	import * as DropdownMenu from "$lib/components/ui/dropdown-menu/index.js";
	import ModeToggle from "$lib/components/mode-toggle.svelte";

	import { ganttStore } from "$lib/stores/gantt/index.js";
	import { projectStore } from "$lib/stores/project/index.js";
	import { persistenceStore } from "$lib/stores/persistence/index.js";
	import type { RecentEntry } from "$lib/stores/persistence/index.js";
	import { updaterStore } from "$lib/stores/updater/index.js";

	const sidebar = Sidebar.useSidebar();

	let recentProjects = $derived(persistenceStore.recentProjects);
	let activeProject = $derived(projectStore.project);

	function handleOpenRecent(entry: RecentEntry) {
		ganttStore.openRecent(entry);
	}

	function handleNewProject() {
		ganttStore.createProjectFolder();
	}

	function handleForgetRecent(id: string, e: MouseEvent) {
		e.stopPropagation();
		persistenceStore.forgetRecent(id);
	}
</script>

<Sidebar.Root collapsible="icon">
	<!-- Header: Project identity with DropdownMenu -->
	<Sidebar.Header>
		<Sidebar.Menu>
			<Sidebar.MenuItem>
				<DropdownMenu.Root>
					<DropdownMenu.Trigger>
						{#snippet child({ props })}
							<Sidebar.MenuButton
								size="lg"
								tooltipContent={activeProject.name}
								class="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
								{...props}
							>
								<div class="bg-primary text-primary-foreground flex aspect-square size-8 items-center justify-center rounded-lg">
									<GanttChartIcon class="size-4" />
								</div>
								<div class="grid flex-1 text-left text-sm leading-tight">
									<span class="truncate font-semibold">{activeProject.name}</span>
									<span class="truncate text-xs text-muted-foreground">Gantt App</span>
								</div>
								<ChevronDownIcon class="ml-auto" />
							</Sidebar.MenuButton>
						{/snippet}
					</DropdownMenu.Trigger>
					<DropdownMenu.Content
						class="w-56 rounded-lg"
						side={sidebar.isMobile ? "bottom" : "right"}
						align="start"
					>
						<DropdownMenu.Item onclick={() => ganttStore.openFolder()}>
							<FolderOpenIcon class="size-4" />
							<span>Open Folder</span>
						</DropdownMenu.Item>
						<DropdownMenu.Item onclick={handleNewProject}>
							<FolderIcon class="size-4" />
							<span>New Project Folder</span>
						</DropdownMenu.Item>
					</DropdownMenu.Content>
				</DropdownMenu.Root>
			</Sidebar.MenuItem>
		</Sidebar.Menu>
	</Sidebar.Header>

	<Sidebar.Content>
		<!-- Views group -->
		<Sidebar.Group>
			<Sidebar.GroupLabel>Views</Sidebar.GroupLabel>
			<Sidebar.Menu>
				<Sidebar.MenuItem>
					<Sidebar.MenuButton
						isActive={ganttStore.viewMode === 'gantt'}
						tooltipContent="Gantt Chart"
						onclick={() => ganttStore.setViewMode('gantt')}
					>
						<GanttChartIcon />
						<span>Gantt Chart</span>
					</Sidebar.MenuButton>
				</Sidebar.MenuItem>
				<Sidebar.MenuItem>
					<Sidebar.MenuButton
						isActive={ganttStore.viewMode === 'kanban'}
						tooltipContent="Kanban"
						onclick={() => ganttStore.setViewMode('kanban')}
					>
						<ListIcon />
						<span>Kanban</span>
					</Sidebar.MenuButton>
				</Sidebar.MenuItem>
			</Sidebar.Menu>
		</Sidebar.Group>

		<!-- Recent Projects group -->
		<Sidebar.Group class="group-data-[collapsible=icon]:hidden">
			<Sidebar.GroupLabel>Recent Projects</Sidebar.GroupLabel>
			<Sidebar.Menu>
				{#each recentProjects as entry (entry.id)}
					<Sidebar.MenuItem>
						<Sidebar.MenuButton
							isActive={entry.id === activeProject.id}
							tooltipContent={entry.name}
							onclick={() => handleOpenRecent(entry)}
						>
							<span
								class="size-2 shrink-0 rounded-full {entry.id === activeProject.id
									? 'bg-primary'
									: 'bg-muted-foreground/40'}"
							></span>
							<span class="flex-1 truncate">{entry.name}</span>
							<!-- svelte-ignore a11y_click_events_have_key_events -->
							<!-- svelte-ignore a11y_no_static_element_interactions -->
							<span
								class="ml-auto rounded p-0.5 text-muted-foreground opacity-0 hover:text-destructive group-hover/menu-item:opacity-100"
								onclick={(e) => handleForgetRecent(entry.id, e)}
							>
								<TrashIcon class="size-3.5" />
							</span>
						</Sidebar.MenuButton>
					</Sidebar.MenuItem>
				{/each}
			</Sidebar.Menu>
		</Sidebar.Group>
	</Sidebar.Content>

	<!-- Footer -->
	<Sidebar.Footer>
		<Sidebar.Menu>
			{#if updaterStore.error}
				<Sidebar.MenuItem>
					<span class="px-2 py-1 text-xs text-destructive truncate">{updaterStore.error}</span>
				</Sidebar.MenuItem>
			{/if}
			{#if updaterStore.available}
				<Sidebar.MenuItem>
					<Sidebar.MenuButton
						tooltipContent="Update to v{updaterStore.version}"
						onclick={() => updaterStore.install()}
					>
						<DownloadIcon class={updaterStore.downloading ? 'animate-bounce' : ''} />
						<span class="flex-1 truncate">
							{#if updaterStore.downloading}
								Installing...
							{:else}
								Update to v{updaterStore.version}
							{/if}
						</span>
					</Sidebar.MenuButton>
				</Sidebar.MenuItem>
			{/if}
			<Sidebar.MenuItem>
				<ModeToggle />
			</Sidebar.MenuItem>
			<Sidebar.MenuItem>
				<Sidebar.MenuButton
					tooltipContent="Check for updates"
					onclick={() => updaterStore.check()}
				>
					<RefreshIcon class={updaterStore.checking ? 'animate-spin' : ''} />
					<span>
						{#if updaterStore.checking}
							Checking...
						{:else}
							Check for Updates
						{/if}
					</span>
				</Sidebar.MenuButton>
			</Sidebar.MenuItem>
		</Sidebar.Menu>
	</Sidebar.Footer>

	<Sidebar.Rail />
</Sidebar.Root>
