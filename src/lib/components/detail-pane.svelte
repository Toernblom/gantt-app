<script lang="ts">
	import CalendarIcon from "@tabler/icons-svelte/icons/calendar";
	import CheckIcon from "@tabler/icons-svelte/icons/check";
	import TrashIcon from "@tabler/icons-svelte/icons/trash";
	import XIcon from "@tabler/icons-svelte/icons/x";
	import ListDetailsIcon from "@tabler/icons-svelte/icons/list-details";
	import PlusIcon from "@tabler/icons-svelte/icons/plus";

	import * as Tabs from "$lib/components/ui/tabs/index.js";
	import * as Card from "$lib/components/ui/card/index.js";
	import * as ScrollArea from "$lib/components/ui/scroll-area/index.js";
	import * as Select from "$lib/components/ui/select/index.js";
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
	import { Switch } from "$lib/components/ui/switch/index.js";
	import { Checkbox } from "$lib/components/ui/checkbox/index.js";

	import * as Popover from "$lib/components/ui/popover/index.js";
	import * as Calendar from "$lib/components/ui/calendar/index.js";
	import { parseDate } from "@internationalized/date";
	import type { DateValue } from "@internationalized/date";

	import { ganttStore } from "$lib/stores/gantt/ganttStore.svelte.js";
	import { formatDisplayDate } from "$lib/utils/timeline";

	// ---------------------------------------------------------------------------
	// Constants
	// ---------------------------------------------------------------------------

	const taskColors = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899"];

	// ---------------------------------------------------------------------------
	// Store-derived read values
	// ---------------------------------------------------------------------------

	let hasSelection = $derived(ganttStore.selectedTaskId !== null);
	let selectedTaskId = $derived(ganttStore.selectedTaskId);
	let selectedTask = $derived(ganttStore.selectedTask);
	let selectedColor = $derived(ganttStore.selectedColor);

	let taskName = $derived(selectedTask?.name ?? "");
	let isParent = $derived((selectedTask?.children?.length ?? 0) > 0);
	let isAutoProgress = $derived(selectedTask ? ganttStore.isAutoProgress(selectedTask.id) : false);
	let progressValue = $derived(
		selectedTask ? ganttStore.getEffectiveProgress(selectedTask.id) : 0
	);
	let isMilestone = $derived(selectedTask?.isMilestone ?? false);
	let duration = $derived(ganttStore.duration);
	let resolvedDependencies = $derived(ganttStore.resolvedDependencies);
	let description = $derived(selectedTask?.description ?? "");
	let statusLabel = $derived(ganttStore.statusLabel);

	// ---------------------------------------------------------------------------
	// Write-back helpers (call store methods)
	// ---------------------------------------------------------------------------

	function handleNameInput(e: Event) {
		const id = selectedTaskId;
		if (!id) return;
		ganttStore.updateTask(id, { name: (e.target as HTMLInputElement).value });
	}

	function handleProgressChange(value: number) {
		const id = selectedTaskId;
		if (!id) return;
		ganttStore.updateTask(id, { progress: value });
	}

	function handleMilestoneChange(checked: boolean) {
		const id = selectedTaskId;
		if (!id) return;
		ganttStore.updateTask(id, { isMilestone: checked });
	}

	function handleColorClick(color: string) {
		const id = selectedTaskId;
		if (!id) return;
		ganttStore.updateTask(id, { color });
	}

	// Dependency management
	let addingDep = $state(false);
	let depTargetId = $state('');

	/** All nodes in the current view that could be dependency targets (exclude self). */
	let depCandidates = $derived(
		ganttStore.rows.filter(r => r.id !== selectedTaskId)
	);

	function handleAddDependency() {
		if (!selectedTaskId || !depTargetId) return;
		ganttStore.addDependency(selectedTaskId, depTargetId);
		depTargetId = '';
		addingDep = false;
	}

	function handleRemoveDependency(targetId: string) {
		if (!selectedTaskId) return;
		ganttStore.removeDependency(selectedTaskId, targetId);
	}

	function handleDelete() {
		const id = selectedTaskId;
		if (!id) return;
		ganttStore.deleteTask(id);
	}

	function handleClose() {
		ganttStore.selectTask(null);
	}

	function handleStartDateChange(value: DateValue | undefined) {
		if (!selectedTaskId || !value) return;
		ganttStore.updateTask(selectedTaskId, { startDate: value.toString() });
	}

	function handleEndDateChange(value: DateValue | undefined) {
		if (!selectedTaskId || !value) return;
		ganttStore.updateTask(selectedTaskId, { endDate: value.toString() });
	}

	function isoToDateValue(iso: string): DateValue | undefined {
		try { return parseDate(iso); } catch { return undefined; }
	}

	/** Recursively collect todos from all descendants, tagged with their task name/id. */
	function collectChildTodos(node: import('$lib/types').GanttNode): { todo: import('$lib/types').Todo; taskId: string; taskName: string }[] {
		const result: { todo: import('$lib/types').Todo; taskId: string; taskName: string }[] = [];
		const walk = (n: import('$lib/types').GanttNode) => {
			for (const todo of n.todos ?? []) {
				result.push({ todo, taskId: n.id, taskName: n.name });
			}
			for (const child of n.children) walk(child);
		};
		for (const child of node.children) walk(child);
		return result;
	}
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
				oninput={handleNameInput}
				class="h-7 flex-1 border-0 bg-transparent p-0 text-sm font-medium focus-visible:ring-0 focus-visible:ring-offset-0"
			/>
			<Badge variant="secondary" class="shrink-0">{statusLabel}</Badge>

			<Tooltip.Provider>
				<Tooltip.Root>
					<Tooltip.Trigger>
						{#snippet child({ props })}
							<Button variant="ghost" size="icon" class="size-7 text-destructive hover:text-destructive" onclick={handleDelete} {...props}>
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
								onclick={handleClose}
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
				<Tabs.Trigger value="todos">Todos</Tabs.Trigger>
				<Tabs.Trigger value="dependencies">Dependencies</Tabs.Trigger>
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
									<Popover.Root>
										<Popover.Trigger>
											{#snippet child({ props })}
												<Button variant="outline" size="sm" class="w-full justify-start text-xs" {...props}>
													<CalendarIcon class="mr-2 size-3" />
													{selectedTask ? formatDisplayDate(selectedTask.startDate) : "—"}
												</Button>
											{/snippet}
										</Popover.Trigger>
										<Popover.Content class="w-auto p-0" align="start">
											<Calendar.Calendar
												type="single"
												value={selectedTask ? isoToDateValue(selectedTask.startDate) : undefined}
												onValueChange={handleStartDateChange}
											/>
										</Popover.Content>
									</Popover.Root>
								</div>
								<div class="space-y-1">
									<Label class="text-xs text-muted-foreground">End Date</Label>
									<Popover.Root>
										<Popover.Trigger>
											{#snippet child({ props })}
												<Button variant="outline" size="sm" class="w-full justify-start text-xs" {...props}>
													<CalendarIcon class="mr-2 size-3" />
													{selectedTask ? formatDisplayDate(selectedTask.endDate) : "—"}
												</Button>
											{/snippet}
										</Popover.Trigger>
										<Popover.Content class="w-auto p-0" align="start">
											<Calendar.Calendar
												type="single"
												value={selectedTask ? isoToDateValue(selectedTask.endDate) : undefined}
												onValueChange={handleEndDateChange}
											/>
										</Popover.Content>
									</Popover.Root>
								</div>
								<div class="space-y-1">
									<Label class="text-xs text-muted-foreground">Duration</Label>
									<Input
										value={duration}
										readonly
										class="h-8 text-xs"
									/>
								</div>
								<div class="flex items-center gap-2 pt-4">
									<Switch
										id="milestone"
										checked={isMilestone}
										onCheckedChange={handleMilestoneChange}
									/>
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
										type="single"
										value={progressValue}
										onValueChange={handleProgressChange}
										min={0}
										max={100}
										step={1}
										disabled={isAutoProgress}
										class="flex-1"
									/>
									<span class="w-10 text-right text-sm tabular-nums">{progressValue}%</span>
									{#if isAutoProgress}
										<span class="text-xs text-muted-foreground">(auto)</span>
									{/if}
								</div>
								<Progress value={progressValue} class="h-2" />
							</Card.Content>
						</Card.Root>

						<!-- Properties card -->
						<Card.Root>
							<Card.Header class="pb-2">
								<Card.Title class="text-sm">Properties</Card.Title>
							</Card.Header>
							<Card.Content class="space-y-3">
								<div class="space-y-1">
									<Label class="text-xs text-muted-foreground">Color</Label>
									<div class="flex gap-2">
										{#each taskColors as color (color)}
											<button
												class="size-6 rounded-full ring-offset-background transition-all hover:scale-110 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
												style="background-color: {color}"
												onclick={() => handleColorClick(color)}
												aria-label="Select color {color}"
											>
												{#if selectedColor === color}
													<CheckIcon class="m-auto size-3 text-white" />
												{/if}
											</button>
										{/each}
									</div>
								</div>

								<!-- Strict sequencing toggle — only show if task has dependencies -->
								{#if selectedTask && selectedTask.dependencies.length > 0}
									<div class="flex items-center gap-2 pt-2">
										<Switch
											id="require-deps"
											checked={selectedTask.requireDepsComplete ?? false}
											onCheckedChange={(checked) => {
												if (selectedTaskId) ganttStore.updateTask(selectedTaskId, { requireDepsComplete: checked });
											}}
										/>
										<div class="flex flex-col">
											<Label for="require-deps" class="text-xs cursor-pointer">Strict sequencing</Label>
											<span class="text-[10px] text-muted-foreground">Hide from Up Next until predecessors are 100% done</span>
										</div>
									</div>
								{/if}
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
							value={description}
							oninput={(e) => {
								const id = selectedTaskId;
								if (id) ganttStore.updateTask(id, { description: (e.target as HTMLTextAreaElement).value });
							}}
							placeholder="Write a description..."
							class="min-h-[160px] resize-none font-mono text-sm"
						/>
					</div>
				</ScrollArea.Root>
			</Tabs.Content>

			<!-- Todos tab -->
			<Tabs.Content value="todos" class="flex-1 overflow-hidden">
				<ScrollArea.Root class="h-full">
					<div class="space-y-1 p-4">
						{#if ganttStore.selectedTask}
							{#if isParent}
								<!-- Parent/epic: show aggregated todos from all children -->
								{@const childTodos = collectChildTodos(ganttStore.selectedTask)}
								{#each childTodos as entry (entry.todo.id)}
									<div class="flex items-center gap-2 rounded p-1 hover:bg-muted/50 group">
										<Checkbox
											id={entry.todo.id}
											checked={entry.todo.done}
											onCheckedChange={() => ganttStore.toggleTodo(entry.taskId, entry.todo.id)}
										/>
										<div class="flex min-w-0 flex-1 flex-col">
											<label
												for={entry.todo.id}
												class="cursor-pointer text-sm"
												class:line-through={entry.todo.done}
												class:text-muted-foreground={entry.todo.done}
											>
												{entry.todo.text}
											</label>
											<span class="text-[10px] text-muted-foreground">{entry.taskName}</span>
										</div>
										<Button
											variant="ghost"
											size="icon"
											class="size-6 text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-destructive"
											onclick={() => ganttStore.removeTodo(entry.taskId, entry.todo.id)}
										>
											<XIcon class="size-3" />
										</Button>
									</div>
								{/each}
								{#if childTodos.length === 0}
									<p class="py-4 text-center text-xs text-muted-foreground">No todos in child tasks</p>
								{/if}
							{:else}
								<!-- Leaf task: show own todos with add form -->
								{@const todos = ganttStore.selectedTask.todos ?? []}
								{#each todos as todo (todo.id)}
									<div class="flex items-center gap-2 rounded p-1 hover:bg-muted/50 group">
										<Checkbox
											id={todo.id}
											checked={todo.done}
											onCheckedChange={() => ganttStore.toggleTodo(ganttStore.selectedTaskId!, todo.id)}
										/>
										<label
											for={todo.id}
											class="flex-1 cursor-pointer text-sm"
											class:line-through={todo.done}
											class:text-muted-foreground={todo.done}
										>
											{todo.text}
										</label>
										<Button
											variant="ghost"
											size="icon"
											class="size-6 text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-destructive"
											onclick={() => ganttStore.removeTodo(ganttStore.selectedTaskId!, todo.id)}
										>
											<XIcon class="size-3" />
										</Button>
									</div>
								{/each}
								{#if todos.length === 0}
									<p class="py-4 text-center text-xs text-muted-foreground">No todos yet</p>
								{/if}
								<Separator class="my-2" />
								<form
									class="flex gap-2"
									onsubmit={(e) => {
										e.preventDefault();
										const form = e.target as HTMLFormElement;
										const input = form.elements.namedItem('new-todo') as HTMLInputElement;
										const text = input.value.trim();
										if (text && ganttStore.selectedTaskId) {
											ganttStore.addTodo(ganttStore.selectedTaskId, text);
											input.value = '';
										}
									}}
								>
									<Input
										name="new-todo"
										placeholder="Add a todo..."
										class="h-8 flex-1 text-xs"
									/>
									<Button type="submit" variant="outline" size="sm" class="text-xs">
										<PlusIcon class="mr-1 size-3" />
										Add
									</Button>
								</form>
							{/if}
						{/if}
					</div>
				</ScrollArea.Root>
			</Tabs.Content>

			<!-- Dependencies tab -->
			<Tabs.Content value="dependencies" class="flex-1 overflow-hidden">
				<ScrollArea.Root class="h-full">
					<div class="space-y-3 p-4">
						{#if resolvedDependencies.length === 0 && !addingDep}
							<p class="py-4 text-center text-xs text-muted-foreground">No dependencies</p>
						{:else}
							<Table.Root>
								<Table.Header>
									<Table.Row>
										<Table.Head class="text-xs">Depends On</Table.Head>
										<Table.Head class="text-xs">Type</Table.Head>
										<Table.Head class="w-10"></Table.Head>
									</Table.Row>
								</Table.Header>
								<Table.Body>
									{#each resolvedDependencies as dep (dep.targetId)}
										<Table.Row>
											<Table.Cell class="text-xs">{dep.name}</Table.Cell>
											<Table.Cell>
												<Badge variant="outline" class="text-xs">{dep.type}</Badge>
											</Table.Cell>
											<Table.Cell>
												<Button
													variant="ghost"
													size="icon"
													class="size-6 text-muted-foreground hover:text-destructive"
													onclick={() => handleRemoveDependency(dep.targetId)}
												>
													<XIcon class="size-3" />
												</Button>
											</Table.Cell>
										</Table.Row>
									{/each}
								</Table.Body>
							</Table.Root>
						{/if}

						{#if addingDep}
							<div class="flex items-center gap-2">
								<Select.Root type="single" bind:value={depTargetId}>
									<Select.Trigger class="flex-1 text-xs">
										{#if depTargetId}
											{@const target = depCandidates.find(r => r.id === depTargetId)}
											{target?.name ?? 'Select task'}
										{:else}
											Select task...
										{/if}
									</Select.Trigger>
									<Select.Content>
										{#each depCandidates as candidate (candidate.id)}
											<Select.Item value={candidate.id}>
												<span class="flex items-center gap-2">
													<span class="size-2 rounded-full" style="background-color: {candidate.color}"></span>
													{candidate.name}
												</span>
											</Select.Item>
										{/each}
									</Select.Content>
								</Select.Root>
								<Button size="sm" class="shrink-0 text-xs" onclick={handleAddDependency} disabled={!depTargetId}>
									Add
								</Button>
								<Button variant="ghost" size="sm" class="shrink-0 text-xs" onclick={() => { addingDep = false; depTargetId = ''; }}>
									Cancel
								</Button>
							</div>
						{:else}
							<Button variant="outline" size="sm" class="w-full text-xs" onclick={() => (addingDep = true)}>
								<PlusIcon class="mr-1 size-3" />
								Add Dependency
							</Button>
						{/if}
					</div>
				</ScrollArea.Root>
			</Tabs.Content>

		</Tabs.Root>
	{/if}
</div>
