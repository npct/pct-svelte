import type * as maplibregl from 'maplibre-gl';
import type { StyleSpecification, ExpressionSpecification } from 'maplibre-gl';
import type { BasemapId, LineOrder, Purpose, Scenario } from './types';

export interface BasemapTileConfig {
  tiles: string[];
  labelTiles?: string[];
  baseOpacity?: number;
  attribution: string;
  maxzoom?: number;
}

export const BASEMAP_TILES: Record<BasemapId, BasemapTileConfig> = {
  positron: {
    tiles: [
      'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}',
      'https://services.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}'
    ],
    labelTiles: [
      'https://services.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}',
      'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}'
    ],
    attribution: 'Tiles &copy; <a href="https://www.esri.com" target="_blank">Esri</a> &mdash; Esri, DeLorme, NAVTEQ',
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
  },
  hilliness: {
    tiles: [
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Shaded_Relief/MapServer/tile/{z}/{y}/{x}',
      'https://services.arcgisonline.com/ArcGIS/rest/services/World_Shaded_Relief/MapServer/tile/{z}/{y}/{x}'
    ],
    labelTiles: [
      'https://services.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}',
      'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}'
    ],
    attribution: 'Tiles &copy; <a href="https://www.esri.com" target="_blank">Esri</a> &mdash; World Shaded Relief',
    maxzoom: 13
  },
  imd: {
    tiles: [
      'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}'
    ],
    labelTiles: [
      'https://services.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}',
      'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}'
    ],
    baseOpacity: 0.15,
    attribution: 'Map tiles by <a href="https://maps.cdrc.ac.uk" target="_blank">CDRC</a> / Index of Multiple Deprivation, CC BY 3.0 &mdash; Data &copy; <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a>',
    maxzoom: 19
  }
};

export const IMD_COLORS = [
  '#a50026',
  '#d73027',
  '#f46d43',
  '#fdae61',
  '#fee08b',
  '#d9ef8b',
  '#a6d96a',
  '#66bd63',
  '#1a9850',
  '#006837'
];

export const IMD_LABELS = [
  'Most deprived tenth',
  '2nd',
  '3rd',
  '4th',
  '5th',
  '6th',
  '7th',
  '8th',
  '9th',
  'Least deprived tenth'
];

const ALL_BASEMAP_IDS: BasemapId[] = ['positron', 'cyclosm', 'satellite', 'hilliness', 'imd'];

export function getBasemapStyle(activeBasemapId: BasemapId = 'positron'): StyleSpecification {
  const sources: StyleSpecification['sources'] = {};
  const layers: StyleSpecification['layers'] = [];

  for (const id of ALL_BASEMAP_IDS) {
    const config = BASEMAP_TILES[id];
    const maxzoom = config.maxzoom || 19;
    const isVisible = id === activeBasemapId;
    const srcId = `raster-base-${id}`;
    sources[srcId] = {
      type: 'raster',
      tiles: config.tiles,
      tileSize: 256,
      attribution: config.attribution,
      maxzoom
    };
    layers.push({
      id: `${srcId}-layer`,
      type: 'raster',
      source: srcId,
      minzoom: 0,
      maxzoom: 22,
      layout: {
        visibility: isVisible ? 'visible' : 'none'
      },
      paint: {
        'raster-opacity': config.baseOpacity ?? 1,
        'raster-fade-duration': 100
      }
    });
    if (config.labelTiles?.length) {
      const labelSrcId = `raster-labels-${id}`;
      sources[labelSrcId] = {
        type: 'raster',
        tiles: config.labelTiles,
        tileSize: 256,
        maxzoom: 19
      };
      layers.push({
        id: `${labelSrcId}-layer`,
        type: 'raster',
        source: labelSrcId,
        minzoom: 0,
        maxzoom: 22,
        layout: {
          visibility: isVisible ? 'visible' : 'none'
        },
        paint: {
          'raster-opacity': 1,
          'raster-fade-duration': 100
        }
      });
    }
  }

  return {
    version: 8,
    name: 'PCT-Basemaps',
    sources,
    layers
  };
}

