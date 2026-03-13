<script lang="ts">
	import { store } from '$lib/store.svelte';
	import { createRectangle, createLShape, wallLength, angleBetweenWalls } from '$lib/geometry';
	import type { Point } from '$lib/types';

	let expandedSections = $state<Record<string, boolean>>({
		room: true,
		plank: true,
		pattern: true,
		direction: true,
		results: true
	});

	function toggleSection(key: string) {
		expandedSections[key] = !expandedSections[key];
	}

	// Preset handling
	let presetType = $state('rectangle');
	let presetW = $state(4000);
	let presetH = $state(3000);
	let presetW2 = $state(2000);
	let presetH2 = $state(1500);

	function applyPreset() {
		if (presetType === 'rectangle') {
			store.setVertices(createRectangle(presetW, presetH));
		} else if (presetType === 'lshape') {
			store.setVertices(createLShape(presetW, presetH, presetW2, presetH2));
		}
		store.isDrawing = false;
		store.resetZoom();
	}

	// Table editing
	function updateVertexX(i: number, val: string) {
		const x = parseFloat(val);
		if (!isNaN(x)) store.updateVertex(i, { ...store.vertices[i], x });
	}

	function updateVertexY(i: number, val: string) {
		const y = parseFloat(val);
		if (!isNaN(y)) store.updateVertex(i, { ...store.vertices[i], y });
	}

	function addVertexAtEnd() {
		const last = store.vertices[store.vertices.length - 1] || { x: 0, y: 0 };
		store.addVertex({ x: last.x + 500, y: last.y });
	}

	// Common plank sizes
	const plankPresets = [
		{ label: '1220 x 185 mm', length: 1220, width: 185 },
		{ label: '1380 x 193 mm', length: 1380, width: 193 },
		{ label: '1285 x 192 mm', length: 1285, width: 192 },
		{ label: '1200 x 180 mm', length: 1200, width: 180 },
		{ label: '915 x 152 mm', length: 915, width: 152 }
	];

	function applyPlankPreset(preset: { length: number; width: number }) {
		store.plank = { ...store.plank, length: preset.length, width: preset.width };
	}

	// Results formatting
	function formatArea(mm2: number): string {
		return (mm2 / 1_000_000).toFixed(2);
	}

	const patternOptions: { value: typeof store.pattern; label: string; icon: string }[] = [
		{ value: 'staggered', label: 'Staggered', icon: '⬡' },
		{ value: 'straight', label: 'Straight', icon: '▦' },
		{ value: 'herringbone', label: 'Herringbone', icon: '⧖' }
	];
</script>

