<script lang="ts">
	import ChevronDownIcon from "@tabler/icons-svelte/icons/chevron-down";
	import ChevronRightIcon from "@tabler/icons-svelte/icons/chevron-right";
	import DotsIcon from "@tabler/icons-svelte/icons/dots";
	import FolderOpenIcon from "@tabler/icons-svelte/icons/folder-open";
	import GanttChartIcon from "@tabler/icons-svelte/icons/chart-bar";
	import ListIcon from "@tabler/icons-svelte/icons/list";
	import PencilIcon from "@tabler/icons-svelte/icons/pencil";
	import PlusIcon from "@tabler/icons-svelte/icons/plus";
	import SettingsIcon from "@tabler/icons-svelte/icons/settings";
	import TrashIcon from "@tabler/icons-svelte/icons/trash";
	import PaletteIcon from "@tabler/icons-svelte/icons/palette";
	import FileExportIcon from "@tabler/icons-svelte/icons/file-export";
	import FolderIcon from "@tabler/icons-svelte/icons/folder";
	import DeviceFloppy from "@tabler/icons-svelte/icons/device-floppy";
	import PhotoIcon from "@tabler/icons-svelte/icons/photo";
	import TableIcon from "@tabler/icons-svelte/icons/table";

	import * as Sidebar from "$lib/components/ui/sidebar/index.js";
	import * as Collapsible from "$lib/components/ui/collapsible/index.js";
	import * as DropdownMenu from "$lib/components/ui/dropdown-menu/index.js";
	import { Badge } from "$lib/components/ui/badge/index.js";
	import { Progress } from "$lib/components/ui/progress/index.js";

	const epics = [
		{
			id: "e1",
			name: "Foundation",
			color: "#3b82f6",
			tasks: [
				{ id: "t1", name: "Project setup" },
				{ id: "t2", name: "Database schema" },
				{ id: "t3", name: "Auth flow" },
			],
			progress: 80,
		},
		{
			id: "e2",
			name: "Core Features",
			color: "#10b981",
			tasks: [
				{ id: "t4", name: "Gantt rendering" },
				{ id: "t5", name: "Drag & drop" },
			],
			progress: 45,
		},
		{
			id: "e3",
			name: "Polish & Launch",
			color: "#f59e0b",
			tasks: [
				{ id: "t6", name: "UI refinement" },
				{ id: "t7", name: "Performance audit" },
				{ id: "t8", name: "Deployment" },
			],
			progress: 10,
		},
	];

	const sidebar = Sidebar.useSidebar();
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
								tooltipContent="My Project"
								class="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
								{...props}
							>
								<div class="bg-primary text-primary-foreground flex aspect-square size-8 items-center justify-center rounded-lg">
									<GanttChartIcon class="size-4" />
								</div>
								<div class="grid flex-1 text-left text-sm leading-tight">
									<span class="truncate font-semibold">My Project</span>
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
						<DropdownMenu.Item>
							<FolderOpenIcon class="size-4" />
							<span>Open Project</span>
						</DropdownMenu.Item>
						<DropdownMenu.Item>
							<FolderIcon class="size-4" />
							<span>New Project</span>
						</DropdownMenu.Item>
						<DropdownMenu.Item>
							<DeviceFloppy class="size-4" />
							<span>Save As</span>
						</DropdownMenu.Item>
						<DropdownMenu.Separator />
						<DropdownMenu.Item>
							<PhotoIcon class="size-4" />
							<span>Export PNG</span>
						</DropdownMenu.Item>
						<DropdownMenu.Item>
							<TableIcon class="size-4" />
							<span>Export CSV</span>
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
					<Sidebar.MenuButton isActive tooltipContent="Gantt Chart">
						<GanttChartIcon />
						<span>Gantt Chart</span>
					</Sidebar.MenuButton>
				</Sidebar.MenuItem>
				<Sidebar.MenuItem>
					<Sidebar.MenuButton tooltipContent="Task List">
						<ListIcon />
						<span>Task List</span>
					</Sidebar.MenuButton>
				</Sidebar.MenuItem>
			</Sidebar.Menu>
		</Sidebar.Group>

		<!-- Epics group -->
		<Sidebar.Group class="group-data-[collapsible=icon]:hidden">
			<Sidebar.GroupLabel>Epics</Sidebar.GroupLabel>
			<Sidebar.Menu>
				{#each epics as epic (epic.id)}
					<Collapsible.Root>
						<Sidebar.MenuItem>
							<Sidebar.MenuButton tooltipContent={epic.name}>
								<span
									class="size-2 shrink-0 rounded-full"
									style="background-color: {epic.color}"
								></span>
								<span class="flex-1 truncate">{epic.name}</span>
								<Badge variant="secondary" class="ml-auto text-xs tabular-nums">
									{epic.tasks.length}
								</Badge>
							</Sidebar.MenuButton>

							<DropdownMenu.Root>
								<DropdownMenu.Trigger>
									{#snippet child({ props })}
										<Sidebar.MenuAction
											{...props}
											showOnHover
											class="data-[state=open]:bg-accent rounded-sm"
										>
											<DotsIcon />
											<span class="sr-only">More</span>
										</Sidebar.MenuAction>
									{/snippet}
								</DropdownMenu.Trigger>
								<DropdownMenu.Content
									class="w-40 rounded-lg"
									side={sidebar.isMobile ? "bottom" : "right"}
									align="start"
								>
									<DropdownMenu.Item>
										<PlusIcon class="size-4" />
										<span>Add Task</span>
									</DropdownMenu.Item>
									<DropdownMenu.Item>
										<PencilIcon class="size-4" />
										<span>Edit Epic</span>
									</DropdownMenu.Item>
									<DropdownMenu.Item>
										<PaletteIcon class="size-4" />
										<span>Change Color</span>
									</DropdownMenu.Item>
									<DropdownMenu.Separator />
									<DropdownMenu.Item variant="destructive">
										<TrashIcon class="size-4" />
										<span>Delete</span>
									</DropdownMenu.Item>
								</DropdownMenu.Content>
							</DropdownMenu.Root>

							<Collapsible.Trigger
								class="absolute right-8 top-1 flex size-6 items-center justify-center rounded hover:bg-sidebar-accent"
							>
								<ChevronRightIcon class="size-3 transition-transform duration-200 group-data-[state=open]:rotate-90" />
								<span class="sr-only">Toggle {epic.name}</span>
							</Collapsible.Trigger>
						</Sidebar.MenuItem>

						<Collapsible.Content>
							<Sidebar.MenuSub>
								{#each epic.tasks as task (task.id)}
									<Sidebar.MenuSubItem>
										<Sidebar.MenuSubButton>
											<span>{task.name}</span>
										</Sidebar.MenuSubButton>
									</Sidebar.MenuSubItem>
								{/each}
							</Sidebar.MenuSub>
							<div class="px-4 pb-2 pt-1">
								<Progress value={epic.progress} class="h-1" />
							</div>
						</Collapsible.Content>
					</Collapsible.Root>
				{/each}
			</Sidebar.Menu>
		</Sidebar.Group>
	</Sidebar.Content>

	<!-- Footer -->
	<Sidebar.Footer>
		<Sidebar.Menu>
			<Sidebar.MenuItem>
				<Sidebar.MenuButton tooltipContent="Settings">
					<SettingsIcon />
					<span>Settings</span>
				</Sidebar.MenuButton>
			</Sidebar.MenuItem>
		</Sidebar.Menu>
	</Sidebar.Footer>

	<Sidebar.Rail />
</Sidebar.Root>
