<script lang="ts">
	import SunIcon from "@tabler/icons-svelte/icons/sun";
	import MoonIcon from "@tabler/icons-svelte/icons/moon";
	import MonitorIcon from "@tabler/icons-svelte/icons/device-desktop";
	import { setMode, resetMode, mode } from "mode-watcher";
	import * as DropdownMenu from "$lib/components/ui/dropdown-menu/index.js";
	import * as Sidebar from "$lib/components/ui/sidebar/index.js";
</script>

<DropdownMenu.Root>
	<DropdownMenu.Trigger>
		{#snippet child({ props })}
			<Sidebar.MenuButton tooltipContent="Toggle theme" {...props}>
				{#if mode.current === "light"}
					<SunIcon />
				{:else}
					<MoonIcon />
				{/if}
				<span>Theme</span>
			</Sidebar.MenuButton>
		{/snippet}
	</DropdownMenu.Trigger>
	<DropdownMenu.Content side="right" align="end">
		<DropdownMenu.Item onclick={() => setMode("light")}>
			<SunIcon class="size-4" />
			<span>Light</span>
		</DropdownMenu.Item>
		<DropdownMenu.Item onclick={() => setMode("dark")}>
			<MoonIcon class="size-4" />
			<span>Dark</span>
		</DropdownMenu.Item>
		<DropdownMenu.Item onclick={() => resetMode()}>
			<MonitorIcon class="size-4" />
			<span>System</span>
		</DropdownMenu.Item>
	</DropdownMenu.Content>
</DropdownMenu.Root>
