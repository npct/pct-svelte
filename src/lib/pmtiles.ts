import * as maplibregl from 'maplibre-gl';
import { Protocol } from 'pmtiles';

let pmtilesProtocol: Protocol | null = null;

export function initPMTilesProtocol(): Protocol {
  if (pmtilesProtocol) {
    return pmtilesProtocol;
  }

  pmtilesProtocol = new Protocol();
  maplibregl.addProtocol('pmtiles', pmtilesProtocol.tile);
  return pmtilesProtocol;
}

/**
 * Returns a fully qualified pmtiles:// URL for a local /data/*.pmtiles file
 */
export function getPMTilesUrl(relativePath: string): string {
  const cleanPath = relativePath.startsWith('/') ? relativePath : `/${relativePath}`;
  if (typeof window !== 'undefined' && window.location?.origin) {
    return `pmtiles://${window.location.origin}${cleanPath}`;
  }
  return `pmtiles://${cleanPath}`;
}
