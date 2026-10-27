import type { StyleSpecification, ExpressionSpecification } from 'maplibre-gl';
import type { BasemapId, Purpose, Scenario } from './types';

export const BASEMAP_TILES: Record<BasemapId, { tiles: string[]; attribution: string; maxzoom?: number }> = {
  positron: {
    tiles: [
      'https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png',
      'https://b.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png',
      'https://c.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png',
      'https://d.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png'
    ],
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions" target="_blank">CARTO</a>',
    maxzoom: 19
  },
  satellite: {
    tiles: [
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
    ],
    attribution: 'Tiles &copy; <a href="https://www.esri.com" target="_blank">Esri</a> &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community',
    maxzoom: 19
  },
  cyclosm: {
    tiles: [
      'https://a.tile-cyclosm.openstreetmap.fr/cyclosm/{z}/{x}/{y}.png',
      'https://b.tile-cyclosm.openstreetmap.fr/cyclosm/{z}/{x}/{y}.png',
      'https://c.tile-cyclosm.openstreetmap.fr/cyclosm/{z}/{x}/{y}.png'
    ],
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a> contributors, Tiles &copy; <a href="https://www.cyclosm.org" target="_blank">CyclOSM</a>',
    maxzoom: 18
  }
};

export function getBasemapStyle(basemapId: BasemapId): StyleSpecification {
  const config = BASEMAP_TILES[basemapId] || BASEMAP_TILES.positron;
  return {
    version: 8,
    name: `PCT-${basemapId}`,
    sources: {
      'raster-basemap': {
        type: 'raster',
        tiles: config.tiles,
        tileSize: 256,
        attribution: config.attribution,
        maxzoom: config.maxzoom || 19
      }
    },
    layers: [
      {
        id: 'raster-basemap-layer',
        type: 'raster',
        source: 'raster-basemap',
        minzoom: 0,
        maxzoom: (config.maxzoom || 19) + 1,
        paint: {
          'raster-opacity': 1,
          'raster-fade-duration': 100
        }
      }
    ]
  };
}

/**
 * Returns property key for cyclists count in a given scenario.
 * School travel data uses the `sic` suffix (scenario individual cyclists);
 * commuting uses `slc`. Cambridge exists only in the school layer.
 */
export function getScenarioCyclistsProperty(scenario: Scenario, purpose: Purpose = 'commute'): string {
  const suffix = purpose === 'school' ? 'sic' : 'slc';
  switch (scenario) {
    case 'govtarget':
      return `govtarget_${suffix}`;
    case 'gendereq':
      return 'gendereq_slc';
    case 'govnearmkt':
      return `govnearmkt_${suffix}`;
    case 'cambridge':
      return `cambridge_${suffix}`;
    case 'dutch':
      return `dutch_${suffix}`;
    case 'ebike':
      return 'ebike_slc';
    case 'base':
    default:
      return 'bicycle';
  }
}

/**
 * Alternative fallback keys for cyclist counts in diverse shapefiles/pmtiles
 */
export function getScenarioCyclistExpression(scenario: Scenario, purpose: Purpose = 'commute'): ExpressionSpecification {
  const primaryKey = getScenarioCyclistsProperty(scenario, purpose);
  const altKey = scenario;
  const suffix = purpose === 'school' ? 'sic' : 'slc';
  return [
    'coalesce',
    ['get', primaryKey],
    ['get', altKey],
    ['get', `${scenario}_${suffix}`],
    ['get', `${scenario}_slc`],
    ['get', 'bicycle'],
    ['get', 'bicycle_slc'],
    0
  ] as ExpressionSpecification;
}

/**
 * Zone Choropleth Fill Color expression:
 * Computes cycling share %: (cyclists / all) * 100
 * Or direct pct_cyclists property if available
 */
/**
 * Zone choropleth: exact pct-shiny colour ramp.
 * RColorBrewer RdYlBu (10) with pct-shiny's #E0F3F8 -> #C6DBEF swap, applied
 * over the legacy commute bins: 0-1.5, 1.5-3.5, 3.5-6.5, 6.5-9.5, 9.5-14.5,
 * 14.5-19.5, 19.5-24.5, 24.5-29.5, 29.5-39.5, 39.5-100 (%).
 * Implemented as a step function (step:false would interpolate between bins).
 */
