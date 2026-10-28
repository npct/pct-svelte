export type Scenario = 'base' | 'govtarget' | 'gendereq' | 'govnearmkt' | 'dutch' | 'ebike' | 'cambridge';

export type Purpose = 'commute' | 'school';
export type Geography = 'msoa' | 'lsoa';

export interface ScenarioOption {
  id: Scenario;
  name: string;
  shortName: string;
  description: string;
  badge?: string;
  color: string;
}

export type LayerId = 'zones' | 'desire' | 'fast' | 'quiet' | 'rnet' | 'destinations';

export interface LayerConfig {
  id: LayerId;
  name: string;
  description: string;
  color: string;
  sourceUrl: string;
  sourceLayer: string;
}

export type BasemapId = 'positron' | 'satellite' | 'cyclosm' | 'hilliness' | 'imd';

export type LineOrder = 'slc' | 'sic' | 'sivaluecomb' | 'sico2';

export interface BasemapOption {
  id: BasemapId;
  name: string;
  description: string;
  thumbnailUrl?: string;
}

export interface AppState {
  region: string;
  zoom: number;
  lat: number;
  lng: number;
  purpose: Purpose;
  geography: Geography;
  scenario: Scenario;
  layers: LayerId[];
  basemap: BasemapId;
  n: number;
  lineOrder: LineOrder;
}

export interface Toast {
  id: string;
  title?: string;
  message: string;
  type: 'info' | 'warning' | 'error' | 'success';
  timestamp: number;
  duration?: number;
}

export interface FeatureHoverInfo {
  layerId: string;
  properties: Record<string, any>;
  lngLat: { lng: number; lat: number };
}
