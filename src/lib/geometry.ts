import type { Point, Polygon, PlankInstance, LayoutConfig, LayoutResult } from './types';

// ─── Basic geometry helpers ────────────────────────────────────────

export function degToRad(deg: number): number {
	return (deg * Math.PI) / 180;
}

export function rotatePoint(p: Point, angle: number, origin: Point = { x: 0, y: 0 }): Point {
	const rad = degToRad(angle);
	const cos = Math.cos(rad);
	const sin = Math.sin(rad);
	const dx = p.x - origin.x;
	const dy = p.y - origin.y;
	return {
		x: origin.x + dx * cos - dy * sin,
		y: origin.y + dx * sin + dy * cos
	};
}

export function polygonArea(vertices: Point[]): number {
	let area = 0;
	const n = vertices.length;
	for (let i = 0; i < n; i++) {
		const j = (i + 1) % n;
		area += vertices[i].x * vertices[j].y;
		area -= vertices[j].x * vertices[i].y;
	}
	return Math.abs(area) / 2;
}

export function polygonCentroid(vertices: Point[]): Point {
	let cx = 0, cy = 0;
	for (const v of vertices) {
		cx += v.x;
		cy += v.y;
	}
	return { x: cx / vertices.length, y: cy / vertices.length };
}

export function distance(a: Point, b: Point): number {
	return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

export function wallLength(a: Point, b: Point): number {
	return distance(a, b);
}

export function wallAngle(a: Point, b: Point): number {
	return (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
}

export function angleBetweenWalls(a: Point, b: Point, c: Point): number {
	const angle1 = Math.atan2(a.y - b.y, a.x - b.x);
	const angle2 = Math.atan2(c.y - b.y, c.x - b.x);
	let angle = ((angle2 - angle1) * 180) / Math.PI;
	while (angle < 0) angle += 360;
	return angle;
}

// ─── Bounding box ──────────────────────────────────────────────────

export function getBoundingBox(vertices: Point[]): { minX: number; minY: number; maxX: number; maxY: number; width: number; height: number } {
	let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
	for (const v of vertices) {
		if (v.x < minX) minX = v.x;
		if (v.y < minY) minY = v.y;
		if (v.x > maxX) maxX = v.x;
		if (v.y > maxY) maxY = v.y;
	}
	return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}

// ─── Point-in-polygon (ray casting) ───────────────────────────────

export function pointInPolygon(p: Point, vertices: Point[]): boolean {
	let inside = false;
	const n = vertices.length;
	for (let i = 0, j = n - 1; i < n; j = i++) {
		const xi = vertices[i].x, yi = vertices[i].y;
		const xj = vertices[j].x, yj = vertices[j].y;
		if ((yi > p.y) !== (yj > p.y) && p.x < ((xj - xi) * (p.y - yi)) / (yj - yi) + xi) {
			inside = !inside;
		}
	}
	return inside;
}

// ─── Sutherland-Hodgman polygon clipping ──────────────────────────

function lineIntersection(a: Point, b: Point, c: Point, d: Point): Point {
	const a1 = b.y - a.y;
	const b1 = a.x - b.x;
	const c1 = a1 * a.x + b1 * a.y;
	const a2 = d.y - c.y;
	const b2 = c.x - d.x;
	const c2 = a2 * c.x + b2 * c.y;
	const det = a1 * b2 - a2 * b1;
	if (Math.abs(det) < 1e-10) return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
	return {
		x: (b2 * c1 - b1 * c2) / det,
		y: (a1 * c2 - a2 * c1) / det
	};
}

function isInside(p: Point, edgeStart: Point, edgeEnd: Point): boolean {
	return (edgeEnd.x - edgeStart.x) * (p.y - edgeStart.y) - (edgeEnd.y - edgeStart.y) * (p.x - edgeStart.x) >= 0;
}

export function clipPolygon(subject: Point[], clip: Point[]): Point[] {
	if (subject.length === 0 || clip.length === 0) return [];

	let output = [...subject];
	const clipLen = clip.length;

	for (let i = 0; i < clipLen; i++) {
		if (output.length === 0) return [];
		const input = [...output];
		output = [];
		const edgeStart = clip[i];
		const edgeEnd = clip[(i + 1) % clipLen];

		for (let j = 0; j < input.length; j++) {
			const current = input[j];
			const prev = input[(j + input.length - 1) % input.length];
			const currentInside = isInside(current, edgeStart, edgeEnd);
			const prevInside = isInside(prev, edgeStart, edgeEnd);

			if (currentInside) {
				if (!prevInside) {
					output.push(lineIntersection(prev, current, edgeStart, edgeEnd));
				}
				output.push(current);
			} else if (prevInside) {
				output.push(lineIntersection(prev, current, edgeStart, edgeEnd));
			}
		}
	}

	return output;
}

// ─── Ensure polygon is counter-clockwise ──────────────────────────

function signedArea(vertices: Point[]): number {
	let area = 0;
	const n = vertices.length;
	for (let i = 0; i < n; i++) {
		const j = (i + 1) % n;
		area += vertices[i].x * vertices[j].y;
		area -= vertices[j].x * vertices[i].y;
	}
	return area / 2;
}

function ensureCCW(vertices: Point[]): Point[] {
	if (signedArea(vertices) < 0) return [...vertices].reverse();
	return vertices;
}

// ─── Layout calculation ───────────────────────────────────────────

function createPlankRect(x: number, y: number, width: number, height: number): Point[] {
	return [
		{ x, y },
		{ x: x + width, y },
		{ x: x + width, y: y + height },
		{ x, y: y + height }
	];
}

function rotatePoly(poly: Point[], angle: number, origin: Point): Point[] {
	return poly.map((p) => rotatePoint(p, angle, origin));
}

export function calculateLayout(roomVertices: Point[], config: LayoutConfig): LayoutResult {
	const room = ensureCCW(roomVertices);
	const roomArea = polygonArea(room);

	if (roomVertices.length < 3 || roomArea < 1) {
		return {
			planks: [],
			roomArea: 0,
			totalPlanksNeeded: 0,
			fullPlanks: 0,
			cutPlanks: 0,
			wasteArea: 0,
			wastePercent: 0,
			packsNeeded: 0
		};
	}

	const { plank, pattern, angle, staggerOffset, offsetX, offsetY } = config;
	const plankArea = plank.length * plank.width;

	// Rotate room into plank-aligned space so we can lay planks axis-aligned
	const centroid = polygonCentroid(room);
	const rotatedRoom = room.map((v) => rotatePoint(v, -angle, centroid));
	const bb = getBoundingBox(rotatedRoom);

	// Expand bounding box for herringbone (planks extend beyond simple grid)
	const margin = Math.max(plank.length, plank.width) * 2;
	const startX = bb.minX - margin + offsetX;
	const startY = bb.minY - margin + offsetY;
	const endX = bb.maxX + margin + offsetX;
	const endY = bb.maxY + margin + offsetY;

	const planks: PlankInstance[] = [];

	if (pattern === 'herringbone') {
		// Herringbone: planks laid in V pattern
		const unitW = plank.width;
		const unitH = plank.length;
		const blockW = unitH; // width of one herringbone "column"
		const blockH = unitW * 2; // height of one herringbone "block" (2 planks)

		const cols = Math.ceil((endX - startX) / blockW) + 2;
		const rows = Math.ceil((endY - startY) / blockH) + 2;

		for (let row = -1; row < rows; row++) {
			for (let col = -1; col < cols; col++) {
				const baseX = startX + col * blockW;
				const baseY = startY + row * blockH;

				// Plank A: horizontal, top half
				const cornersA = createPlankRect(baseX, baseY, unitH, unitW);
				const rotatedA = rotatePoly(cornersA, angle, centroid);
				const clippedA = clipPolygon(rotatedA, room);

				if (clippedA.length >= 3) {
					const visArea = polygonArea(clippedA);
					if (visArea > 1) {
						planks.push({
							corners: rotatedA,
							clipped: clippedA,
							row: row * 2,
							col,
							isCut: Math.abs(visArea - plankArea) > plankArea * 0.01,
							visibleArea: visArea,
							fullArea: plankArea
						});
					}
				}

				// Plank B: vertical, bottom half
				const cornersB = createPlankRect(baseX, baseY + unitW, unitW, unitH);
				const rotatedB = rotatePoly(cornersB, angle, centroid);
				const clippedB = clipPolygon(rotatedB, room);

				if (clippedB.length >= 3) {
					const visArea = polygonArea(clippedB);
					if (visArea > 1) {
						planks.push({
							corners: rotatedB,
							clipped: clippedB,
							row: row * 2 + 1,
							col,
							isCut: Math.abs(visArea - plankArea) > plankArea * 0.01,
							visibleArea: visArea,
							fullArea: plankArea
						});
					}
				}
			}
		}
	} else {
		// Staggered or straight
		const rowHeight = plank.width;
		const numRows = Math.ceil((endY - startY) / rowHeight) + 2;
		const numCols = Math.ceil((endX - startX) / plank.length) + 2;

		for (let row = -1; row < numRows; row++) {
			let offsetX = 0;
			if (pattern === 'staggered') {
				offsetX = (row % 2 === 0) ? 0 : -(plank.length * staggerOffset);
			}

			for (let col = -1; col < numCols; col++) {
				const px = startX + col * plank.length + offsetX;
				const py = startY + row * rowHeight;
				const corners = createPlankRect(px, py, plank.length, plank.width);
				const rotated = rotatePoly(corners, angle, centroid);
				const clipped = clipPolygon(rotated, room);

				if (clipped.length >= 3) {
					const visArea = polygonArea(clipped);
					if (visArea > 1) {
						planks.push({
							corners: rotated,
							clipped,
							row,
							col,
							isCut: Math.abs(visArea - plankArea) > plankArea * 0.01,
							visibleArea: visArea,
							fullArea: plankArea
						});
					}
				}
			}
		}
	}

	const fullPlanks = planks.filter((p) => !p.isCut).length;
	const cutPlanks = planks.filter((p) => p.isCut).length;
	const totalVisibleArea = planks.reduce((sum, p) => sum + p.visibleArea, 0);
	const totalUsedArea = planks.length * plankArea;
	const wasteArea = totalUsedArea - totalVisibleArea;
	const wastePercent = totalUsedArea > 0 ? (wasteArea / totalUsedArea) * 100 : 0;
	const packsNeeded = plank.perPack > 0 ? Math.ceil(planks.length / plank.perPack) : 0;

	return {
		planks,
		roomArea,
		totalPlanksNeeded: planks.length,
		fullPlanks,
		cutPlanks,
		wasteArea,
		wastePercent,
		packsNeeded
	};
}

// ─── Room presets ─────────────────────────────────────────────────

export function createRectangle(width: number, height: number): Point[] {
	return [
		{ x: 0, y: 0 },
		{ x: width, y: 0 },
		{ x: width, y: height },
		{ x: 0, y: height }
	];
}

export function createLShape(w1: number, h1: number, w2: number, h2: number): Point[] {
	return [
		{ x: 0, y: 0 },
		{ x: w1, y: 0 },
		{ x: w1, y: h2 },
		{ x: w2, y: h2 },
		{ x: w2, y: h1 },
		{ x: 0, y: h1 }
	];
}
