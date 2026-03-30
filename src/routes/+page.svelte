<script lang="ts">
  import * as Resizable from "$lib/components/ui/resizable/index.js";
  import GanttPane from "$lib/components/gantt-pane.svelte";
  import DetailPane from "$lib/components/detail-pane.svelte";
</script>

<Resizable.PaneGroup direction="vertical" class="h-[calc(100vh-1px)]">
  <Resizable.Pane defaultSize={65} minSize={30}>
    <GanttPane />
  </Resizable.Pane>
  <Resizable.Handle withHandle />
  <Resizable.Pane defaultSize={35} minSize={15}>
    <DetailPane />
  </Resizable.Pane>
</Resizable.PaneGroup>