<div class="h-full overflow-y-auto bg-[var(--color-surface)] border-l border-[var(--color-border)]">
	<!-- Header -->
	<div class="px-4 py-4 border-b border-[var(--color-border)]">
		<h1 class="text-lg font-bold text-[var(--color-text)]">Floor Planner</h1>
		<p class="text-xs text-[var(--color-text-muted)] mt-0.5">Laminate & Vinyl Plank Layout</p>
	</div>

	<!-- Room Shape Section -->
	<div class="border-b border-[var(--color-border)]">
		<button
			class="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold text-[var(--color-text)] hover:bg-[var(--color-surface-hover)] transition-colors"
			onclick={() => toggleSection('room')}
		>
			<span>Room Shape</span>
			<span class="text-[var(--color-text-muted)] text-xs">{expandedSections.room ? '▼' : '▶'}</span>
		</button>
		{#if expandedSections.room}
			<div class="px-4 pb-4 space-y-3">
				<!-- Presets -->
				<div>
					<label class="block text-xs text-[var(--color-text-muted)] mb-1">Preset</label>
					<div class="flex gap-2">
						<select
							bind:value={presetType}
							class="flex-1 bg-[var(--color-bg)] border border-[var(--color-border)] rounded px-2 py-1.5 text-sm text-[var(--color-text)]"
						>
							<option value="rectangle">Rectangle</option>
							<option value="lshape">L-Shape</option>
						</select>
						<button
							class="px-3 py-1.5 bg-[var(--color-accent)] text-white text-sm rounded hover:bg-[var(--color-accent-hover)] transition-colors"
							onclick={applyPreset}
						>
							Apply
						</button>
					</div>
				</div>

				<!-- Preset dimensions -->
				<div class="grid grid-cols-2 gap-2">
					<div>
						<label class="block text-xs text-[var(--color-text-muted)] mb-1">Width (mm)</label>
						<input
							type="number"
							bind:value={presetW}
							class="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded px-2 py-1.5 text-sm text-[var(--color-text)]"
						/>
					</div>
					<div>
						<label class="block text-xs text-[var(--color-text-muted)] mb-1">Height (mm)</label>
						<input
							type="number"
							bind:value={presetH}
							class="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded px-2 py-1.5 text-sm text-[var(--color-text)]"
						/>
					</div>
				</div>

				{#if presetType === 'lshape'}
					<div class="grid grid-cols-2 gap-2">
						<div>
							<label class="block text-xs text-[var(--color-text-muted)] mb-1">Notch W (mm)</label>
							<input
								type="number"
								bind:value={presetW2}
								class="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded px-2 py-1.5 text-sm text-[var(--color-text)]"
							/>
						</div>
						<div>
							<label class="block text-xs text-[var(--color-text-muted)] mb-1">Notch H (mm)</label>
							<input
								type="number"
								bind:value={presetH2}
								class="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded px-2 py-1.5 text-sm text-[var(--color-text)]"
							/>
						</div>
					</div>
				{/if}

				<!-- Vertex Table -->
				<div>
					<label class="block text-xs text-[var(--color-text-muted)] mb-1">Vertices</label>
					<div class="space-y-1 max-h-48 overflow-y-auto">
						{#each store.vertices as vertex, i}
							<div class="flex items-center gap-1">
								<span class="text-xs text-[var(--color-text-muted)] w-5 text-right">{i + 1}</span>
								<input
									type="number"
									value={Math.round(vertex.x)}
									onchange={(e) => updateVertexX(i, (e.target as HTMLInputElement).value)}
									class="flex-1 bg-[var(--color-bg)] border border-[var(--color-border)] rounded px-2 py-1 text-xs text-[var(--color-text)] w-0"
									placeholder="X"
								/>
								<input
									type="number"
									value={Math.round(vertex.y)}
									onchange={(e) => updateVertexY(i, (e.target as HTMLInputElement).value)}
									class="flex-1 bg-[var(--color-bg)] border border-[var(--color-border)] rounded px-2 py-1 text-xs text-[var(--color-text)] w-0"
									placeholder="Y"
								/>
								<button
									class="text-xs text-red-400 hover:text-red-300 px-1 disabled:opacity-30"
									onclick={() => store.removeVertex(i)}
									disabled={store.vertices.length <= 3}
									title="Remove vertex"
								>
									✕
								</button>
							</div>
						{/each}
					</div>
					<button
						class="mt-2 w-full text-xs text-[var(--color-accent)] hover:text-[var(--color-accent-hover)] py-1 border border-dashed border-[var(--color-border)] rounded hover:border-[var(--color-accent)] transition-colors"
						onclick={addVertexAtEnd}
					>
						+ Add Vertex
					</button>
				</div>

				<!-- Wall info -->
				{#if store.vertices.length >= 3}
					<div>
						<label class="block text-xs text-[var(--color-text-muted)] mb-1">Walls</label>
						<div class="space-y-0.5 text-xs text-[var(--color-text-muted)]">
							{#each store.vertices as v, i}
								{@const next = store.vertices[(i + 1) % store.vertices.length]}
								{@const len = wallLength(v, next)}
								<div class="flex justify-between">
									<span>Wall {i + 1}→{((i + 1) % store.vertices.length) + 1}</span>
									<span class="text-[var(--color-text)]">
										{len >= 1000 ? `${(len / 1000).toFixed(2)} m` : `${Math.round(len)} mm`}
									</span>
								</div>
							{/each}
						</div>
					</div>
				{/if}
			</div>
		{/if}
	</div>

	<!-- Plank Dimensions Section -->
	<div class="border-b border-[var(--color-border)]">
		<button
			class="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold text-[var(--color-text)] hover:bg-[var(--color-surface-hover)] transition-colors"
			onclick={() => toggleSection('plank')}
		>
			<span>Plank Dimensions</span>
			<span class="text-[var(--color-text-muted)] text-xs">{expandedSections.plank ? '▼' : '▶'}</span>
		</button>
		{#if expandedSections.plank}
			<div class="px-4 pb-4 space-y-3">
				<!-- Presets -->
				<div>
					<label class="block text-xs text-[var(--color-text-muted)] mb-1">Common Sizes</label>
					<div class="flex flex-wrap gap-1">
						{#each plankPresets as preset}
							<button
								class="text-xs px-2 py-1 rounded border transition-colors
									{store.plank.length === preset.length && store.plank.width === preset.width
									? 'border-[var(--color-accent)] text-[var(--color-accent)] bg-[var(--color-accent)]/10'
									: 'border-[var(--color-border)] text-[var(--color-text-muted)] hover:border-[var(--color-accent)]'}"
								onclick={() => applyPlankPreset(preset)}
							>
								{preset.label}
							</button>
						{/each}
					</div>
				</div>

				<div class="grid grid-cols-2 gap-2">
					<div>
						<label class="block text-xs text-[var(--color-text-muted)] mb-1">Length (mm)</label>
						<input
							type="number"
							bind:value={store.plank.length}
							min="100"
							max="5000"
							class="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded px-2 py-1.5 text-sm text-[var(--color-text)]"
						/>
					</div>
					<div>
						<label class="block text-xs text-[var(--color-text-muted)] mb-1">Width (mm)</label>
						<input
							type="number"
							bind:value={store.plank.width}
							min="50"
							max="1000"
							class="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded px-2 py-1.5 text-sm text-[var(--color-text)]"
						/>
					</div>
				</div>

				<div>
					<label class="block text-xs text-[var(--color-text-muted)] mb-1">Planks per Pack</label>
					<input
						type="number"
						bind:value={store.plank.perPack}
						min="1"
						max="100"
						class="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded px-2 py-1.5 text-sm text-[var(--color-text)]"
					/>
				</div>
			</div>
		{/if}
	</div>

	<!-- Laying Pattern Section -->
	<div class="border-b border-[var(--color-border)]">
		<button
			class="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold text-[var(--color-text)] hover:bg-[var(--color-surface-hover)] transition-colors"
			onclick={() => toggleSection('pattern')}
		>
			<span>Laying Pattern</span>
			<span class="text-[var(--color-text-muted)] text-xs">{expandedSections.pattern ? '▼' : '▶'}</span>
		</button>
		{#if expandedSections.pattern}
			<div class="px-4 pb-4 space-y-3">
				<div class="grid grid-cols-3 gap-2">
					{#each patternOptions as opt}
						<button
							class="flex flex-col items-center gap-1 px-2 py-3 rounded border transition-colors
								{store.pattern === opt.value
								? 'border-[var(--color-accent)] bg-[var(--color-accent)]/10 text-[var(--color-accent)]'
								: 'border-[var(--color-border)] text-[var(--color-text-muted)] hover:border-[var(--color-accent)]'}"
							onclick={() => (store.pattern = opt.value)}
						>
							<!-- Pattern preview SVG -->
							<svg viewBox="0 0 40 30" class="w-10 h-8">
								{#if opt.value === 'staggered'}
									<rect x="0" y="0" width="18" height="8" rx="0.5" fill="currentColor" opacity="0.6" stroke="currentColor" stroke-width="0.5" />
									<rect x="20" y="0" width="18" height="8" rx="0.5" fill="currentColor" opacity="0.6" stroke="currentColor" stroke-width="0.5" />
									<rect x="8" y="10" width="18" height="8" rx="0.5" fill="currentColor" opacity="0.6" stroke="currentColor" stroke-width="0.5" />
									<rect x="28" y="10" width="12" height="8" rx="0.5" fill="currentColor" opacity="0.4" stroke="currentColor" stroke-width="0.5" />
									<rect x="0" y="20" width="18" height="8" rx="0.5" fill="currentColor" opacity="0.6" stroke="currentColor" stroke-width="0.5" />
									<rect x="20" y="20" width="18" height="8" rx="0.5" fill="currentColor" opacity="0.6" stroke="currentColor" stroke-width="0.5" />
								{:else if opt.value === 'straight'}
									<rect x="0" y="0" width="18" height="8" rx="0.5" fill="currentColor" opacity="0.6" stroke="currentColor" stroke-width="0.5" />
									<rect x="20" y="0" width="18" height="8" rx="0.5" fill="currentColor" opacity="0.6" stroke="currentColor" stroke-width="0.5" />
									<rect x="0" y="10" width="18" height="8" rx="0.5" fill="currentColor" opacity="0.6" stroke="currentColor" stroke-width="0.5" />
									<rect x="20" y="10" width="18" height="8" rx="0.5" fill="currentColor" opacity="0.6" stroke="currentColor" stroke-width="0.5" />
									<rect x="0" y="20" width="18" height="8" rx="0.5" fill="currentColor" opacity="0.6" stroke="currentColor" stroke-width="0.5" />
									<rect x="20" y="20" width="18" height="8" rx="0.5" fill="currentColor" opacity="0.6" stroke="currentColor" stroke-width="0.5" />
								{:else}
									<rect x="5" y="2" width="12" height="5" rx="0.5" fill="currentColor" opacity="0.6" stroke="currentColor" stroke-width="0.5" />
									<rect x="18" y="5" width="5" height="12" rx="0.5" fill="currentColor" opacity="0.6" stroke="currentColor" stroke-width="0.5" />
									<rect x="5" y="14" width="12" height="5" rx="0.5" fill="currentColor" opacity="0.6" stroke="currentColor" stroke-width="0.5" />
									<rect x="24" y="2" width="12" height="5" rx="0.5" fill="currentColor" opacity="0.6" stroke="currentColor" stroke-width="0.5" />
									<rect x="24" y="14" width="12" height="5" rx="0.5" fill="currentColor" opacity="0.6" stroke="currentColor" stroke-width="0.5" />
									<rect x="18" y="18" width="5" height="10" rx="0.5" fill="currentColor" opacity="0.4" stroke="currentColor" stroke-width="0.5" />
								{/if}
							</svg>
							<span class="text-xs font-medium">{opt.label}</span>
						</button>
					{/each}
				</div>

				{#if store.pattern === 'staggered'}
					<div>
						<label class="block text-xs text-[var(--color-text-muted)] mb-1">
							Row Offset: {Math.round(store.staggerOffset * 100)}%
						</label>
						<input
							type="range"
							min="0.1"
							max="0.5"
							step="0.01"
							bind:value={store.staggerOffset}
							class="w-full accent-[var(--color-accent)]"
						/>
						<div class="flex justify-between text-xs text-[var(--color-text-muted)] mt-1">
							<button class="hover:text-[var(--color-accent)]" onclick={() => (store.staggerOffset = 0.25)}>¼</button>
							<button class="hover:text-[var(--color-accent)]" onclick={() => (store.staggerOffset = 0.333)}>⅓</button>
							<button class="hover:text-[var(--color-accent)]" onclick={() => (store.staggerOffset = 0.5)}>½</button>
						</div>
					</div>
				{/if}
			</div>
		{/if}
	</div>

	<!-- Laying Direction Section -->
	<div class="border-b border-[var(--color-border)]">
		<button
			class="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold text-[var(--color-text)] hover:bg-[var(--color-surface-hover)] transition-colors"
			onclick={() => toggleSection('direction')}
		>
			<span>Laying Direction</span>
			<span class="text-[var(--color-text-muted)] text-xs">{expandedSections.direction ? '▼' : '▶'}</span>
		</button>
		{#if expandedSections.direction}
			<div class="px-4 pb-4 space-y-3">
				<div class="flex items-center gap-3">
					<!-- Circular angle dial -->
					<div class="relative w-20 h-20 flex-shrink-0">
						<svg viewBox="0 0 80 80" class="w-full h-full">
							<circle cx="40" cy="40" r="35" fill="none" stroke="var(--color-border)" stroke-width="2" />
							<!-- Angle indicator line -->
							<line
								x1="40" y1="40"
								x2={40 + Math.cos((store.angle * Math.PI) / 180) * 30}
								y2={40 + Math.sin((store.angle * Math.PI) / 180) * 30}
								stroke="var(--color-accent)" stroke-width="3" stroke-linecap="round"
							/>
							<circle cx="40" cy="40" r="3" fill="var(--color-accent)" />
							<!-- Tick marks at 0, 45, 90, etc -->
							{#each [0, 45, 90, 135, 180, 225, 270, 315] as tick}
								<line
									x1={40 + Math.cos((tick * Math.PI) / 180) * 32}
									y1={40 + Math.sin((tick * Math.PI) / 180) * 32}
									x2={40 + Math.cos((tick * Math.PI) / 180) * 36}
									y2={40 + Math.sin((tick * Math.PI) / 180) * 36}
									stroke="var(--color-text-muted)" stroke-width="1"
								/>
							{/each}
						</svg>
					</div>
					<div class="flex-1 space-y-2">
						<div>
							<label class="block text-xs text-[var(--color-text-muted)] mb-1">Angle: {store.angle}°</label>
							<input
								type="range"
								min="0"
								max="360"
								step="1"
								bind:value={store.angle}
								class="w-full accent-[var(--color-accent)]"
							/>
						</div>
						<input
							type="number"
							bind:value={store.angle}
							min="0"
							max="360"
							class="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded px-2 py-1.5 text-sm text-[var(--color-text)]"
						/>
					</div>
				</div>
				<!-- Quick angle buttons -->
				<div class="flex gap-1 flex-wrap">
					{#each [0, 30, 45, 60, 90, 120, 135, 180] as a}
						<button
							class="text-xs px-2 py-1 rounded border transition-colors
								{store.angle === a
								? 'border-[var(--color-accent)] text-[var(--color-accent)] bg-[var(--color-accent)]/10'
								: 'border-[var(--color-border)] text-[var(--color-text-muted)] hover:border-[var(--color-accent)]'}"
							onclick={() => (store.angle = a)}
						>
							{a}°
						</button>
					{/each}
				</div>
			</div>
		{/if}
	</div>

	<!-- Results Section -->
	<div class="border-b border-[var(--color-border)]">
		<button
			class="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold text-[var(--color-text)] hover:bg-[var(--color-surface-hover)] transition-colors"
			onclick={() => toggleSection('results')}
		>
			<span>Results</span>
			<span class="text-[var(--color-text-muted)] text-xs">{expandedSections.results ? '▼' : '▶'}</span>
		</button>
		{#if expandedSections.results}
			{@const r = store.layout}
			<div class="px-4 pb-4 space-y-2">
				<div class="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
					<div>
						<div class="text-xs text-[var(--color-text-muted)]">Room Area</div>
						<div class="font-semibold text-[var(--color-text)]">{formatArea(r.roomArea)} m²</div>
					</div>
					<div>
						<div class="text-xs text-[var(--color-text-muted)]">Total Planks</div>
						<div class="font-semibold text-[var(--color-text)]">{r.totalPlanksNeeded}</div>
					</div>
					<div>
						<div class="text-xs text-[var(--color-text-muted)]">Full Planks</div>
						<div class="font-semibold text-[var(--color-success)]">{r.fullPlanks}</div>
					</div>
					<div>
						<div class="text-xs text-[var(--color-text-muted)]">Cut Planks</div>
						<div class="font-semibold text-[var(--color-warning)]">{r.cutPlanks}</div>
					</div>
					<div>
						<div class="text-xs text-[var(--color-text-muted)]">Waste</div>
						<div class="font-semibold text-[var(--color-warning)]">{r.wastePercent.toFixed(1)}%</div>
					</div>
					<div>
						<div class="text-xs text-[var(--color-text-muted)]">Packs Needed</div>
						<div class="font-semibold text-[var(--color-text)]">{r.packsNeeded}</div>
					</div>
				</div>

				<!-- Visual waste bar -->
				<div class="mt-3">
					<div class="flex items-center justify-between text-xs text-[var(--color-text-muted)] mb-1">
						<span>Material Usage</span>
						<span>{(100 - r.wastePercent).toFixed(1)}% efficient</span>
					</div>
					<div class="w-full h-3 bg-[var(--color-bg)] rounded-full overflow-hidden">
						<div
							class="h-full rounded-full transition-all duration-300"
							style="width: {Math.max(0, 100 - r.wastePercent)}%; background: linear-gradient(90deg, var(--color-success), var(--color-accent))"
						></div>
					</div>
				</div>

				<!-- Legend -->
				<div class="flex gap-4 mt-3 text-xs text-[var(--color-text-muted)]">
					<div class="flex items-center gap-1.5">
						<div class="w-3 h-3 rounded-sm" style="background: var(--color-plank)"></div>
						<span>Full plank</span>
					</div>
					<div class="flex items-center gap-1.5">
						<div class="w-3 h-3 rounded-sm opacity-75" style="background: var(--color-plank-cut)"></div>
						<span>Cut plank</span>
					</div>
				</div>
			</div>
		{/if}
	</div>
</div>
