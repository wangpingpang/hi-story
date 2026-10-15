import type { MapErrorCode } from './types';
export class MapGenerationError extends Error {
  constructor(public code: MapErrorCode, message: string, public path?: string) { super(message); }
}
export function impossible(message: string): never { throw new MapGenerationError('UNSATISFIABLE', message); }
