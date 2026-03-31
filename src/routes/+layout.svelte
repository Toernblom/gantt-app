<script lang="ts">
  import "../routes/layout.css";
  import { ModeWatcher } from "mode-watcher";
  import * as Sidebar from "$lib/components/ui/sidebar/index.js";
  import { Toaster } from "$lib/components/ui/sonner/index.js";
  import AppSidebar from "$lib/components/app-sidebar.svelte";
  import CommandPalette from "$lib/components/command-palette.svelte";
  import { updaterStore } from "$lib/stores/updater/index.js";

  let { children } = $props();

  // Check for updates on startup (silent — only shows UI when update is available)
  updaterStore.check();
</script>

<svelte:head>
  <title>Gantt App</title>
</svelte:head>

<Sidebar.Provider style="--sidebar-width: calc(var(--spacing) * 64);">
  <AppSidebar />
  <Sidebar.Inset class="overflow-hidden">
    {@render children()}
  </Sidebar.Inset>
</Sidebar.Provider>

<ModeWatcher defaultMode="dark" />
<CommandPalette />
<Toaster />
