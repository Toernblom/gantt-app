<script lang="ts">
	import { ganttStore } from '$lib/stores/gantt/index.js';
	import GanttTaskRow from './gantt-task-row.svelte';
</script>

<div>
	{#each ganttStore.rows as row, i (row.id)}
		<GanttTaskRow {row} guides={ganttStore.rowContexts[i].guides} isLastChild={ganttStore.rowContexts[i].isLast} />
	{/each}
</div>
