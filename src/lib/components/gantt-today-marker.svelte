<script lang="ts">
	import type { ScaleTime } from 'd3-scale';

	interface Props {
		timeScale: ScaleTime<number, number>;
		totalHeight: number;
	}

	let { timeScale, totalHeight }: Props = $props();

	const TODAY_COLOR = '#ef4444';

	let x = $derived(timeScale(new Date()));
	let visible = $derived(x >= 0 && x <= timeScale.range()[1]);
</script>

{#if visible}
	<line
		x1={x}
		y1={0}
		x2={x}
		y2={totalHeight}
		stroke={TODAY_COLOR}
		stroke-width="2"
		stroke-dasharray="6,4"
		opacity="0.8"
	/>
	<text
		x={x}
		y={12}
		text-anchor="middle"
		font-size="10"
		fill={TODAY_COLOR}
		font-weight="bold"
	>Today</text>
{/if}
