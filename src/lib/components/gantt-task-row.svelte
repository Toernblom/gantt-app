<script lang="ts">
	import ChevronRightIcon from "@tabler/icons-svelte/icons/chevron-right";
	import PlusIcon from "@tabler/icons-svelte/icons/plus";
	import PencilIcon from "@tabler/icons-svelte/icons/pencil";
	import TrashIcon from "@tabler/icons-svelte/icons/trash";

	import * as ContextMenu from "$lib/components/ui/context-menu/index.js";
	import { Badge } from "$lib/components/ui/badge/index.js";

	import { ganttStore } from "$lib/stores/gantt/index.js";
	import { dialogStore } from "$lib/stores/dialog/index.js";
	import { ROW_HEIGHT } from "$lib/types.js";
	import type { GanttRow } from "$lib/types.js";

	interface Props {
		row: GanttRow;
		/** For each ancestor level (0..level-1), true if the vertical guide line continues. */
		guides: boolean[];
		/** Whether this is the last child at its nesting level. */
		isLastChild: boolean;
	}

	let { row, guides, isLastChild }: Props = $props();

	// Indent: each level gets its own column.
	// Level 0 (epics) get a small left margin. Deeper levels get guide-line columns.
	const INDENT_UNIT = 20;   // px per nesting level
	const LEFT_PAD = 10;      // base left padding

	let isSelected = $derived(ganttStore.selectedTaskId === row.id);
	let isHovered = $derived(ganttStore.hoveredTaskId === row.id);

	let collapsedChildCount = $derived.by(() => {
		if (row.expanded || !row.hasChildren) return 0;
		const node = ganttStore.getNodeById(row.id);
		return node?.children.length ?? 0;
	});

	let clickTimer: ReturnType<typeof setTimeout> | null = null;

	function handleRowClick() {
		if (clickTimer) return;
		clickTimer = setTimeout(() => {
			ganttStore.selectTask(row.id);
			clickTimer = null;
		}, 200);
	}

	function handleDoubleClick() {
		if (clickTimer) {
			clearTimeout(clickTimer);
			clickTimer = null;
		}
		ganttStore.drillInto(row.id);
	}

	function handleToggleExpand(e: MouseEvent) {
		e.stopPropagation();
		ganttStore.toggleExpand(row.id);
	}

	function handleMouseEnter() {
		ganttStore.setHoveredTask(row.id);
	}

	function handleMouseLeave() {
		ganttStore.setHoveredTask(null);
	}
</script>

<ContextMenu.Root>
	<ContextMenu.Trigger>
		{#snippet child({ props })}
			<!-- svelte-ignore a11y_click_events_have_key_events -->
			<!-- svelte-ignore a11y_interactive_supports_focus -->
			<div
				{...props}
				role="row"
				data-row-id={row.id}
				style="height: {ROW_HEIGHT}px;"
				class="relative flex cursor-pointer items-center overflow-hidden pr-2
					[transition:background-color_120ms]
					{isSelected
					? 'bg-accent/60 text-accent-foreground'
					: isHovered
					? 'bg-muted/40'
					: 'hover:bg-muted/30'}"
				onclick={handleRowClick}
				ondblclick={handleDoubleClick}
				onmouseenter={handleMouseEnter}
				onmouseleave={handleMouseLeave}
			>
				<!-- ========== Tree indent guides ========== -->
				<!-- Vertical lines for each ancestor level that has more siblings below -->
				{#each guides as continues, lvl}
					{#if continues}
						<span
							class="absolute top-0 h-full border-l border-border/40"
							style="left: {LEFT_PAD + lvl * INDENT_UNIT + 8}px;"
						></span>
					{/if}
				{/each}

				<!-- Horizontal branch connector at this row's level (for non-root rows) -->
				{#if row.level > 0}
					{@const branchLeft = LEFT_PAD + (row.level - 1) * INDENT_UNIT + 8}
					<!-- Vertical part: half-height if last child, full-height if not -->
					<span
						class="absolute border-l border-border/40"
						style="left: {branchLeft}px; top: 0; height: {isLastChild ? '50%' : '100%'};"
					></span>
					<!-- Horizontal part: connects to the chevron/name -->
					<span
						class="absolute border-t border-border/40"
						style="left: {branchLeft}px; top: 50%; width: {INDENT_UNIT - 4}px;"
					></span>
				{/if}

				<!-- ========== Row content ========== -->
				<div
					class="relative flex items-center gap-1.5"
					style="padding-left: {LEFT_PAD + row.level * INDENT_UNIT}px;"
				>
					<!-- Expand/collapse toggle -->
					{#if row.hasChildren}
						<button
							class="flex size-[18px] shrink-0 items-center justify-center rounded-sm
								border border-border/60 bg-background text-muted-foreground
								hover:border-border hover:bg-muted hover:text-foreground
								[transition:all_120ms]"
							onclick={handleToggleExpand}
							aria-label={row.expanded ? "Collapse" : "Expand"}
						>
							<ChevronRightIcon
								class="size-3 transition-transform duration-150
									{row.expanded ? 'rotate-90' : ''}"
							/>
						</button>
					{:else}
						<span class="size-[18px] shrink-0"></span>
					{/if}

					<!-- Color dot for nodes with children (group headers) -->
					{#if row.hasChildren}
						<span
							class="size-2.5 shrink-0 rounded-full ring-1 ring-white/20"
							style="background-color: {row.color}"
						></span>
					{/if}

					<!-- Task name -->
					<span
						class="min-w-0 flex-1 truncate
							{row.hasChildren
								? 'text-[13px] font-semibold text-foreground'
								: 'text-[13px] text-foreground/90'}"
					>
						{row.name}
					</span>

					<!-- Collapsed child count badge -->
					{#if !row.expanded && row.hasChildren && collapsedChildCount > 0}
						<Badge
							variant="secondary"
							class="ml-1 shrink-0 px-1.5 py-0 text-[10px] tabular-nums leading-tight"
						>
							{collapsedChildCount}
						</Badge>
					{/if}
				</div>
			</div>
		{/snippet}
	</ContextMenu.Trigger>

	<ContextMenu.Content class="w-44">
		<ContextMenu.Item onclick={() => dialogStore.requestCreate(row.id)}>
			<PlusIcon class="mr-2 size-4" />
			<span>Add Sub-task</span>
		</ContextMenu.Item>
		<ContextMenu.Item onclick={() => dialogStore.requestEdit(row.id)}>
			<PencilIcon class="mr-2 size-4" />
			<span>Edit</span>
		</ContextMenu.Item>
		<ContextMenu.Separator />
		<ContextMenu.Item
			class="text-destructive focus:text-destructive"
			onclick={() => ganttStore.deleteTask(row.id)}
		>
			<TrashIcon class="mr-2 size-4" />
			<span>Delete</span>
		</ContextMenu.Item>
	</ContextMenu.Content>
</ContextMenu.Root>
