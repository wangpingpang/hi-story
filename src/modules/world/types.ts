export interface Point { x: number; y: number }
export interface Size { width: number; height: number }
export type Shape = 'rectangle' | 'ellipse';
export interface RegionRequest {
  id: string;
  sizeRange: { width: [number, number]; height: [number, number] };
  shape?: Shape;
  position?: Point;
  environmentRef?: string;
  walkable?: boolean;
  blocksSight?: boolean;
}
export interface ConnectionRequest {
  id: string;
  from: string;
  to: string;
  width: number;
  passable: boolean;
  blocksSight?: boolean;
}
export interface AnchorRequest { id: string; regionId: string; position?: Point }
export interface TerrainRequest {
  id: string;
  regionId: string;
  terrainRef: string;
  shapeSpec: { shape: Shape; size: Size };
  position?: Point;
  walkable: boolean;
  blocksSight: boolean;
}
export interface PlacementRequest {
  id: string;
  entityRef: string;
  regionId: string;
  footprint: Size;
  position?: Point;
  placementRule?: { nearAnchorId: string; minDistance?: number; maxDistance?: number };
  blocksMovement: boolean;
  blocksSight: boolean;
}
export interface MapGenerationRequest {
  schemaVersion?: 1;
  seed: string | number;
  bounds: Size;
  layout: { strategyId: string; params?: Record<string, unknown> };
  regions: RegionRequest[];
  connections?: ConnectionRequest[];
  anchors?: AnchorRequest[];
  terrain?: TerrainRequest[];
  placements?: PlacementRequest[];
  constraints?: {
    requiredPaths?: { fromAnchorId: string; toAnchorId: string }[];
    minObjectSpacing?: number;
    allowObjectOverlap?: boolean;
  };
}
export interface RegionPlacement { id: string; position: Point; size: Size }
export interface LayoutContext {
  request: MapGenerationRequest;
  attempt: number;
  randomFor: (namespace: string) => () => number;
}
export type MapLayoutStrategy = (context: LayoutContext) => RegionPlacement[];
export interface MapCell {
  regionId: string | null;
  connectionIds: string[];
  terrainId: string | null;
  placementIds: string[];
  walkable: boolean;
  blocksSight: boolean;
}
export interface GeneratedMap {
  generatorVersion: 'bounded-map/1';
  schemaVersion: 1;
  seed: string | number;
  bounds: Size;
  regions: (RegionPlacement & { shape: Shape; environmentRef?: string })[];
  connections: (ConnectionRequest & { cells: Point[] })[];
  anchors: (AnchorRequest & { position: Point })[];
  terrain: (TerrainRequest & { position: Point; cells: Point[] })[];
  placements: (PlacementRequest & { position: Point })[];
  /** Row-major grid: cells[y][x]. */
  cells: MapCell[][];
  summary: { walkableCells: number; regionCount: number; connectionCount: number; objectCount: number };
}
export type MapErrorCode = 'INVALID_REQUEST' | 'UNKNOWN_STRATEGY' | 'UNSATISFIABLE' | 'STRATEGY_ERROR';
export type MapGenerationResult =
  | { ok: true; map: GeneratedMap }
  | { ok: false; error: { code: MapErrorCode; message: string; path?: string; attempts?: number } };
