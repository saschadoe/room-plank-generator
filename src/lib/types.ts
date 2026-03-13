export interface Point {
	x: number;
	y: number;
}

export interface Polygon {
	vertices: Point[];
}

export interface PlankDimensions {
	length: number; // mm
	width: number; // mm
	perPack: number;
}

export type LayingPattern = 'staggered' | 'straight' | 'herringbone';

export interface LayoutConfig {
	plank: PlankDimensions;
	pattern: LayingPattern;
	angle: number; // degrees
	staggerOffset: number; // fraction 0-1 (e.g. 0.333 for 1/3)
}

export interface PlankInstance {
	/** The four corners of the plank in room coordinates */
	corners: Point[];
	/** The visible polygon after clipping to the room */
	clipped: Point[];
	/** Row and column index in the grid */
	row: number;
	col: number;
	/** Whether this plank was cut */
	isCut: boolean;
	/** Area of the visible portion in mm² */
	visibleArea: number;
	/** Area of the full plank in mm² */
	fullArea: number;
}

export interface LayoutResult {
	planks: PlankInstance[];
	roomArea: number; // mm²
	totalPlanksNeeded: number;
	fullPlanks: number;
	cutPlanks: number;
	wasteArea: number; // mm²
	wastePercent: number;
	packsNeeded: number;
}

export interface RoomPreset {
	name: string;
	vertices: Point[];
}
