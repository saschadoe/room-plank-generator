import type { Point, PlankDimensions, LayingPattern, LayoutConfig, LayoutResult } from './types';
import { createRectangle, calculateLayout } from './geometry';

class FloorPlannerState {
	// Room vertices
	vertices = $state<Point[]>(createRectangle(4000, 3000));

	// Editor mode
	editorMode = $state<'draw' | 'table' | 'move'>('table');
	isDrawing = $state(false);

	// Plank grid offset (for shifting all planks)
	plankOffsetX = $state(0);
	plankOffsetY = $state(0);

	// Plank dimensions
	plank = $state<PlankDimensions>({
		length: 1220,
		width: 185,
		perPack: 8
	});

	// Layout config
	pattern = $state<LayingPattern>('staggered');
	angle = $state(0);
	staggerOffset = $state(0.333);

	// View state
	zoom = $state(1);
	panX = $state(0);
	panY = $state(0);

	// Sidebar visibility on mobile
	sidebarOpen = $state(false);

	get config(): LayoutConfig {
		return {
			plank: this.plank,
			pattern: this.pattern,
			angle: this.angle,
			staggerOffset: this.staggerOffset,
			offsetX: this.plankOffsetX,
			offsetY: this.plankOffsetY
		};
	}

	get layout(): LayoutResult {
		return calculateLayout(this.vertices, this.config);
	}

	setVertices(v: Point[]) {
		this.vertices = v;
	}

	updateVertex(index: number, point: Point) {
		this.vertices = this.vertices.map((v, i) => (i === index ? point : v));
	}

	addVertex(point: Point, afterIndex?: number) {
		const newVerts = [...this.vertices];
		if (afterIndex !== undefined) {
			newVerts.splice(afterIndex + 1, 0, point);
		} else {
			newVerts.push(point);
		}
		this.vertices = newVerts;
	}

	removeVertex(index: number) {
		if (this.vertices.length <= 3) return;
		this.vertices = this.vertices.filter((_, i) => i !== index);
	}

	resetZoom() {
		this.zoom = 1;
		this.panX = 0;
		this.panY = 0;
	}
}

export const store = new FloorPlannerState();
