<script lang="ts">
  import * as Resizable from "$lib/components/ui/resizable/index.js";
  import GanttPane from "$lib/components/gantt-pane.svelte";
  import DetailPane from "$lib/components/detail-pane.svelte";
  import PriorityPane from "$lib/components/priority-pane.svelte";
</script>

<Resizable.PaneGroup direction="horizontal" class="h-[calc(100vh-1px)]">
  <!-- Left: existing gantt + detail vertical split -->
  <Resizable.Pane defaultSize={75} minSize={40}>
    <Resizable.PaneGroup direction="vertical" class="h-full">
      <Resizable.Pane defaultSize={65} minSize={30}>
        <GanttPane />
      </Resizable.Pane>
      <Resizable.Handle withHandle />
      <Resizable.Pane defaultSize={35} minSize={15}>
        <DetailPane />
      </Resizable.Pane>
    </Resizable.PaneGroup>
  </Resizable.Pane>
  <Resizable.Handle withHandle />
  <!-- Right: priority pane -->
  <Resizable.Pane defaultSize={25} minSize={15} maxSize={40}>
    <PriorityPane />
  </Resizable.Pane>
</Resizable.PaneGroup>
