<script lang="ts">
	import CalendarIcon from "@tabler/icons-svelte/icons/calendar";
	import CheckIcon from "@tabler/icons-svelte/icons/check";

	import * as Dialog from "$lib/components/ui/dialog/index.js";
	import * as Select from "$lib/components/ui/select/index.js";
	import * as Popover from "$lib/components/ui/popover/index.js";
	import * as Calendar from "$lib/components/ui/calendar/index.js";
	import { Input } from "$lib/components/ui/input/index.js";
	import { Label } from "$lib/components/ui/label/index.js";
	import { Button } from "$lib/components/ui/button/index.js";
	import { Separator } from "$lib/components/ui/separator/index.js";
	import { Switch } from "$lib/components/ui/switch/index.js";

	import { dialogStore } from "$lib/stores/dialog/index.js";
</script>

<Dialog.Root
	open={dialogStore.open}
	onOpenChange={(open) => { if (!open) dialogStore.close(); }}
>
	<Dialog.Content class="sm:max-w-[480px]">
		<Dialog.Header>
			<Dialog.Title>
				{dialogStore.mode === "edit"
					? "Edit Task"
					: dialogStore.hasPresetParent
						? "Add Sub-task"
						: "Create New Task"}
			</Dialog.Title>
			<Dialog.Description>
				{dialogStore.mode === "edit"
					? "Update the details for this task"
					: dialogStore.hasPresetParent
						? "Add a child task"
						: "Add a task to your project"}
			</Dialog.Description>
		</Dialog.Header>

		<!-- Form body -->
		<div class="flex flex-col gap-4">
			<!-- Task Name -->
			<div class="flex flex-col gap-1.5">
				<Label for="task-name">Task Name</Label>
				<Input
					id="task-name"
					bind:value={dialogStore.taskName}
					placeholder="Enter task name…"
					class="w-full"
				/>
			</div>

			<!-- Parent selector — hidden when adding as a sub-task (parent already set) -->
			{#if !dialogStore.hasPresetParent}
				<Separator />
				<div class="flex flex-col gap-1.5">
					<Label>Parent</Label>
					<Select.Root type="single" bind:value={dialogStore.selectedEpicId}>
						<Select.Trigger class="w-full">
							{#if dialogStore.selectedEpicId}
								{@const epic = dialogStore.epicOptions.find((e) => e.id === dialogStore.selectedEpicId)}
								{#if epic}
									<span class="flex items-center gap-2">
										<span
											class="size-2.5 shrink-0 rounded-full"
											style="background-color: {epic.color}"
										></span>
										{epic.name}
									</span>
								{:else}
									None (top level)
								{/if}
							{:else}
								None (top level)
							{/if}
						</Select.Trigger>
						<Select.Content>
							<Select.Item value="">
								<span class="text-muted-foreground">None (top level)</span>
							</Select.Item>
							{#if dialogStore.epicOptions.length > 0}
								<Separator class="my-1" />
							{/if}
							{#each dialogStore.epicOptions as epic (epic.id)}
								<Select.Item value={epic.id}>
									<span class="flex items-center gap-2">
										<span
											class="size-2.5 shrink-0 rounded-full"
											style="background-color: {epic.color}"
										></span>
										{epic.name}
									</span>
								</Select.Item>
							{/each}
						</Select.Content>
					</Select.Root>
				</div>
			{/if}

			<!-- Dates -->
			<div class="grid grid-cols-2 gap-3">
				<!-- Start Date -->
				<div class="flex flex-col gap-1.5">
					<Label>Start Date</Label>
					<Popover.Root bind:open={dialogStore.startPopoverOpen}>
						<Popover.Trigger>
							{#snippet child({ props })}
								<Button
									variant="outline"
									class="w-full justify-start text-left font-normal"
									{...props}
								>
									<CalendarIcon class="mr-2 size-4 shrink-0 opacity-70" />
									<span class={!dialogStore.startDateValue ? "text-muted-foreground" : ""}>
										{dialogStore.formatDateDisplay(dialogStore.startDateValue)}
									</span>
								</Button>
							{/snippet}
						</Popover.Trigger>
						<Popover.Content class="w-auto p-0" align="start">
							<Calendar.Calendar
								type="single"
								bind:value={dialogStore.startDateValue}
								onValueChange={() => {
									dialogStore.startPopoverOpen = false;
								}}
							/>
						</Popover.Content>
					</Popover.Root>
				</div>

				<!-- End Date -->
				<div class="flex flex-col gap-1.5">
					<Label>End Date</Label>
					<Popover.Root bind:open={dialogStore.endPopoverOpen}>
						<Popover.Trigger>
							{#snippet child({ props })}
								<Button
									variant="outline"
									class="w-full justify-start text-left font-normal"
									{...props}
								>
									<CalendarIcon class="mr-2 size-4 shrink-0 opacity-70" />
									<span class={!dialogStore.endDateValue ? "text-muted-foreground" : ""}>
										{#if dialogStore.isMilestone}
											Same as start
										{:else}
											{dialogStore.formatDateDisplay(dialogStore.endDateValue)}
										{/if}
									</span>
								</Button>
							{/snippet}
						</Popover.Trigger>
						{#if !dialogStore.isMilestone}
							<Popover.Content class="w-auto p-0" align="start">
								<Calendar.Calendar
									type="single"
									bind:value={dialogStore.endDateValue}
									onValueChange={() => {
										dialogStore.endPopoverOpen = false;
									}}
								/>
							</Popover.Content>
						{/if}
					</Popover.Root>
				</div>
			</div>

			<Separator />

			<!-- Milestone toggle -->
			<div class="flex items-center justify-between">
				<div class="flex flex-col gap-0.5">
					<Label for="milestone-switch" class="cursor-pointer">Milestone</Label>
					<span class="text-xs text-muted-foreground">
						A milestone has no duration — start and end are the same day
					</span>
				</div>
				<Switch id="milestone-switch" bind:checked={dialogStore.isMilestone} />
			</div>

			<!-- Color picker -->
			<div class="flex flex-col gap-1.5">
				<Label>Color</Label>
				<div class="flex gap-2">
					{#each dialogStore.taskColors as color (color)}
						<button
							class="size-7 rounded-full ring-offset-background transition-all hover:scale-110 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
							style="background-color: {color}"
							onclick={() => (dialogStore.selectedColor = color)}
							aria-label="Select color {color}"
						>
							{#if dialogStore.selectedColor === color}
								<CheckIcon class="m-auto size-4 text-white" />
							{/if}
						</button>
					{/each}
				</div>
			</div>
		</div>

		<!-- Footer -->
		<Dialog.Footer>
			<Button variant="outline" onclick={() => dialogStore.close()}>Cancel</Button>
			<Button onclick={() => dialogStore.submit()}>
				{dialogStore.mode === "create" ? "Create Task" : "Save Changes"}
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
