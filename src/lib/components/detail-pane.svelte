<script lang="ts">
	import CalendarIcon from "@tabler/icons-svelte/icons/calendar";
	import CheckIcon from "@tabler/icons-svelte/icons/check";
	import TrashIcon from "@tabler/icons-svelte/icons/trash";
	import XIcon from "@tabler/icons-svelte/icons/x";
	import ListDetailsIcon from "@tabler/icons-svelte/icons/list-details";
	import PlusIcon from "@tabler/icons-svelte/icons/plus";

	import * as Tabs from "$lib/components/ui/tabs/index.js";
	import * as Card from "$lib/components/ui/card/index.js";
	import * as Select from "$lib/components/ui/select/index.js";
	import * as ScrollArea from "$lib/components/ui/scroll-area/index.js";
	import * as Table from "$lib/components/ui/table/index.js";
	import * as Tooltip from "$lib/components/ui/tooltip/index.js";
	import { Input } from "$lib/components/ui/input/index.js";
	import { Textarea } from "$lib/components/ui/textarea/index.js";
	import { Label } from "$lib/components/ui/label/index.js";
	import { Separator } from "$lib/components/ui/separator/index.js";
	import { Badge } from "$lib/components/ui/badge/index.js";
	import { Button } from "$lib/components/ui/button/index.js";
	import { Slider } from "$lib/components/ui/slider/index.js";
	import { Progress } from "$lib/components/ui/progress/index.js";
	import { Checkbox } from "$lib/components/ui/checkbox/index.js";
	import { Switch } from "$lib/components/ui/switch/index.js";

	// Sample data
	let hasSelection = $state(true);
	let taskName = $state("Design system integration");
	let progress = $state([60]);
	let isMilestone = $state(false);

	const dependencies = [
		{ id: "d1", from: "Project setup", type: "FS", lag: "0d" },
		{ id: "d2", from: "Database schema", type: "SS", lag: "+1d" },
	];

	let subtask1Done = $state(true);
	let subtask2Done = $state(false);
	let subtask3Done = $state(false);

	const subtasks = [
		{ id: "s1", label: "Define color tokens", get done() { return subtask1Done; }, set done(v: boolean) { subtask1Done = v; } },
		{ id: "s2", label: "Build component library", get done() { return subtask2Done; }, set done(v: boolean) { subtask2Done = v; } },
		{ id: "s3", label: "Write documentation", get done() { return subtask3Done; }, set done(v: boolean) { subtask3Done = v; } },
	];

	const epicColors = [
		{ value: "e1", label: "Foundation", color: "#3b82f6" },
		{ value: "e2", label: "Core Features", color: "#10b981" },
		{ value: "e3", label: "Polish & Launch", color: "#f59e0b" },
	];

	const taskColors = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899"];
	let selectedColor = $state(taskColors[0]);

	let selectedEpic = $state("e1");
</script>

