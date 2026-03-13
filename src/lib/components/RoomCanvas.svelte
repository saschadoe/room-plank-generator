<script lang="ts">
	import { store } from '$lib/store.svelte';
	import { getBoundingBox, wallLength, distance } from '$lib/geometry';
	import type { Point } from '$lib/types';

	let svgEl = $state<SVGSVGElement | null>(null);
	let containerEl = $state<HTMLDivElement | null>(null);
	let containerWidth = $state(800);
	let containerHeight = $state(600);
	let draggingVertex = $state<number | null>(null);
	let hoverVertex = $state<number | null>(null);
	let hoverEdge = $state<number | null>(null);
	let draggingEdge = $state<number | null>(null);
	let edgeDragStart = $state<Point>({ x: 0, y: 0 });
	let edgeDragVerticesStart = $state<Point[]>([]);
	let drawPreviewPoint = $state<Point | null>(null);
	let isPanning = $state(false);
	let panStart = $state<Point>({ x: 0, y: 0 });
	let panOffset = $state<Point>({ x: 0, y: 0 });

	// Touch state
	let isTouchDevice = $state(false);
	let lastPinchDist = $state<number | null>(null);
	let lastPinchZoom = $state(1);

	// Detect touch
	$effect(() => {
		isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
	});

	// Observe container size
	$effect(() => {
		if (!containerEl) return;
		const observer = new ResizeObserver((entries) => {
			for (const entry of entries) {
				containerWidth = entry.contentRect.width;
				containerHeight = entry.contentRect.height;
			}
		});
		observer.observe(containerEl);
		return () => observer.disconnect();
	});

	// Compute view transform to fit room in canvas
	const padding = 80;
	let viewBox = $derived.by(() => {
		if (store.vertices.length < 2) {
			return { x: -500, y: -500, w: containerWidth + 1000, h: containerHeight + 1000 };
		}
		const bb = getBoundingBox(store.vertices);
		const scaleX = (containerWidth - padding * 2) / (bb.width || 1);
		const scaleY = (containerHeight - padding * 2) / (bb.height || 1);
		const scale = Math.min(scaleX, scaleY) * store.zoom;
		const cx = bb.minX + bb.width / 2;
		const cy = bb.minY + bb.height / 2;
		const vw = containerWidth / scale;
		const vh = containerHeight / scale;
		return {
			x: cx - vw / 2 - store.panX / scale,
			y: cy - vh / 2 - store.panY / scale,
			w: vw,
			h: vh
		};
	});

	// Grid spacing in mm
	let gridSpacing = $derived.by(() => {
		const pxPerMm = containerWidth / viewBox.w;
		if (pxPerMm > 2) return 100;
		if (pxPerMm > 0.5) return 500;
		return 1000;
	});

	let gridLines = $derived.by(() => {
		const lines: { x1: number; y1: number; x2: number; y2: number; major: boolean }[] = [];
		const startX = Math.floor(viewBox.x / gridSpacing) * gridSpacing;
		const startY = Math.floor(viewBox.y / gridSpacing) * gridSpacing;
		const endX = viewBox.x + viewBox.w;
		const endY = viewBox.y + viewBox.h;
		const majorEvery = gridSpacing <= 100 ? 500 : gridSpacing <= 500 ? 1000 : 5000;

		for (let x = startX; x <= endX; x += gridSpacing) {
			lines.push({ x1: x, y1: viewBox.y, x2: x, y2: viewBox.y + viewBox.h, major: x % majorEvery === 0 });
		}
		for (let y = startY; y <= endY; y += gridSpacing) {
			lines.push({ x1: viewBox.x, y1: y, x2: viewBox.x + viewBox.w, y2: y, major: y % majorEvery === 0 });
		}
		return lines;
	});

	// Vertex/edge hit targets scale larger on touch
	let touchScale = $derived(isTouchDevice ? 2 : 1);
	let vertexRadius = $derived(Math.max(viewBox.w, viewBox.h) * 0.012 * touchScale);
	let strokeWidth = $derived(Math.max(viewBox.w, viewBox.h) * 0.003);
	let fontSize = $derived(Math.max(viewBox.w, viewBox.h) * 0.018);

	// ─── Coordinate helpers ────────────────────────────────────

	function clientToSvg(clientX: number, clientY: number): Point {
		if (!svgEl) return { x: 0, y: 0 };
		const rect = svgEl.getBoundingClientRect();
		return {
			x: viewBox.x + ((clientX - rect.left) / rect.width) * viewBox.w,
			y: viewBox.y + ((clientY - rect.top) / rect.height) * viewBox.h
		};
	}

	function svgPoint(e: MouseEvent): Point {
		return clientToSvg(e.clientX, e.clientY);
	}

	function snapToGrid(p: Point): Point {
		const snap = gridSpacing;
		return {
			x: Math.round(p.x / snap) * snap,
			y: Math.round(p.y / snap) * snap
		};
	}

	// ─── 90° snapping ──────────────────────────────────────────

	const SNAP_ANGLE_THRESHOLD = 8;
	function snapVertexTo90(index: number, pt: Point): Point {
		const verts = store.vertices;
		const n = verts.length;
		if (n < 2) return pt;

		let { x, y } = pt;
		const prev = verts[(index - 1 + n) % n];
		const next = verts[(index + 1) % n];

		const dx = Math.abs(x - prev.x);
		const dy = Math.abs(y - prev.y);
		if (dx > 1 && dy > 1) {
			if (dy < dx * Math.tan(SNAP_ANGLE_THRESHOLD * Math.PI / 180)) y = prev.y;
			else if (dx < dy * Math.tan(SNAP_ANGLE_THRESHOLD * Math.PI / 180)) x = prev.x;
		}

		const dx2 = Math.abs(x - next.x);
		const dy2 = Math.abs(y - next.y);
		if (dx2 > 1 && dy2 > 1) {
			if (dy2 < dx2 * Math.tan(SNAP_ANGLE_THRESHOLD * Math.PI / 180)) y = next.y;
			else if (dx2 < dy2 * Math.tan(SNAP_ANGLE_THRESHOLD * Math.PI / 180)) x = next.x;
		}

		return { x, y };
	}

	// ─── Hit testing for touch ─────────────────────────────────

	function findNearestVertex(pt: Point, threshold: number): number | null {
		let best = -1;
		let bestDist = threshold;
		for (let i = 0; i < store.vertices.length; i++) {
			const d = distance(pt, store.vertices[i]);
			if (d < bestDist) { bestDist = d; best = i; }
		}
		return best >= 0 ? best : null;
	}

	function distToSegment(p: Point, a: Point, b: Point): number {
		const dx = b.x - a.x, dy = b.y - a.y;
		const lenSq = dx * dx + dy * dy;
		if (lenSq < 1) return distance(p, a);
		const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq));
		return distance(p, { x: a.x + t * dx, y: a.y + t * dy });
	}

	function findNearestEdge(pt: Point, threshold: number): number | null {
		let best = -1;
		let bestDist = threshold;
		for (let i = 0; i < store.vertices.length; i++) {
			const next = store.vertices[(i + 1) % store.vertices.length];
			const d = distToSegment(pt, store.vertices[i], next);
			if (d < bestDist) { bestDist = d; best = i; }
		}
		return best >= 0 ? best : null;
	}

	// ─── Mouse handlers ────────────────────────────────────────

	function handleMouseDown(e: MouseEvent) {
		if (e.button === 1 || (e.button === 0 && e.altKey)) {
			isPanning = true;
			panStart = { x: e.clientX, y: e.clientY };
			panOffset = { x: store.panX, y: store.panY };
			e.preventDefault();
			return;
		}

		if (store.editorMode === 'draw' && e.button === 0) {
			const pt = e.shiftKey ? snapToGrid(svgPoint(e)) : svgPoint(e);
			if (store.isDrawing) {
				if (store.vertices.length >= 3) {
					const first = store.vertices[0];
					if (distance(pt, first) < vertexRadius * 2) {
						store.isDrawing = false;
						drawPreviewPoint = null;
						return;
					}
				}
				store.addVertex(pt);
			} else {
				store.setVertices([pt]);
				store.isDrawing = true;
			}
		}
	}

	function handleMouseMove(e: MouseEvent) {
		if (isPanning) {
			store.panX = panOffset.x + (e.clientX - panStart.x);
			store.panY = panOffset.y + (e.clientY - panStart.y);
			return;
		}

		if (draggingVertex !== null) {
			let pt = e.shiftKey ? snapToGrid(svgPoint(e)) : svgPoint(e);
			pt = snapVertexTo90(draggingVertex, pt);
			store.updateVertex(draggingVertex, pt);
			return;
		}

		if (draggingEdge !== null) {
			moveEdge(svgPoint(e), e.shiftKey);
			return;
		}

		if (store.isDrawing) {
			drawPreviewPoint = e.shiftKey ? snapToGrid(svgPoint(e)) : svgPoint(e);
		}
	}

	function handleMouseUp() {
		isPanning = false;
		draggingVertex = null;
		draggingEdge = null;
	}

	function handleWheel(e: WheelEvent) {
		e.preventDefault();
		const delta = e.deltaY > 0 ? 0.9 : 1.1;
		store.zoom = Math.max(0.1, Math.min(10, store.zoom * delta));
	}

	function startDragVertex(index: number, e: MouseEvent) {
		if (store.isDrawing) return;
		e.stopPropagation();
		draggingVertex = index;
	}

	function startDragEdge(index: number, e: MouseEvent) {
		if (store.isDrawing) return;
		e.stopPropagation();
		draggingEdge = index;
		edgeDragStart = svgPoint(e);
		edgeDragVerticesStart = store.vertices.map((v) => ({ ...v }));
	}

	// ─── Shared edge movement logic ────────────────────────────

	function moveEdge(pt: Point, snap: boolean) {
		if (draggingEdge === null) return;
		const dx = pt.x - edgeDragStart.x;
		const dy = pt.y - edgeDragStart.y;
		const iA = draggingEdge;
		const iB = (draggingEdge + 1) % edgeDragVerticesStart.length;
		const a = edgeDragVerticesStart[iA];
		const b = edgeDragVerticesStart[iB];
		const edgeDx = b.x - a.x;
		const edgeDy = b.y - a.y;
		const edgeLen = Math.sqrt(edgeDx * edgeDx + edgeDy * edgeDy) || 1;
		const nx = -edgeDy / edgeLen;
		const ny = edgeDx / edgeLen;
		const proj = dx * nx + dy * ny;
		let offsetX = nx * proj;
		let offsetY = ny * proj;

		if (snap) {
			const newAx = Math.round((a.x + offsetX) / gridSpacing) * gridSpacing;
			const newAy = Math.round((a.y + offsetY) / gridSpacing) * gridSpacing;
			offsetX = newAx - a.x;
			offsetY = newAy - a.y;
		}

		const newVerts = [...edgeDragVerticesStart];
		newVerts[iA] = { x: a.x + offsetX, y: a.y + offsetY };
		newVerts[iB] = { x: b.x + offsetX, y: b.y + offsetY };
		store.setVertices(newVerts);
	}

	// ─── Touch handlers ────────────────────────────────────────

	function getTouchDist(t1: Touch, t2: Touch): number {
		return Math.sqrt((t1.clientX - t2.clientX) ** 2 + (t1.clientY - t2.clientY) ** 2);
	}

	function getTouchCenter(t1: Touch, t2: Touch): Point {
		return { x: (t1.clientX + t2.clientX) / 2, y: (t1.clientY + t2.clientY) / 2 };
	}

	function handleTouchStart(e: TouchEvent) {
		if (e.touches.length === 2) {
			// Start pinch-to-zoom / two-finger pan
			e.preventDefault();
			draggingVertex = null;
			draggingEdge = null;
			lastPinchDist = getTouchDist(e.touches[0], e.touches[1]);
			lastPinchZoom = store.zoom;
			const center = getTouchCenter(e.touches[0], e.touches[1]);
			isPanning = true;
			panStart = { x: center.x, y: center.y };
			panOffset = { x: store.panX, y: store.panY };
			return;
		}

		if (e.touches.length === 1) {
			const touch = e.touches[0];
			const pt = clientToSvg(touch.clientX, touch.clientY);
			const hitRadius = vertexRadius * 3; // generous touch target

			if (store.isDrawing) return;

			// Try to hit a vertex first
			const vi = findNearestVertex(pt, hitRadius);
			if (vi !== null) {
				e.preventDefault();
				draggingVertex = vi;
				return;
			}

			// Try to hit an edge
			const ei = findNearestEdge(pt, hitRadius);
			if (ei !== null) {
				e.preventDefault();
				draggingEdge = ei;
				edgeDragStart = pt;
				edgeDragVerticesStart = store.vertices.map((v) => ({ ...v }));
				return;
			}

			// Otherwise pan
			e.preventDefault();
			isPanning = true;
			panStart = { x: touch.clientX, y: touch.clientY };
			panOffset = { x: store.panX, y: store.panY };
		}
	}

	function handleTouchMove(e: TouchEvent) {
		if (e.touches.length === 2) {
			e.preventDefault();
			// Pinch-to-zoom
			const dist = getTouchDist(e.touches[0], e.touches[1]);
			if (lastPinchDist !== null) {
				const scale = dist / lastPinchDist;
				store.zoom = Math.max(0.1, Math.min(10, lastPinchZoom * scale));
			}
			// Two-finger pan
			const center = getTouchCenter(e.touches[0], e.touches[1]);
			if (isPanning) {
				store.panX = panOffset.x + (center.x - panStart.x);
				store.panY = panOffset.y + (center.y - panStart.y);
			}
			return;
		}

		if (e.touches.length === 1) {
			const touch = e.touches[0];

			if (draggingVertex !== null) {
				e.preventDefault();
				let pt = clientToSvg(touch.clientX, touch.clientY);
				pt = snapVertexTo90(draggingVertex, pt);
				store.updateVertex(draggingVertex, pt);
				return;
			}

			if (draggingEdge !== null) {
				e.preventDefault();
				const pt = clientToSvg(touch.clientX, touch.clientY);
				moveEdge(pt, false);
				return;
			}

			if (isPanning) {
				e.preventDefault();
				store.panX = panOffset.x + (touch.clientX - panStart.x);
				store.panY = panOffset.y + (touch.clientY - panStart.y);
			}
		}
	}

	function handleTouchEnd(e: TouchEvent) {
		if (e.touches.length === 0) {
			isPanning = false;
			draggingVertex = null;
			draggingEdge = null;
			lastPinchDist = null;
		} else if (e.touches.length === 1 && lastPinchDist !== null) {
			// Went from 2 fingers to 1 — start single-finger pan from current pos
			lastPinchDist = null;
			const touch = e.touches[0];
			panStart = { x: touch.clientX, y: touch.clientY };
			panOffset = { x: store.panX, y: store.panY };
		}
	}

	// ─── Other handlers ────────────────────────────────────────

	function handleVertexRightClick(index: number, e: MouseEvent) {
		e.preventDefault();
		store.removeVertex(index);
	}

	function handleEdgeDoubleClick(index: number, e: MouseEvent) {
		e.stopPropagation();
		const a = store.vertices[index];
		const b = store.vertices[(index + 1) % store.vertices.length];
		const mid: Point = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
		store.addVertex(mid, index);
	}

	function getEdgeCursor(index: number): string {
		const a = store.vertices[index];
		const b = store.vertices[(index + 1) % store.vertices.length];
		const angle = Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI;
		const perpAngle = ((angle + 90) % 360 + 360) % 360;
		if ((perpAngle >= 337.5 || perpAngle < 22.5) || (perpAngle >= 157.5 && perpAngle < 202.5)) return 'ew-resize';
		if ((perpAngle >= 22.5 && perpAngle < 67.5) || (perpAngle >= 202.5 && perpAngle < 247.5)) return 'nwse-resize';
		if ((perpAngle >= 67.5 && perpAngle < 112.5) || (perpAngle >= 247.5 && perpAngle < 292.5)) return 'ns-resize';
		return 'nesw-resize';
	}

	// ─── Derived display data ──────────────────────────────────

	let wallLabels = $derived.by(() => {
		return store.vertices.map((v, i) => {
			const next = store.vertices[(i + 1) % store.vertices.length];
			const len = wallLength(v, next);
			const mx = (v.x + next.x) / 2;
			const my = (v.y + next.y) / 2;
			const dx = next.x - v.x;
			const dy = next.y - v.y;
			const norm = Math.sqrt(dx * dx + dy * dy) || 1;
			const offsetDist = fontSize * 1.5;
			return {
				x: mx + (-dy / norm) * offsetDist,
				y: my + (dx / norm) * offsetDist,
				text: len >= 1000 ? `${(len / 1000).toFixed(2)}m` : `${Math.round(len)}mm`,
				angle: Math.atan2(dy, dx) * 180 / Math.PI
			};
		});
	});

	let roomPath = $derived(
		store.vertices.length >= 3
			? store.vertices.map((v, i) => `${i === 0 ? 'M' : 'L'}${v.x},${v.y}`).join(' ') + ' Z'
			: ''
	);

	let plankPaths = $derived(
		store.layout.planks.map((p) => ({
			path: p.clipped.map((v, i) => `${i === 0 ? 'M' : 'L'}${v.x},${v.y}`).join(' ') + ' Z',
			fullPath: p.corners.map((v, i) => `${i === 0 ? 'M' : 'L'}${v.x},${v.y}`).join(' ') + ' Z',
			isCut: p.isCut
		}))
	);
