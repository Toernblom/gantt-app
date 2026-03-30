<script lang="ts">
	import FolderOpenIcon from "@tabler/icons-svelte/icons/folder-open";
	import GanttChartIcon from "@tabler/icons-svelte/icons/chart-bar";
	import PlusIcon from "@tabler/icons-svelte/icons/plus";
	import SettingsIcon from "@tabler/icons-svelte/icons/settings";
	import LayoutGridIcon from "@tabler/icons-svelte/icons/layout-grid";

	import * as Command from "$lib/components/ui/command/index.js";

	let open = $state(false);

	function handleKeydown(e: KeyboardEvent) {
		if ((e.metaKey || e.ctrlKey) && e.key === "k") {
			e.preventDefault();
			open = !open;
		}
	}
</script>

<svelte:window onkeydown={handleKeydown} />

<Command.Dialog bind:open title="Command Palette" description="Search for a command to run...">
	<Command.Input placeholder="Type a command or search..." />
	<Command.List>
		<Command.Empty>No results found.</Command.Empty>

		<Command.Group heading="Actions">
			<Command.Item onSelect={() => (open = false)}>
				<PlusIcon class="mr-2 size-4" />
				<span>New Task</span>
			</Command.Item>
			<Command.Item onSelect={() => (open = false)}>
				<LayoutGridIcon class="mr-2 size-4" />
				<span>New Epic</span>
			</Command.Item>
			<Command.Item onSelect={() => (open = false)}>
				<FolderOpenIcon class="mr-2 size-4" />
				<span>Open Project...</span>
			</Command.Item>
		</Command.Group>

		<Command.Separator />

		<Command.Group heading="Navigation">
			<Command.Item onSelect={() => (open = false)}>
				<GanttChartIcon class="mr-2 size-4" />
				<span>Gantt Chart</span>
			</Command.Item>
			<Command.Item onSelect={() => (open = false)}>
				<SettingsIcon class="mr-2 size-4" />
				<span>Settings</span>
			</Command.Item>
		</Command.Group>
	</Command.List>
</Command.Dialog>