<div class="flex h-full flex-col">
	{#if !hasSelection}
		<!-- Empty state -->
		<div class="flex h-full flex-col items-center justify-center gap-3 p-8 text-muted-foreground">
			<ListDetailsIcon class="size-10 opacity-20" />
			<p class="text-sm font-medium">No task selected</p>
			<p class="text-xs opacity-60">Click a task in the Gantt chart to view its details</p>
		</div>
	{:else}
		<!-- Header bar -->
		<div class="flex items-center gap-2 border-b px-4 py-2">
			<span
				class="size-3 shrink-0 rounded-full"
				style="background-color: {selectedColor}"
			></span>
			<Input
				value={taskName}
				oninput={(e) => (taskName = (e.target as HTMLInputElement).value)}
				class="h-7 flex-1 border-0 bg-transparent p-0 text-sm font-medium focus-visible:ring-0 focus-visible:ring-offset-0"
			/>
			<Badge variant="secondary" class="shrink-0">In Progress</Badge>

			<Tooltip.Provider>
				<Tooltip.Root>
					<Tooltip.Trigger>
						{#snippet child({ props })}
							<Button variant="ghost" size="icon" class="size-7 text-destructive hover:text-destructive" {...props}>
								<TrashIcon class="size-4" />
								<span class="sr-only">Delete task</span>
							</Button>
						{/snippet}
					</Tooltip.Trigger>
					<Tooltip.Content>
						Delete task <kbd class="ml-1 rounded bg-muted px-1 py-0.5 font-mono text-xs">Del</kbd>
					</Tooltip.Content>
				</Tooltip.Root>

				<Tooltip.Root>
					<Tooltip.Trigger>
						{#snippet child({ props })}
							<Button
								variant="ghost"
								size="icon"
								class="size-7"
								onclick={() => (hasSelection = false)}
								{...props}
							>
								<XIcon class="size-4" />
								<span class="sr-only">Close</span>
							</Button>
						{/snippet}
					</Tooltip.Trigger>
					<Tooltip.Content>Close panel</Tooltip.Content>
				</Tooltip.Root>
			</Tooltip.Provider>
		</div>

		<!-- Tabs -->
		<Tabs.Root value="details" class="flex flex-1 flex-col overflow-hidden">
			<Tabs.List class="mx-4 mt-2 shrink-0">
				<Tabs.Trigger value="details">Details</Tabs.Trigger>
				<Tabs.Trigger value="description">Description</Tabs.Trigger>
				<Tabs.Trigger value="dependencies">Dependencies</Tabs.Trigger>
				<Tabs.Trigger value="subtasks">Subtasks</Tabs.Trigger>
			</Tabs.List>

			<!-- Details tab -->
			<Tabs.Content value="details" class="flex-1 overflow-hidden">
				<ScrollArea.Root class="h-full">
					<div class="space-y-3 p-4">
						<!-- Schedule card -->
						<Card.Root>
							<Card.Header class="pb-2">
								<Card.Title class="text-sm">Schedule</Card.Title>
							</Card.Header>
							<Card.Content class="grid grid-cols-2 gap-3">
								<div class="space-y-1">
									<Label class="text-xs text-muted-foreground">Start Date</Label>
									<Button variant="outline" size="sm" class="w-full justify-start text-xs">
										<CalendarIcon class="mr-2 size-3" />
										Mar 15, 2026
									</Button>
								</div>
								<div class="space-y-1">
									<Label class="text-xs text-muted-foreground">End Date</Label>
									<Button variant="outline" size="sm" class="w-full justify-start text-xs">
										<CalendarIcon class="mr-2 size-3" />
										Mar 30, 2026
									</Button>
								</div>
								<div class="space-y-1">
									<Label class="text-xs text-muted-foreground">Duration</Label>
									<Input
										value="15d"
										readonly
										class="h-8 text-xs"
									/>
								</div>
								<div class="flex items-center gap-2 pt-4">
									<Switch id="milestone" bind:checked={isMilestone} />
									<Label for="milestone" class="text-xs">Milestone</Label>
								</div>
							</Card.Content>
						</Card.Root>

						<!-- Progress card -->
						<Card.Root>
							<Card.Header class="pb-2">
								<Card.Title class="text-sm">Progress</Card.Title>
							</Card.Header>
							<Card.Content class="space-y-3">
								<div class="flex items-center gap-3">
									<Slider
										bind:value={progress}
										min={0}
										max={100}
										step={1}
										class="flex-1"
									/>
									<span class="w-10 text-right text-sm tabular-nums">{progress[0]}%</span>
								</div>
								<Progress value={progress[0]} class="h-2" />
							</Card.Content>
						</Card.Root>

						<!-- Properties card -->
						<Card.Root>
							<Card.Header class="pb-2">
								<Card.Title class="text-sm">Properties</Card.Title>
							</Card.Header>
							<Card.Content class="space-y-3">
								<div class="space-y-1">
									<Label class="text-xs text-muted-foreground">Epic</Label>
									<Select.Root type="single" bind:value={selectedEpic}>
										<Select.Trigger class="w-full text-xs">
											{#if selectedEpic}
												{epicColors.find((e) => e.value === selectedEpic)?.label ?? "Select epic"}
											{:else}
												Select epic
											{/if}
										</Select.Trigger>
										<Select.Content>
											{#each epicColors as epic (epic.value)}
												<Select.Item value={epic.value}>
													<span class="flex items-center gap-2">
														<span class="size-2 rounded-full" style="background-color: {epic.color}"></span>
														{epic.label}
													</span>
												</Select.Item>
											{/each}
										</Select.Content>
									</Select.Root>
								</div>

								<div class="space-y-1">
									<Label class="text-xs text-muted-foreground">Color</Label>
									<div class="flex gap-2">
										{#each taskColors as color (color)}
											<button
												class="size-6 rounded-full ring-offset-background transition-all hover:scale-110 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
												style="background-color: {color}"
												onclick={() => (selectedColor = color)}
												aria-label="Select color {color}"
											>
												{#if selectedColor === color}
													<CheckIcon class="m-auto size-3 text-white" />
												{/if}
											</button>
										{/each}
									</div>
								</div>
							</Card.Content>
						</Card.Root>
					</div>
				</ScrollArea.Root>
			</Tabs.Content>

			<!-- Description tab -->
			<Tabs.Content value="description" class="flex-1 overflow-hidden">
				<ScrollArea.Root class="h-full">
					<div class="space-y-3 p-4">
						<Textarea
							placeholder="Write a description in Markdown..."
							class="min-h-[160px] resize-none font-mono text-sm"
						/>
						<Separator />
						<p class="text-xs text-muted-foreground">
							Supports <strong>Markdown</strong> formatting. Use **bold**, *italic*, `code`, and
							[links](url).
						</p>
					</div>
				</ScrollArea.Root>
			</Tabs.Content>

			<!-- Dependencies tab -->
			<Tabs.Content value="dependencies" class="flex-1 overflow-hidden">
				<ScrollArea.Root class="h-full">
					<div class="space-y-3 p-4">
						<Table.Root>
							<Table.Header>
								<Table.Row>
									<Table.Head class="text-xs">From Task</Table.Head>
									<Table.Head class="text-xs">Type</Table.Head>
									<Table.Head class="text-xs">Lag</Table.Head>
									<Table.Head class="w-10"></Table.Head>
								</Table.Row>
							</Table.Header>
							<Table.Body>
								{#each dependencies as dep (dep.id)}
									<Table.Row>
										<Table.Cell class="text-xs">{dep.from}</Table.Cell>
										<Table.Cell>
											<Badge variant="outline" class="text-xs">{dep.type}</Badge>
										</Table.Cell>
										<Table.Cell class="text-xs tabular-nums">{dep.lag}</Table.Cell>
										<Table.Cell>
											<Button variant="ghost" size="icon" class="size-6 text-muted-foreground hover:text-destructive">
												<XIcon class="size-3" />
											</Button>
										</Table.Cell>
									</Table.Row>
								{/each}
							</Table.Body>
						</Table.Root>
						<Button variant="outline" size="sm" class="w-full text-xs">
							<PlusIcon class="mr-1 size-3" />
							Add Dependency
						</Button>
					</div>
				</ScrollArea.Root>
			</Tabs.Content>

			<!-- Subtasks tab -->
			<Tabs.Content value="subtasks" class="flex-1 overflow-hidden">
				<ScrollArea.Root class="h-full">
					<div class="space-y-1 p-4">
						{#each subtasks as subtask (subtask.id)}
							<div class="flex items-center gap-2 rounded p-1 hover:bg-muted/50">
								<Checkbox id={subtask.id} bind:checked={subtask.done} />
								<label
									for={subtask.id}
									class="flex-1 cursor-pointer text-sm"
									class:line-through={subtask.done}
									class:text-muted-foreground={subtask.done}
								>
									{subtask.label}
								</label>
							</div>
						{/each}
						<Separator class="my-2" />
						<Button variant="outline" size="sm" class="w-full text-xs">
							<PlusIcon class="mr-1 size-3" />
							Add Subtask
						</Button>
					</div>
				</ScrollArea.Root>
			</Tabs.Content>
		</Tabs.Root>
	{/if}
</div>