</script>

<div
	bind:this={containerEl}
	class="relative w-full h-full bg-[var(--color-bg)] overflow-hidden select-none touch-none"
>
	<!-- Toolbar -->
	<div class="absolute top-3 left-3 z-10 flex gap-1 sm:gap-2">
		<button
			class="px-2 sm:px-3 py-1.5 sm:py-1.5 rounded text-xs sm:text-sm font-medium transition-colors {store.editorMode === 'draw'
				? 'bg-[var(--color-accent)] text-white'
				: 'bg-[var(--color-surface)] text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)]'}"
			onclick={() => { store.editorMode = 'draw'; }}
		>
			Draw
		</button>
		<button
			class="px-2 sm:px-3 py-1.5 sm:py-1.5 rounded text-xs sm:text-sm font-medium transition-colors {store.editorMode === 'table'
				? 'bg-[var(--color-accent)] text-white'
				: 'bg-[var(--color-surface)] text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)]'}"
			onclick={() => { store.editorMode = 'table'; store.isDrawing = false; }}
		>
			Table
		</button>
		<div class="w-px bg-[var(--color-border)]"></div>
		<button
			class="px-2 sm:px-3 py-1.5 sm:py-1.5 rounded text-xs sm:text-sm font-medium bg-[var(--color-surface)] text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)] transition-colors"
			onclick={() => store.resetZoom()}
			title="Fit to view"
		>
			Fit
		</button>
	</div>

	<!-- Mobile zoom controls -->
	<div class="absolute bottom-3 right-3 z-10 flex flex-col gap-1 md:hidden">
		<button
			class="w-10 h-10 rounded-lg bg-[var(--color-surface)] text-[var(--color-text)] text-xl font-bold flex items-center justify-center active:bg-[var(--color-surface-hover)]"
			onclick={() => { store.zoom = Math.min(10, store.zoom * 1.3); }}
		>+</button>
		<button
			class="w-10 h-10 rounded-lg bg-[var(--color-surface)] text-[var(--color-text)] text-xl font-bold flex items-center justify-center active:bg-[var(--color-surface-hover)]"
			onclick={() => { store.zoom = Math.max(0.1, store.zoom * 0.7); }}
		>-</button>
	</div>

	{#if store.isDrawing}
		<div class="absolute top-3 left-1/2 -translate-x-1/2 z-10 px-3 sm:px-4 py-2 rounded bg-[var(--color-accent)] text-white text-xs sm:text-sm font-medium shadow-lg text-center">
			Tap to place vertices. Tap first point to close.
		</div>
	{/if}

	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<svg
		bind:this={svgEl}
		viewBox="{viewBox.x} {viewBox.y} {viewBox.w} {viewBox.h}"
		class="w-full h-full cursor-crosshair"
		onmousedown={handleMouseDown}
		onmousemove={handleMouseMove}
		onmouseup={handleMouseUp}
		onmouseleave={handleMouseUp}
		onwheel={handleWheel}
		ontouchstart={handleTouchStart}
		ontouchmove={handleTouchMove}
		ontouchend={handleTouchEnd}
		ontouchcancel={handleTouchEnd}
		oncontextmenu={(e) => e.preventDefault()}
	>
		<!-- Grid -->
		{#each gridLines as line}
			<line
				x1={line.x1} y1={line.y1} x2={line.x2} y2={line.y2}
				stroke={line.major ? '#1e3a5f' : 'var(--color-grid)'}
				stroke-width={line.major ? strokeWidth * 0.5 : strokeWidth * 0.25}
			/>
		{/each}

		<!-- Cut plank full outlines (dashed, outside room) -->
		{#each plankPaths as plank}
			{#if plank.isCut}
				<path
					d={plank.fullPath}
					fill="none"
					stroke="var(--color-plank-stroke)"
					stroke-width={strokeWidth * 0.3}
					stroke-dasharray="{strokeWidth * 2},{strokeWidth * 2}"
					opacity="0.35"
				/>
			{/if}
		{/each}

		<!-- Planks (clipped to room) -->
		{#each plankPaths as plank}
			<path
				d={plank.path}
				fill={plank.isCut ? 'var(--color-plank-cut)' : 'var(--color-plank)'}
				stroke="var(--color-plank-stroke)"
				stroke-width={strokeWidth * 0.4}
				opacity={plank.isCut ? 0.75 : 0.9}
			/>
		{/each}

		<!-- Room outline -->
		{#if roomPath}
			<path
				d={roomPath}
				fill="none"
				stroke="var(--color-room-stroke)"
				stroke-width={strokeWidth * 1.5}
				stroke-linejoin="round"
			/>
		{/if}

		<!-- Wall edges (draggable + double-click to add vertex) -->
		{#each store.vertices as v, i}
			{@const next = store.vertices[(i + 1) % store.vertices.length]}
			{#if !store.isDrawing}
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<line
					x1={v.x} y1={v.y} x2={next.x} y2={next.y}
					stroke={hoverEdge === i ? 'var(--color-accent)' : 'transparent'}
					stroke-width={vertexRadius * 2.5}
					opacity={hoverEdge === i ? 0.3 : 1}
					style="cursor: {getEdgeCursor(i)}"
					onmousedown={(e) => startDragEdge(i, e)}
					onmouseenter={() => (hoverEdge = i)}
					onmouseleave={() => (hoverEdge = null)}
					ondblclick={(e) => handleEdgeDoubleClick(i, e)}
				/>
			{/if}
		{/each}

		<!-- Wall dimension labels -->
		{#if !store.isDrawing}
			{#each wallLabels as label}
				<text
					x={label.x}
					y={label.y}
					text-anchor="middle"
					dominant-baseline="middle"
					fill="var(--color-text-muted)"
					font-size={fontSize}
					font-family="Inter, system-ui, sans-serif"
				>
					{label.text}
				</text>
			{/each}
		{/if}

		<!-- Vertices -->
		{#each store.vertices as v, i}
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<circle
				cx={v.x}
				cy={v.y}
				r={hoverVertex === i ? vertexRadius * 1.3 : vertexRadius}
				fill={i === 0 && store.isDrawing ? 'var(--color-success)' : 'var(--color-accent)'}
				stroke="white"
				stroke-width={strokeWidth * 0.5}
				class={!store.isDrawing ? 'cursor-grab' : 'cursor-pointer'}
				onmousedown={(e) => startDragVertex(i, e)}
				onmouseenter={() => (hoverVertex = i)}
				onmouseleave={() => (hoverVertex = null)}
				oncontextmenu={(e) => handleVertexRightClick(i, e)}
			/>
		{/each}

		<!-- Drawing preview line -->
		{#if store.isDrawing && drawPreviewPoint && store.vertices.length > 0}
			{@const last = store.vertices[store.vertices.length - 1]}
			<line
				x1={last.x} y1={last.y}
				x2={drawPreviewPoint.x} y2={drawPreviewPoint.y}
				stroke="var(--color-accent)"
				stroke-width={strokeWidth}
				stroke-dasharray="{strokeWidth * 3},{strokeWidth * 2}"
				opacity="0.6"
			/>
		{/if}
	</svg>

	<!-- Zoom indicator -->
	<div class="absolute bottom-3 left-3 text-xs text-[var(--color-text-muted)] bg-[var(--color-surface)] px-2 py-1 rounded">
		{Math.round(store.zoom * 100)}%
	</div>
</div>
