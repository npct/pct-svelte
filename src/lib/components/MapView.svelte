<script lang="ts">
  import { onMount } from 'svelte';
  import * as maplibregl from 'maplibre-gl';
  import 'maplibre-gl/dist/maplibre-gl.css';
  import {
    MapLibre,
    VectorTileSource,
    FillLayer,
    LineLayer,
    CircleLayer,
    Popup,
    NavigationControl,
    ScaleControl
  } from 'svelte-maplibre-gl';
  import { appState } from '../state.svelte';
  import { initPMTilesProtocol, getPMTilesUrl } from '../pmtiles';
  import {
    getBasemapStyle,
    getZoneFillColorExpression,
    getDesireLineWidthExpression,
    getDesireLineColorExpression,
    getFlowLineWidthExpression,
    getRNetLineWidthExpression,
    getRNetLineColorExpression,
    getScenarioCyclistExpression,
    getScenarioCyclistsProperty
  } from '../mapStyles';
  import type { FeatureHoverInfo } from '../types';
  import HoverPopup from './HoverPopup.svelte';
  import Legend from './Legend.svelte';

  // Initialize PMTiles protocol prior to MapLibre initialization
  initPMTilesProtocol();

  let mapInstance = $state<maplibregl.Map | undefined>(undefined);
  let hoverInfo = $state<FeatureHoverInfo | null>(null);
  let popupPinned = $state(false);
  let mapCursor = $state<string>('grab');
  const popupAnchor = $derived.by(() => {
    if (!hoverInfo || !mapInstance) return 'bottom';
    const point = mapInstance.project([hoverInfo.lngLat.lng, hoverInfo.lngLat.lat]);
    return point.x > mapInstance.getCanvas().width - 380 ? 'right' : 'left';
  });

  // Derived basemap style
  const basemapStyle = $derived(getBasemapStyle(appState.basemap));

  // Dataset-dependent asset paths: /data/<purpose>/<geography>/<file>
  const datasetKey = $derived(`${appState.purpose}/${appState.geography}`);
  // Asset names are geography-specific for commute data. School assets are
  // already LSOA-only, matching pct-shiny's school view.
  const regionFile = $derived((name: string) => {
    const commuteAsset = appState.purpose === 'commute' && name === 'rnet' ? 'rnet_lsoa' : name;
    const lsoaAssets = new Set(['zones', 'desire_lines', 'routes_fast', 'routes_quiet']);
    const suffix = appState.purpose === 'commute' && appState.geography === 'lsoa' && lsoaAssets.has(commuteAsset) ? '_lsoa' : '';
    return `/data/regions/${appState.region}/${commuteAsset}${suffix}.pmtiles`;
  });
  const regionKey = $derived(`${appState.region}/${datasetKey}`);

  // Layer styling expressions (purpose-aware: school uses `sic` scenario fields)
  const zoneFillColor = $derived(getZoneFillColorExpression(appState.scenario, appState.purpose));
  const desireLineWidth = $derived(getDesireLineWidthExpression(appState.scenario, appState.purpose));
  const desireLineColor = $derived(getDesireLineColorExpression(appState.scenario, appState.purpose));
  const rnetLineWidth = $derived(getRNetLineWidthExpression(appState.scenario, appState.purpose));
  const rnetLineColor = $derived(getRNetLineColorExpression(appState.scenario, appState.purpose));

  // Base desire layer filter: any feature with cycling potential. The visible
  // top-N selection is handled by the viewport-ranked overlay instead.
  const desireFilter = $derived([
    'all',
    ['>=', getScenarioCyclistExpression(appState.scenario, appState.purpose), 0.5]
  ]);

  type LineKind = 'desire' | 'fast' | 'quiet';

  interface LineKindConfig {
    sourceId: string;
    sourceLayer: string;
    baseLayerId: string;
    viewportSourceId: string;
    viewportIds: [string, string];
    opacity: number; // pct-shiny: 0.8 straight lines, 0.5 routes
    color: maplibregl.ExpressionSpecification | string;
  }

  const LINE_KINDS: Record<LineKind, LineKindConfig> = {
    desire: {
      sourceId: 'desire-source',
      sourceLayer: 'desire_lines',
      baseLayerId: 'desire-lines',
      viewportSourceId: 'pct-vp-desire-source',
      viewportIds: ['pct-vp-desire-casing', 'pct-vp-desire-lines'],
      opacity: 0.85,
      color: '#800000'
    },
    fast: {
      sourceId: 'routes-fast-source',
      sourceLayer: 'routes_fast',
      baseLayerId: 'routes-fast-lines',
      viewportSourceId: 'pct-vp-fast-source',
      viewportIds: ['pct-vp-fast-casing', 'pct-vp-fast-lines'],
      opacity: 0.5,
      color: '#800080'
    },
    quiet: {
      sourceId: 'routes-quiet-source',
      sourceLayer: 'routes_quiet',
      baseLayerId: 'routes-quiet-lines',
      viewportSourceId: 'pct-vp-quiet-source',
      viewportIds: ['pct-vp-quiet-casing', 'pct-vp-quiet-lines'],
      opacity: 0.5,
      color: '#006400'
    }
  };

  const ALL_LINE_KINDS: LineKind[] = ['desire', 'fast', 'quiet'];
  const ALL_VIEWPORT_LAYER_IDS = ALL_LINE_KINDS.flatMap((kind) => LINE_KINDS[kind].viewportIds);
  const INTERACTIVE_VIEWPORT_LAYER_IDS = ALL_LINE_KINDS.map((kind) => LINE_KINDS[kind].viewportIds[1]);
  const FROZEN_SOURCE_ID = 'pct-frozen-lines-source';
  const FROZEN_LAYER_IDS = ['pct-frozen-lines-casing', 'pct-frozen-lines'];
  const flowLineWidth = $derived(getFlowLineWidthExpression(appState.scenario, appState.purpose));
  const viewportKeys: Record<LineKind, string> = { desire: '', fast: '', quiet: '' };
  const viewportFeatures: Record<LineKind, any[]> = { desire: [], fast: [], quiet: [] };
  let frozenCandidatesByKind: Record<LineKind, any[]> = { desire: [], fast: [], quiet: [] };
  let lastAppliedFreezeRevision = 0;

  // School uses differently named asset files within its dataset folder.
  const zoneFile = $derived(appState.purpose === 'school' ? 'school_zones' : 'zones');
  const rnetFile = $derived(appState.purpose === 'school' ? 'school_rnet' : 'rnet');
  // Zones source URL is purpose-aware: school travel uses the LSOA
  // school_zones.pmtiles (mirrors pct-shiny auto-switching to LSOA), while
  // commuting shows the MSOA zones layer.
  const regionZonesUrl = $derived(regionFile(zoneFile));
  // Line layers ship where the region data release provides them (manifest-driven).
  const currentAsset = (name: string) => {
    if (name === 'rnet') return appState.purpose === 'school' ? 'school_rnet' : 'rnet_lsoa';
    return appState.purpose === 'commute' && appState.geography === 'lsoa' ? `${name}_lsoa` : name;
  };
  const hasDesire = $derived(appState.hasRegionData(currentAsset('desire_lines')));
  const hasRoutes = $derived(appState.hasRegionData(currentAsset('routes_fast')));
  const hasRnet = $derived(appState.hasRegionData(currentAsset('rnet')));

  function ensureLineLayersOnTop(map: maplibregl.Map) {
    for (const id of [...ALL_VIEWPORT_LAYER_IDS, ...FROZEN_LAYER_IDS]) {
      if (map.getLayer(id)) {
        map.moveLayer(id);
      }
    }
  }

  function clearStalePopupForLines(visibleFeatures: any[]) {
    if (!hoverInfo) return;
    const isLinePopup =
      hoverInfo.layerId.includes('desire') ||
      hoverInfo.layerId.includes('fast') ||
      hoverInfo.layerId.includes('quiet') ||
      hoverInfo.layerId === 'pct-frozen-lines';
    if (!isLinePopup) return;
    const code1 = hoverInfo.properties?.geo_code1;
    const code2 = hoverInfo.properties?.geo_code2;
    const style = hoverInfo.properties?.__pct_style;
    const stillVisible = visibleFeatures.some(
      (f) =>
        f.properties?.geo_code1 === code1 &&
        f.properties?.geo_code2 === code2 &&
        (!style || f.properties?.__pct_style === style)
    );
    if (!stillVisible) {
      popupPinned = false;
      hoverInfo = null;
      mapCursor = 'grab';
    }
  }

  function clearViewportLines(map: maplibregl.Map, kind: LineKind) {
    const cfg = LINE_KINDS[kind];
    for (const id of cfg.viewportIds) {
      if (map.getLayer(id)) map.removeLayer(id);
    }
    if (map.getSource(cfg.viewportSourceId)) map.removeSource(cfg.viewportSourceId);
    viewportKeys[kind] = '';
    viewportFeatures[kind] = [];
  }

  function geometryIntersectsBounds(geometry: any, bounds: maplibregl.LngLatBounds) {
    const visit = (coords: any): boolean => {
      if (typeof coords?.[0] === 'number') {
        return coords[0] >= bounds.getWest() && coords[0] <= bounds.getEast()
          && coords[1] >= bounds.getSouth() && coords[1] <= bounds.getNorth();
      }
      return Array.isArray(coords) && coords.some(visit);
    };
    return visit(geometry?.coordinates);
  }

  function queryRankedViewportCandidates(map: maplibregl.Map, kind: LineKind, limit: number): any[] {
    const cfg = LINE_KINDS[kind];
    if (!map.getSource(cfg.sourceId)) return [];
    const bounds = map.getBounds();
    const countProperty = getScenarioCyclistsProperty(appState.scenario, appState.purpose);
    const seen = new Set<string>();
    const raw = map.querySourceFeatures(cfg.sourceId, { sourceLayer: cfg.sourceLayer });
    const deduplicated: any[] = [];
    for (const feature of raw) {
      const count = Number(feature.properties?.[countProperty] ?? feature.properties?.bicycle ?? 0);
      if (count <= 0) continue;
      const id = `${feature.properties?.geo_code1 ?? ''}|${feature.properties?.geo_code2 ?? ''}`;
      if (seen.has(id)) continue;
      seen.add(id);
      deduplicated.push(feature);
    }
    deduplicated.sort(
      (a, b) =>
        Number(b.properties?.[countProperty] ?? b.properties?.bicycle ?? 0) -
        Number(a.properties?.[countProperty] ?? a.properties?.bicycle ?? 0)
    );
    // Decode lazy feature.geometry only for top-ranked candidates until `limit` is reached
    const selected: any[] = [];
    for (const feature of deduplicated) {
      if (selected.length >= limit) break;
      const geom = feature.geometry;
      if (!geometryIntersectsBounds(geom, bounds)) continue;
      selected.push({
        type: 'Feature' as const,
        properties: { ...feature.properties, __pct_style: kind },
        geometry: geom
      });
    }
    return selected;
  }

  /** Rank loaded candidates inside the current viewport by scenario cyclists and
   *  keep the top N, matching pct-shiny's sort_lines() behaviour. */
  function refreshViewportLines(map: maplibregl.Map, kind: LineKind, force = false) {
    const cfg = LINE_KINDS[kind];
    if (!map.getLayer(cfg.baseLayerId) || appState.freezeLines) return;
    const bounds = map.getBounds();
    const key = [
      appState.region,
      appState.purpose,
      appState.geography,
      appState.basemap,
      bounds.getWest(),
      bounds.getSouth(),
      bounds.getEast(),
      bounds.getNorth(),
      appState.scenario,
      appState.n
    ]
      .map((value) => typeof value === 'number' ? value.toFixed(4) : value)
      .join('|');
    const existingSource = map.getSource(cfg.viewportSourceId) as maplibregl.GeoJSONSource | undefined;
    if (!force && existingSource && key === viewportKeys[kind]) return;

    const candidates = queryRankedViewportCandidates(map, kind, appState.n);
    viewportFeatures[kind] = candidates;

    // Only cache the viewport key once tiles have actually loaded features so
    // an early check while PMTiles are still streaming does not block onIdle.
    if (candidates.length > 0 && map.isSourceLoaded(cfg.sourceId)) {
      viewportKeys[kind] = key;
    } else {
      viewportKeys[kind] = '';
    }

    const lineWidthExpr = kind === 'desire' ? (desireLineWidth as any) : (flowLineWidth as any);
    const lineColorExpr = kind === 'desire' ? (desireLineColor as any) : (cfg.color as any);

    if (existingSource) {
      existingSource.setData({ type: 'FeatureCollection', features: candidates } as any);
      if (map.getLayer(cfg.viewportIds[0])) {
        map.setLayoutProperty(cfg.viewportIds[0], 'visibility', 'visible');
        map.setPaintProperty(cfg.viewportIds[0], 'line-width', ['+', lineWidthExpr, 1.5]);
      }
      if (map.getLayer(cfg.viewportIds[1])) {
        map.setLayoutProperty(cfg.viewportIds[1], 'visibility', 'visible');
        map.setPaintProperty(cfg.viewportIds[1], 'line-width', lineWidthExpr);
        map.setPaintProperty(cfg.viewportIds[1], 'line-color', lineColorExpr);
      }
      ensureLineLayersOnTop(map);
      return;
    }

    if (!candidates.length) return;

    map.addSource(cfg.viewportSourceId, {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: candidates } as any
    });
    map.addLayer({
      id: cfg.viewportIds[0],
      type: 'line',
      source: cfg.viewportSourceId,
      paint: {
        'line-color': '#ffffff',
        'line-width': ['+', lineWidthExpr, 1.5],
        'line-opacity': 0.5
      } as any
    });
    map.addLayer({
      id: cfg.viewportIds[1],
      type: 'line',
      source: cfg.viewportSourceId,
      paint: {
        'line-color': lineColorExpr,
        'line-width': lineWidthExpr,
        'line-opacity': cfg.opacity,
        ...(kind === 'quiet' ? { 'line-dasharray': [2, 1] } : {})
      } as any
    });
    ensureLineLayersOnTop(map);
  }

  function clearFrozenLines(map: maplibregl.Map) {
    for (const id of FROZEN_LAYER_IDS) {
      if (map.getLayer(id)) map.removeLayer(id);
    }
    if (map.getSource(FROZEN_SOURCE_ID)) map.removeSource(FROZEN_SOURCE_ID);
    for (const kind of ALL_LINE_KINDS) {
      for (const id of LINE_KINDS[kind].viewportIds) {
        if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', 'visible');
      }
    }
    lastAppliedFreezeRevision = 0;
  }

  function captureFrozenCandidates(map: maplibregl.Map) {
    for (const kind of ALL_LINE_KINDS) {
      if (appState.isLayerActive(kind)) {
        const queried = queryRankedViewportCandidates(map, kind, 100);
        frozenCandidatesByKind[kind] = queried.length > 0 ? queried : [...viewportFeatures[kind]];
      } else {
        frozenCandidatesByKind[kind] = [];
      }
    }
  }

  function renderFrozenLines(map: maplibregl.Map, recapture = false) {
    if (recapture) {
      captureFrozenCandidates(map);
    }

    const countProperty = getScenarioCyclistsProperty(appState.scenario, appState.purpose);
    const activeKinds = ALL_LINE_KINDS.filter((kind) => appState.isLayerActive(kind));
    const features = activeKinds.flatMap((kind) => {
      const pool = frozenCandidatesByKind[kind] ?? [];
      return [...pool]
        .sort((a, b) => Number(b.properties?.[countProperty] ?? b.properties?.bicycle ?? 0) - Number(a.properties?.[countProperty] ?? a.properties?.bicycle ?? 0))
        .slice(0, appState.n);
    });

    appState.frozenLineCount = features.length;
    clearStalePopupForLines(features);

    for (const id of ALL_VIEWPORT_LAYER_IDS) {
      if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', 'none');
    }

    const existingSource = map.getSource(FROZEN_SOURCE_ID) as maplibregl.GeoJSONSource | undefined;
    if (existingSource) {
      existingSource.setData({ type: 'FeatureCollection', features } as any);
      if (map.getLayer('pct-frozen-lines-casing')) {
        map.setPaintProperty('pct-frozen-lines-casing', 'line-width', ['+', flowLineWidth as any, 1.5]);
      }
      if (map.getLayer('pct-frozen-lines')) {
        map.setPaintProperty('pct-frozen-lines', 'line-width', flowLineWidth as any);
        map.setPaintProperty('pct-frozen-lines', 'line-color', [
          'match',
          ['get', '__pct_style'],
          'desire',
          desireLineColor as any,
          'fast',
          '#800080',
          'quiet',
          '#006400',
          '#64748b'
        ] as any);
      }
      ensureLineLayersOnTop(map);
      return;
    }

    if (!features.length) return;

    map.addSource(FROZEN_SOURCE_ID, {
      type: 'geojson',
      data: { type: 'FeatureCollection', features } as any
    });
    map.addLayer({
      id: 'pct-frozen-lines-casing',
      type: 'line',
      source: FROZEN_SOURCE_ID,
      paint: {
        'line-color': '#ffffff',
        'line-opacity': 0.6,
        'line-width': ['+', flowLineWidth as any, 1.5]
      } as any
    });
    map.addLayer({
      id: 'pct-frozen-lines',
      type: 'line',
      source: FROZEN_SOURCE_ID,
      paint: {
        'line-color': [
          'match',
          ['get', '__pct_style'],
          'desire',
          desireLineColor as any,
          'fast',
          '#800080',
          'quiet',
          '#006400',
          '#64748b'
        ],
        'line-width': flowLineWidth as any,
        'line-opacity': [
          'match',
          ['get', '__pct_style'],
          'desire',
          0.85,
          'fast',
          0.5,
          'quiet',
          0.5,
          0.85
        ]
      } as any
    });
    ensureLineLayersOnTop(map);
  }

  $effect(() => {
    const map = mapInstance;
    const frozen = appState.freezeLines;
    const revision = appState.freezeRevision;
    void appState.scenario;
    void appState.n;
    void appState.basemap;
    void appState.layers;
    void appState.purpose;
    void appState.geography;
    if (!map) return;

    const apply = () => {
      const activeKinds = ALL_LINE_KINDS.filter((kind) => appState.isLayerActive(kind));
      for (const kind of ALL_LINE_KINDS) {
        if (!activeKinds.includes(kind)) {
          clearViewportLines(map, kind);
          frozenCandidatesByKind[kind] = [];
        }
      }
      if (frozen && activeKinds.length) {
        const shouldRecapture = revision !== lastAppliedFreezeRevision || activeKinds.every((k) => frozenCandidatesByKind[k].length === 0);
        lastAppliedFreezeRevision = revision;
        renderFrozenLines(map, shouldRecapture);
      } else {
        clearFrozenLines(map);
        for (const kind of activeKinds) {
          refreshViewportLines(map, kind, true);
        }
        const visible = activeKinds.flatMap((kind) => viewportFeatures[kind]);
        clearStalePopupForLines(visible);
      }
      ensureLineLayersOnTop(map);
    };
    if (map.isStyleLoaded()) apply();
    else map.once('idle', apply);
  });

  $effect(() => {
    const map = mapInstance;
    if (!map) return;
    const syncLoadedSources = () => {
      if (appState.freezeLines) {
        const activeKinds = ALL_LINE_KINDS.filter((kind) => appState.isLayerActive(kind));
        const needsCapture = activeKinds.every((k) => frozenCandidatesByKind[k].length === 0);
        if (activeKinds.length && (needsCapture || !map.getSource(FROZEN_SOURCE_ID))) {
          renderFrozenLines(map, needsCapture);
        }
        return;
      }
      for (const kind of ALL_LINE_KINDS) {
        if (appState.isLayerActive(kind)) refreshViewportLines(map, kind);
      }
    };
    const onSourceData = (e: maplibregl.MapSourceDataEvent) => {
      if (!e.isSourceLoaded) return;
      if (
        e.sourceId === 'desire-source' ||
        e.sourceId === 'routes-fast-source' ||
        e.sourceId === 'routes-quiet-source'
      ) {
        syncLoadedSources();
      }
    };
    map.on('idle', syncLoadedSources);
    map.on('sourcedata', onSourceData);
    return () => {
      map.off('idle', syncLoadedSources);
      map.off('sourcedata', onSourceData);
    };
  });

  let lastFitRegion = '';
  $effect(() => {
    const map = mapInstance;
    const region = appState.region;
    void appState.regionDefaultsLoaded;
    if (!map || !region || !appState.regionDefaults[region]) return;
    if (lastFitRegion === region) return;
    lastFitRegion = region;
    const d = appState.regionDefaults[region];
    if (map.isStyleLoaded()) {
      map.flyTo({ center: [d.centre[1], d.centre[0]], zoom: d.zoom, duration: 700 });
    } else {
      map.once('idle', () => map.flyTo({ center: [d.centre[1], d.centre[0]], zoom: d.zoom, duration: 700 }));
    }
  });

  function handleMoveEnd() {
    if (!mapInstance) return;
    const center = mapInstance.getCenter();
    const zoom = mapInstance.getZoom();
    appState.setPosition(center.lat, center.lng, zoom);
    if (!appState.freezeLines && ALL_LINE_KINDS.some((kind) => appState.isLayerActive(kind))) {
      mapInstance.once('idle', () => {
        if (!mapInstance) return;
        for (const kind of ALL_LINE_KINDS) {
          if (appState.isLayerActive(kind)) refreshViewportLines(mapInstance, kind);
        }
      });
    }
  }

  function closePinnedPopup() {
    popupPinned = false;
    hoverInfo = null;
    mapCursor = 'grab';
  }

  function handleRegionHover(e: maplibregl.MapLayerMouseEvent) {
    if (!mapInstance || !e.features?.length) return;
    const slug = e.features[0].properties?.region_name as string;
    if (!slug || slug === appState.region) return;
    mapInstance.getCanvas().style.cursor = 'pointer';
    mapInstance.setPaintProperty('regions-fill', 'fill-opacity', 0.01);
    const feature = e.features[0];
    mapInstance.setFeatureState({ source: 'regions-source', sourceLayer: 'regions', id: feature.id as number }, { hover: true });
    if (!popupPinned) {
      hoverInfo = {
        layerId: 'regions-fill',
        properties: feature.properties,
        lngLat: { lng: e.lngLat.lng, lat: e.lngLat.lat }
      };
    }
  }

  function handleRegionLeave() {
    if (!mapInstance) return;
    mapInstance.getCanvas().style.cursor = '';
    mapInstance.removeFeatureState({ source: 'regions-source', sourceLayer: 'regions' }, 'hover');
    if (!popupPinned && hoverInfo?.layerId === 'regions-fill') hoverInfo = null;
  }

  function handleRegionClick(e: maplibregl.MapLayerMouseEvent) {
    const slug = e.features?.[0]?.properties?.region_name as string;
    if (!slug || slug === appState.region) return;
    appState.setRegion(slug);
  }

  // Ordered from highest hit priority (lines/points on top) to lowest (zone polygons).
  // Base tile layers (desire-lines, routes-fast-lines, routes-quiet-lines) are intentionally
  // excluded so only visible top-N viewport lines or frozen lines trigger popups.
  const CLICKABLE_LAYER_IDS = [
    'pct-frozen-lines',
    ...INTERACTIVE_VIEWPORT_LAYER_IDS,
    'school-destinations',
    'rnet-lines',
    'zones-fill'
  ];

  $effect(() => {
    const map = mapInstance;
    if (!map) return;

    const getVisibleInteractiveLayers = () =>
      CLICKABLE_LAYER_IDS.filter(
        (id) => map.getLayer(id) && map.getLayoutProperty(id, 'visibility') !== 'none'
      );

    const onMapMouseMove = (event: maplibregl.MapMouseEvent) => {
      if (popupPinned) return;
      const layers = getVisibleInteractiveLayers();
      const features = layers.length ? map.queryRenderedFeatures(event.point, { layers }) : [];
      // Pick the highest-priority feature according to CLICKABLE_LAYER_IDS order
      let topFeature: maplibregl.MapGeoJSONFeature | undefined;
      for (const layerId of layers) {
        topFeature = features.find((f) => f.layer.id === layerId);
        if (topFeature) break;
      }
      if (topFeature) {
        mapCursor = 'pointer';
        hoverInfo = {
          layerId: topFeature.layer.id,
          properties: topFeature.properties,
          lngLat: { lng: event.lngLat.lng, lat: event.lngLat.lat }
        };
      } else if (hoverInfo && hoverInfo.layerId !== 'regions-fill') {
        mapCursor = 'grab';
        hoverInfo = null;
      }
    };

    const onMapClick = (event: maplibregl.MapMouseEvent) => {
      const layers = getVisibleInteractiveLayers();
      const features = layers.length ? map.queryRenderedFeatures(event.point, { layers }) : [];
      let topFeature: maplibregl.MapGeoJSONFeature | undefined;
      for (const layerId of layers) {
        topFeature = features.find((f) => f.layer.id === layerId);
        if (topFeature) break;
      }
      if (!topFeature) {
        popupPinned = false;
        hoverInfo = null;
        return;
      }
      popupPinned = true;
      mapCursor = 'pointer';
      hoverInfo = {
        layerId: topFeature.layer.id,
        properties: topFeature.properties,
        lngLat: { lng: event.lngLat.lng, lat: event.lngLat.lat }
      };
    };

    map.on('mousemove', onMapMouseMove);
    map.on('click', onMapClick);
    return () => {
      map.off('mousemove', onMapMouseMove);
      map.off('click', onMapClick);
    };
  });

  onMount(() => {
    // Global error safeguard
    const errorHandler = (e: ErrorEvent) => {
      if (e.message?.includes('pmtiles') || e.message?.includes('404')) {
        e.preventDefault();
      }
    };
    window.addEventListener('error', errorHandler);
    return () => window.removeEventListener('error', errorHandler);
  });

  $effect(() => {
    if (typeof window !== 'undefined') {
      (window as Window & { __pct_map?: maplibregl.Map }).__pct_map = mapInstance;
    }
  });
