export { generateMap, MAP_GENERATOR_VERSION } from './generator';
export { findMapPath } from './pathfinding';
export { MapStrategyRegistry, createMapStrategyRegistry, connectedRegionsStrategy } from './registry';
export type {
  MapGenerationRequest, MapGenerationResult, GeneratedMap, MapCell, MapErrorCode,
  MapLayoutStrategy, LayoutContext, RegionPlacement, RegionRequest, ConnectionRequest,
  AnchorRequest, TerrainRequest, PlacementRequest, Point, Size, Shape,
} from './types';
