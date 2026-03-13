<script lang="ts">
	import RoomCanvas from '$lib/components/RoomCanvas.svelte';
	import Sidebar from '$lib/components/Sidebar.svelte';
	import { store } from '$lib/store.svelte';
</script>

<div class="h-[100dvh] flex flex-col">
	<!-- Mobile header with toggle -->
	<div class="md:hidden flex items-center justify-between px-4 py-2 bg-[var(--color-surface)] border-b border-[var(--color-border)]">
		<h1 class="text-sm font-bold">Floor Planner</h1>
		<button
			class="px-4 py-2 text-sm rounded-lg bg-[var(--color-accent)] text-white font-medium active:bg-[var(--color-accent-hover)]"
			onclick={() => (store.sidebarOpen = !store.sidebarOpen)}
		>
			{store.sidebarOpen ? 'Canvas' : 'Settings'}
		</button>
	</div>

	<!-- Desktop: side-by-side -->
	<div class="flex-1 hidden md:flex overflow-hidden">
		<div class="flex-1 min-w-0">
			<RoomCanvas />
		</div>
		<div class="w-[380px] min-w-[340px] flex-shrink-0">
			<Sidebar />
		</div>
	</div>

	<!-- Mobile: stacked with toggle -->
	<div class="flex-1 flex flex-col md:hidden overflow-hidden">
		{#if store.sidebarOpen}
			<div class="flex-1 overflow-y-auto">
				<Sidebar />
			</div>
		{:else}
			<div class="flex-1 min-h-0">
				<RoomCanvas />
			</div>
		{/if}
	</div>
</div>