</script>

<div class="relative h-full w-full bg-slate-200">
  <MapLibre
    bind:map={mapInstance}
    style={basemapStyle}
    center={[appState.lng, appState.lat]}
    zoom={appState.zoom}
    cursor={mapCursor}
    class="h-full w-full"
    onmoveend={handleMoveEnd}
    onerror={(e) => {
      console.warn('[MapLibre Error]', e);
    }}
  >
    <NavigationControl position="top-right" />
    <ScaleControl position="bottom-right" unit="metric" />

    <!-- 0. NEIGHBOURING REGION BOUNDARIES (clickable, mirrors pct-shiny) -->
    {#key appState.region}
      <VectorTileSource
        id="regions-source"
        url={getPMTilesUrl('/data/regions/regions.pmtiles')}
      >
        <FillLayer
          id="regions-fill"
          sourceLayer="regions"
          paint={{
            'fill-color': [
              'case',
              ['boolean', ['feature-state', 'hover'], false],
              '#c8d8e8',
              '#f0f8ff'
            ],
            'fill-opacity': [
              'case',
              ['boolean', ['feature-state', 'hover'], false],
              0.6,
              0.01
            ],
            'fill-outline-color': '#000000'
          }}
          onmousemove={(e) => handleRegionHover(e)}
          onmouseleave={() => handleRegionLeave()}
          onclick={(e) => handleRegionClick(e)}
        />
        <LineLayer
          id="regions-outline"
          sourceLayer="regions"
          paint={{
            'line-color': '#000000',
            'line-opacity': 0.3,
            'line-width': 1
          }}
        />
      </VectorTileSource>
    {/key}

    <!-- 1. ZONES LAYER (choropleth) -->
    {#if appState.isLayerActive('zones')}
      {#key `${appState.region}/${datasetKey}`}
        <VectorTileSource
          id="zones-source"
          url={getPMTilesUrl(regionZonesUrl)}
        >
          <FillLayer
            id="zones-fill"
            sourceLayer="zones"
            paint={{
              'fill-color': zoneFillColor as any,
              'fill-opacity': 0.72,
              'fill-outline-color': 'rgba(15, 23, 42, 0.25)'
            }}
          />
          <LineLayer
            id="zones-border"
            sourceLayer="zones"
            paint={{
              'line-color': 'rgba(15, 23, 42, 0.4)',
              'line-width': 0.8,
              'line-opacity': 0.8
            }}
          />
        </VectorTileSource>
      {/key}
    {/if}

    <!-- 2. ROUTE NETWORK (RNET) -->
    {#if hasRnet && appState.isLayerActive('rnet')}
      {#key regionKey}
        <VectorTileSource
          id="rnet-source"
          url={getPMTilesUrl(regionFile(rnetFile))}
        >
          <LineLayer
            id="rnet-casing"
            sourceLayer="rnet"
            paint={{
              'line-color': '#ffffff',
              'line-width': ['+', rnetLineWidth as any, 2],
              'line-opacity': 0.6
            }}
          />
          <LineLayer
            id="rnet-lines"
            sourceLayer="rnet"
            paint={{
              'line-color': rnetLineColor as any,
              'line-width': rnetLineWidth as any,
              'line-opacity': 0.9,
            }}
          />
        </VectorTileSource>
      {/key}
    {/if}

    <!-- 2b. SCHOOL DESTINATIONS (points) -->
    {#if appState.purpose === 'school' && appState.isLayerActive('destinations')}
      {#key regionKey}
        <VectorTileSource
          id="school-dest-source"
          url={getPMTilesUrl(regionFile('school_destinations'))}
        >
          <CircleLayer
            id="school-destinations"
            sourceLayer="destinations"
            paint={{
              'circle-color': '#006400',
              'circle-radius': 4,
              'circle-stroke-color': '#ffffff',
              'circle-stroke-width': 1.5,
              'circle-opacity': 0.9
            }}
          />
        </VectorTileSource>
      {/key}
    {/if}

    <!-- 3. FAST ROUTES (base tiles kept at opacity 0 for querySourceFeatures; top-N rendered via GeoJSON overlay) -->
    {#if hasRoutes && appState.isLayerActive('fast')}
      {#key regionKey}
        <VectorTileSource
          id="routes-fast-source"
          url={getPMTilesUrl(regionFile('routes_fast'))}
        >
          <LineLayer
            id="routes-fast-lines"
            sourceLayer="routes_fast"
            filter={['==', ['get', 'geo_code1'], '__none__'] as any}
            paint={{
              'line-opacity': 0
            }}
          />
        </VectorTileSource>
      {/key}
    {/if}

    <!-- 4. QUIETER ROUTES (base tiles kept at opacity 0 for querySourceFeatures; top-N rendered via GeoJSON overlay) -->
    {#if hasRoutes && appState.isLayerActive('quiet')}
      {#key regionKey}
        <VectorTileSource
          id="routes-quiet-source"
          url={getPMTilesUrl(regionFile('routes_quiet'))}
        >
          <LineLayer
            id="routes-quiet-lines"
            sourceLayer="routes_quiet"
            filter={['==', ['get', 'geo_code1'], '__none__'] as any}
            paint={{
              'line-opacity': 0
            }}
          />
        </VectorTileSource>
      {/key}
    {/if}

    <!-- 5. DESIRE LINES (base tiles kept at opacity 0 for querySourceFeatures; top-N rendered via GeoJSON overlay) -->
    {#if hasDesire && appState.isLayerActive('desire')}
      {#key regionKey}
        <VectorTileSource
          id="desire-source"
          url={getPMTilesUrl(regionFile('desire_lines'))}
        >
          <LineLayer
            id="desire-lines"
            sourceLayer="desire_lines"
            filter={['==', ['get', 'geo_code1'], '__none__'] as any}
            paint={{
              'line-opacity': 0
            }}
          />
        </VectorTileSource>
      {/key}
    {/if}

    <!-- Hover Feature Popup / Tooltip -->
    {#if hoverInfo}
      <Popup
        lnglat={hoverInfo.lngLat}
        closeButton={false}
        closeOnClick={false}
        anchor={popupAnchor as any}
        maxWidth="320px"
        offset={12}
      >
        <HoverPopup {hoverInfo} onClose={closePinnedPopup} />
      </Popup>
    {/if}
  </MapLibre>

  <!-- Bottom-left legend: anchor to the visible map edge, not below the fixed sidebar. -->
  <div
    class="pointer-events-none absolute bottom-6 z-20 transition-[left] duration-300 ease-in-out"
    style:left={appState.sidebarOpen ? 'calc(min(21rem, 90vw) + 1.5rem)' : '1.5rem'}
  >
    <Legend />
  </div>
</div>