export function applyBasemapVisibility(map: maplibregl.Map, activeBasemapId: BasemapId) {
  for (const id of ALL_BASEMAP_IDS) {
    const vis = id === activeBasemapId ? 'visible' : 'none';
    const baseLayer = `raster-base-${id}-layer`;
    const labelLayer = `raster-labels-${id}-layer`;
    if (map.getLayer(baseLayer)) {
      map.setLayoutProperty(baseLayer, 'visibility', vis);
    }
    if (map.getLayer(labelLayer)) {
      map.setLayoutProperty(labelLayer, 'visibility', vis);
    }
  }
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
  if (purpose === 'school' && scenario !== 'base') {
    return [
      'case',
      ['has', `${scenario}_slc`],
      ['get', `${scenario}_slc`],
      ['+', ['coalesce', ['get', 'bicycle'], 0], ['coalesce', ['get', `${scenario}_sic`], 0]]
    ] as unknown as ExpressionSpecification;
  }
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
 * Returns numeric ordering score for a desire line or route segment in a given
 * scenario and `lineOrder` metric (`slc`, `sic`, `sivaluecomb`, `sico2`),
 * matching `pct_shiny_server.R:473-511`.
 */
export function getLineOrderValue(
  props: Record<string, any> | undefined,
  scenario: Scenario,
  purpose: Purpose = 'commute',
  lineOrder: LineOrder = 'slc'
): number {
  if (!props) return 0;
  const primaryKey = getScenarioCyclistsProperty(scenario, purpose);
  const suffix = purpose === 'school' ? 'sic' : 'slc';
  const slc = Number(
    props[primaryKey] ??
    props[scenario] ??
    props[`${scenario}_${suffix}`] ??
    props[`${scenario}_slc`] ??
    props.bicycle ??
    props.bicycle_slc ??
    0
  );
  if (scenario === 'base' || lineOrder === 'slc') {
    return slc;
  }
  const base = Number(props.bicycle ?? props.bicycle_slc ?? 0);
  if (lineOrder === 'sic') {
    const rawSic = props[`${scenario}_sic`];
    return rawSic !== undefined && rawSic !== null ? Number(rawSic) : slc - base;
  }
  if (lineOrder === 'sivaluecomb') {
    const comb = props[`${scenario}_sivaluecomb`];
    if (comb !== undefined && comb !== null) return Number(comb);
    const yll = Number(props[`${scenario}_sivalueyll`] ?? 0);
    const sick = Number(props[`${scenario}_sivaluesick`] ?? 0);
    return yll + sick;
  }
  if (lineOrder === 'sico2') {
    return Math.abs(Number(props[`${scenario}_sico2`] ?? 0));
  }
  return slc;
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
 * For school travel, pct-shiny adds an 11th bin: 39.5-49.5 and 49.5-100 (#2d004b).
 */
export const ZONE_BREAKS = [1.5, 3.5, 6.5, 9.5, 14.5, 19.5, 24.5, 29.5, 39.5, 100];
export const SCHOOL_ZONE_BREAKS = [1.5, 3.5, 6.5, 9.5, 14.5, 19.5, 24.5, 29.5, 39.5, 49.5, 100];
// pct-shiny's exact zone ramp: RColorBrewer RdYlBu(10) with shiny's #E0F3F8
// low-end swap, matching the legend bins 0-1,2-3,4-6,...,40+ on www.pct.bike.
export const ZONE_COLORS = [
  '#A63603', '#D95F02', '#F46D43', '#FDAE61', '#FEE090',
  '#E0F3F8', '#ABD9E9', '#74ADD1', '#4575B4', '#313695'
];
export const SCHOOL_ZONE_COLORS = [...ZONE_COLORS, '#2d004b'];

export function getZoneFillColorExpression(scenario: Scenario, purpose: Purpose = 'commute'): ExpressionSpecification {
  const cyclistsExpr = getScenarioCyclistExpression(scenario, purpose);

  // In school_zones.pmtiles, `govtarget_sic`, `cambridge_sic`, `dutch_sic` store
  // the *increase* in cyclists (`sic`), whereas `bicycle` is baseline cyclists.
  // Total cyclists in a school scenario is `bicycle + <scenario>_sic` when `<scenario>_slc` is absent.
  const totalCyclistsExpr: ExpressionSpecification =
    purpose === 'school' && scenario !== 'base'
      ? ([
          'case',
          ['has', `${scenario}_slc`],
          ['get', `${scenario}_slc`],
          ['+', ['coalesce', ['get', 'bicycle'], 0], ['coalesce', ['get', `${scenario}_sic`], 0]]
        ] as unknown as ExpressionSpecification)
      : cyclistsExpr;

  // cycling percentage = (cyclists / all) * 100, binned like pct-shiny
  const pctExpression: ExpressionSpecification = [
    'case',
    ['has', 'pct_cyclists'],
    ['get', 'pct_cyclists'],
    ['has', `${scenario}_pct`],
    ['get', `${scenario}_pct`],
    ['>', ['coalesce', ['get', 'all'], 0], 0],
    ['*', 100, ['/', totalCyclistsExpr, ['get', 'all']]],
    0
  ];

  if (purpose === 'school') {
    return [
      'step',
      pctExpression,
      SCHOOL_ZONE_COLORS[0],
      SCHOOL_ZONE_BREAKS[0], SCHOOL_ZONE_COLORS[1],
      SCHOOL_ZONE_BREAKS[1], SCHOOL_ZONE_COLORS[2],
      SCHOOL_ZONE_BREAKS[2], SCHOOL_ZONE_COLORS[3],
      SCHOOL_ZONE_BREAKS[3], SCHOOL_ZONE_COLORS[4],
      SCHOOL_ZONE_BREAKS[4], SCHOOL_ZONE_COLORS[5],
      SCHOOL_ZONE_BREAKS[5], SCHOOL_ZONE_COLORS[6],
      SCHOOL_ZONE_BREAKS[6], SCHOOL_ZONE_COLORS[7],
      SCHOOL_ZONE_BREAKS[7], SCHOOL_ZONE_COLORS[8],
      SCHOOL_ZONE_BREAKS[8], SCHOOL_ZONE_COLORS[9],
      SCHOOL_ZONE_BREAKS[9], SCHOOL_ZONE_COLORS[10]
    ] as unknown as ExpressionSpecification;
  }

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
