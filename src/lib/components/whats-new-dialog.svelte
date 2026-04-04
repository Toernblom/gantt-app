<script lang="ts">
	import SparklesIcon from "@tabler/icons-svelte/icons/sparkles";

	import * as Dialog from "$lib/components/ui/dialog/index.js";
	import { Button } from "$lib/components/ui/button/index.js";
	import { Separator } from "$lib/components/ui/separator/index.js";

	import { updaterStore } from "$lib/stores/updater/index.js";
</script>

<Dialog.Root
	open={updaterStore.showChangelog}
	onOpenChange={(open) => { if (!open) updaterStore.dismissChangelog(); }}
>
	<Dialog.Content class="sm:max-w-[480px]">
		<Dialog.Header>
			<Dialog.Title class="flex items-center gap-2">
				<SparklesIcon class="size-5 text-primary" />
				v{updaterStore.updatedToVersion}
			</Dialog.Title>
			<Dialog.Description>
				Here's what's new in this version
			</Dialog.Description>
		</Dialog.Header>

		{#if updaterStore.changelogBody}
			<Separator />
			<div class="max-h-[300px] overflow-y-auto text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">
				{updaterStore.changelogBody}
			</div>
		{:else}
			<Separator />
			<p class="text-sm text-muted-foreground">
				This update includes bug fixes and improvements.
			</p>
		{/if}

		<Dialog.Footer>
			<Button onclick={() => updaterStore.dismissChangelog()}>
				Got it
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