export const ZONE_BREAKS = [1.5, 3.5, 6.5, 9.5, 14.5, 19.5, 24.5, 29.5, 39.5, 100];
// pct-shiny's exact zone ramp: RColorBrewer RdYlBu(10) with shiny's #E0F3F8
// low-end swap, matching the legend bins 0-1,2-3,4-6,...,40+ on www.pct.bike.
export const ZONE_COLORS = [
  '#A63603', '#D95F02', '#F46D43', '#FDAE61', '#FEE090',
  '#E0F3F8', '#ABD9E9', '#74ADD1', '#4575B4', '#313695'
];

export function getZoneFillColorExpression(scenario: Scenario, purpose: Purpose = 'commute'): ExpressionSpecification {
  const cyclistsExpr = getScenarioCyclistExpression(scenario, purpose);

  // cycling percentage = (cyclists / all) * 100, binned like pct-shiny
  const pctExpression: ExpressionSpecification = [
    'case',
    ['has', 'pct_cyclists'],
    ['get', 'pct_cyclists'],
    ['has', `${scenario}_pct`],
    ['get', `${scenario}_pct`],
    ['>', ['coalesce', ['get', 'all'], 0], 0],
    ['*', 100, ['/', cyclistsExpr, ['get', 'all']]],
    0
  ];

  // step expression: one colour per legacy bin
  return [
    'step',
    pctExpression,
    ZONE_COLORS[0],
    ZONE_BREAKS[0], ZONE_COLORS[1],
    ZONE_BREAKS[1], ZONE_COLORS[2],
    ZONE_BREAKS[2], ZONE_COLORS[3],
    ZONE_BREAKS[3], ZONE_COLORS[4],
    ZONE_BREAKS[4], ZONE_COLORS[5],
    ZONE_BREAKS[5], ZONE_COLORS[6],
    ZONE_BREAKS[6], ZONE_COLORS[7],
    ZONE_BREAKS[7], ZONE_COLORS[8],
    ZONE_BREAKS[8], ZONE_COLORS[9]
  ] as unknown as ExpressionSpecification;
}

/**
 * Flow line width: proportional to the active scenario's cyclist count.
 * Used for desire lines and fast/quiet routes alike (pct-shiny normalises
 * line weight to flow for every non-route-network layer).
 */
export function getFlowLineWidthExpression(scenario: Scenario, purpose: Purpose = 'commute'): ExpressionSpecification {
  const cyclistsExpr = getScenarioCyclistExpression(scenario, purpose);
  return [
    'interpolate',
    ['linear'],
    cyclistsExpr,
    1, 1.2,
    10, 2.5,
    50, 4.5,
    200, 7.0,
    800, 12.0
  ] as ExpressionSpecification;
}

/**
 * Desire Lines line-width expression based on cyclist volume
 */
export function getDesireLineWidthExpression(scenario: Scenario, purpose: Purpose = 'commute'): ExpressionSpecification {
  const cyclistsExpr = getScenarioCyclistExpression(scenario, purpose);
  return [
    'interpolate',
    ['linear'],
    cyclistsExpr,
    1, 1.2,
    10, 2.2,
    50, 4.0,
    150, 7.0,
    400, 11.0,
    800, 16.0
  ] as ExpressionSpecification;
}

/**
 * Desire Lines line-color expression
 */
export function getDesireLineColorExpression(scenario: Scenario, purpose: Purpose = 'commute'): ExpressionSpecification {
  const cyclistsExpr = getScenarioCyclistExpression(scenario, purpose);
  return [
    'interpolate',
    ['linear'],
    cyclistsExpr,
    1, '#800000',
    10, '#800000',
    50, '#800000',
    200, '#800000',
    500, '#800000'
  ] as ExpressionSpecification;
}

/**
 * Route Network (RNet) line-width expression
 */
export function getRNetLineWidthExpression(scenario: Scenario, purpose: Purpose = 'commute'): ExpressionSpecification {
  const cyclistsExpr = getScenarioCyclistExpression(scenario, purpose);
  return [
    'interpolate',
    ['linear'],
    cyclistsExpr,
    1, 0.75,
    25, 1.5,
    100, 2.75,
    300, 4.25,
    1000, 6.5
  ] as ExpressionSpecification;
}

/**
 * Route Network (RNet) line-color expression
 */
export function getRNetLineColorExpression(scenario: Scenario, purpose: Purpose = 'commute'): ExpressionSpecification {
  const cyclistsExpr = getScenarioCyclistExpression(scenario, purpose);
  // pct-shiny renders route networks in a single blue hue; volume is carried
  // by line width, not colour. Keep one hue across all flow bins.
  return ['interpolate', ['linear'], cyclistsExpr, 0, '#4575B4', 1000, '#313695'] as unknown as ExpressionSpecification;
}
