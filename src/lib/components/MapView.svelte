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
    baseIds: [string, string];
    viewportSourceId: string;
    viewportIds: [string, string];
    opacity: number; // pct-shiny: 0.8 straight lines, 0.5 routes
    color: maplibregl.ExpressionSpecification | string;
  }

  const LINE_KINDS: Record<LineKind, LineKindConfig> = {
    desire: {
      sourceId: 'desire-source',
      sourceLayer: 'desire_lines',
      baseIds: ['desire-casing', 'desire-lines'],
      viewportSourceId: 'pct-vp-desire-source',
      viewportIds: ['pct-vp-desire-casing', 'pct-vp-desire-lines'],
      opacity: 0.85,
      color: '#800000'
    },
    fast: {
      sourceId: 'routes-fast-source',
      sourceLayer: 'routes_fast',
      baseIds: ['routes-fast-casing', 'routes-fast-lines'],
      viewportSourceId: 'pct-vp-fast-source',
      viewportIds: ['pct-vp-fast-casing', 'pct-vp-fast-lines'],
      opacity: 0.5,
      color: '#800080'
    },
    quiet: {
      sourceId: 'routes-quiet-source',
      sourceLayer: 'routes_quiet',
      baseIds: ['routes-quiet-casing', 'routes-quiet-lines'],
      viewportSourceId: 'pct-vp-quiet-source',
      viewportIds: ['pct-vp-quiet-casing', 'pct-vp-quiet-lines'],
      opacity: 0.5,
      color: '#006400'
    }
  };

  const ALL_LINE_KINDS: LineKind[] = ['desire', 'fast', 'quiet'];
  const LIVE_LINE_LAYER_IDS = [
    'desire-casing', 'desire-lines',
    'routes-fast-casing', 'routes-fast-lines',
    'routes-quiet-casing', 'routes-quiet-lines'
  ];
  const ALL_VIEWPORT_LAYER_IDS = ALL_LINE_KINDS.flatMap((kind) => LINE_KINDS[kind].viewportIds);
  const FROZEN_SOURCE_ID = 'pct-frozen-lines-source';
  const FROZEN_LAYER_IDS = ['pct-frozen-lines-casing', 'pct-frozen-lines'];
  const flowLineWidth = $derived(getFlowLineWidthExpression(appState.scenario, appState.purpose));
  const viewportKeys: Record<LineKind, string> = { desire: '', fast: '', quiet: '' };

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
  const hasLineData = $derived(hasRoutes);

  function clearViewportLines(map: maplibregl.Map, kind: LineKind, restoreBase = true) {
    const cfg = LINE_KINDS[kind];
    for (const id of cfg.viewportIds) {
      if (map.getLayer(id)) map.removeLayer(id);
    }
    if (map.getSource(cfg.viewportSourceId)) map.removeSource(cfg.viewportSourceId);
    if (restoreBase) {
      for (const id of cfg.baseIds) {
        if (!map.getLayer(id)) continue;
        map.setLayoutProperty(id, 'visibility', 'visible');
        map.setPaintProperty(id, 'line-opacity', id === cfg.baseIds[0] ? 0.5 : cfg.opacity);
      }
    }
    viewportKeys[kind] = '';
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

  /** Rank loaded candidates inside the current viewport by scenario cyclists and
   *  keep the top N, matching pct-shiny's sort_lines() behaviour. */
  function refreshViewportLines(map: maplibregl.Map, kind: LineKind, force = false) {
    const cfg = LINE_KINDS[kind];
    if (!map.getLayer(cfg.baseIds[1]) || appState.freezeLines) return;
    const bounds = map.getBounds();
    const key = [bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth(), appState.scenario, appState.n]
      .map((value) => typeof value === 'number' ? value.toFixed(4) : value).join('|');
    if (!force && key === viewportKeys[kind]) return;

    const countProperty = getScenarioCyclistsProperty(appState.scenario, appState.purpose);
    const seen = new Set<string>();
    const candidates = map.querySourceFeatures(cfg.sourceId, { sourceLayer: cfg.sourceLayer })
      .filter((feature) => geometryIntersectsBounds(feature.geometry, bounds))
      .filter((feature) => {
        const id = `${feature.properties.geo_code1}|${feature.properties.geo_code2}`;
        if (seen.has(id)) return false;
        seen.add(id);
        return Number(feature.properties[countProperty] ?? feature.properties.bicycle ?? 0) > 0;
      })
      .sort((a, b) => Number(b.properties[countProperty] ?? b.properties.bicycle ?? 0) - Number(a.properties[countProperty] ?? a.properties.bicycle ?? 0))
      .slice(0, appState.n)
      .map((feature) => ({ type: 'Feature', properties: { ...feature.properties }, geometry: feature.geometry }));

    clearViewportLines(map, kind, false);
    viewportKeys[kind] = key;
    for (const id of cfg.baseIds) map.setPaintProperty(id, 'line-opacity', 0);
    if (!candidates.length) return;
    map.addSource(cfg.viewportSourceId, {
      type: 'geojson', data: { type: 'FeatureCollection', features: candidates } as any
    });
    map.addLayer({
      id: cfg.viewportIds[0], type: 'line', source: cfg.viewportSourceId,
      paint: { 'line-color': '#ffffff', 'line-width': ['+', flowLineWidth as any, 1.5], 'line-opacity': 0.5 } as any
    });
    map.addLayer({
      id: cfg.viewportIds[1], type: 'line', source: cfg.viewportSourceId,
      paint: { 'line-color': cfg.color as any, 'line-width': flowLineWidth as any, 'line-opacity': cfg.opacity } as any
    });
    for (const id of cfg.baseIds) map.setPaintProperty(id, 'line-opacity', 0);
  }

  function restoreLiveLineLayers(map: maplibregl.Map) {
    for (const kind of ALL_LINE_KINDS) {
      const cfg = LINE_KINDS[kind];
      const overlaid = Boolean(map.getSource(cfg.viewportSourceId));
      for (const id of cfg.baseIds) {
        if (!map.getLayer(id)) continue;
        if (overlaid) {
          map.setPaintProperty(id, 'line-opacity', 0);
        } else {
          map.setLayoutProperty(id, 'visibility', 'visible');
          map.setPaintProperty(id, 'line-opacity', id === cfg.baseIds[0] ? 0.5 : cfg.opacity);
        }
      }
      for (const id of cfg.viewportIds) {
        if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', 'visible');
      }
    }
  }

  function clearFrozenLines(map: maplibregl.Map) {
    for (const id of FROZEN_LAYER_IDS) {
      if (map.getLayer(id)) map.removeLayer(id);
    }
    if (map.getSource(FROZEN_SOURCE_ID)) map.removeSource(FROZEN_SOURCE_ID);
    restoreLiveLineLayers(map);
  }

  function freezeVisibleLines(map: maplibregl.Map) {
    clearFrozenLines(map);
    const activeIds = [...LIVE_LINE_LAYER_IDS, ...ALL_VIEWPORT_LAYER_IDS].filter((id) => map.getLayer(id));
    const seen = new Set<string>();
    const features = map.queryRenderedFeatures({ layers: activeIds }).flatMap((feature) => {
      const style = feature.layer.id.includes('desire')
        ? 'desire'
        : feature.layer.id.includes('fast') ? 'fast' : 'quiet';
      const properties = { ...feature.properties, __pct_style: style } as Record<string, unknown>;
      const frozenFeature = {
        type: 'Feature' as const,
        properties,
        geometry: feature.geometry
      };
      const key = JSON.stringify([style, frozenFeature.geometry, properties.geo_code1, properties.geo_code2]);
      if (seen.has(key)) return [];
      seen.add(key);
      return [frozenFeature];
    });

    appState.frozenLineCount = features.length;
    if (!features.length) return;

    map.addSource(FROZEN_SOURCE_ID, {
      type: 'geojson',
      data: { type: 'FeatureCollection', features } as any
    });
    map.addLayer({
      id: 'pct-frozen-lines-casing', type: 'line', source: FROZEN_SOURCE_ID,
      paint: {
        'line-color': '#ffffff', 'line-opacity': 0.6,
        'line-width': ['+', flowLineWidth as any, 1.5]
      } as any
    });
    map.addLayer({
      id: 'pct-frozen-lines', type: 'line', source: FROZEN_SOURCE_ID,
      paint: {
        'line-color': ['match', ['get', '__pct_style'],
          'desire', desireLineColor as any,
          'fast', '#800080', 'quiet', '#006400', '#64748b'],
        'line-width': flowLineWidth as any,
        'line-opacity': ['match', ['get', '__pct_style'],
          'desire', 0.85, 'fast', 0.5, 'quiet', 0.5, 0.85]
      } as any
    });
    for (const id of activeIds) map.setLayoutProperty(id, 'visibility', 'none');
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
      if (frozen && activeKinds.length) {
        freezeVisibleLines(map);
      } else {
        clearFrozenLines(map);
        for (const kind of ALL_LINE_KINDS) {
          if (activeKinds.includes(kind)) refreshViewportLines(map, kind, true);
          else clearViewportLines(map, kind);
        }
      }
    };
    if (map.isStyleLoaded()) apply();
    else map.once('idle', apply);
    void revision;
  });

  $effect(() => {
    const map = mapInstance;
    if (!map) return;
    const onIdle = () => {
      if (appState.freezeLines) return;
      for (const kind of ALL_LINE_KINDS) {
        if (appState.isLayerActive(kind)) refreshViewportLines(map, kind);
      }
    };
    map.on('idle', onIdle);
    return () => map.off('idle', onIdle);
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

  function handleFeatureHover(e: maplibregl.MapLayerMouseEvent, layerId: string) {
    if (popupPinned) return;
    if (e.features && e.features.length > 0) {
      mapCursor = 'pointer';
      hoverInfo = {
        layerId,
        properties: e.features[0].properties,
        lngLat: { lng: e.lngLat.lng, lat: e.lngLat.lat }
      };
    }
  }

  function handleRnetHover(e: maplibregl.MapLayerMouseEvent) {
    handleFeatureHover(e, 'rnet-lines');
  }

  function handleFeatureLeave() {
    mapCursor = 'grab';
    if (!popupPinned) hoverInfo = null;
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
    hoverInfo = {
      layerId: 'regions-fill',
      properties: feature.properties,
      lngLat: { lng: e.lngLat.lng, lat: e.lngLat.lat }
    };
  }

  function handleRegionLeave() {
    if (!mapInstance) return;
    mapInstance.getCanvas().style.cursor = '';
    mapInstance.removeFeatureState({ source: 'regions-source', sourceLayer: 'regions' }, 'hover');
    if (!popupPinned) hoverInfo = null;
  }

  function handleRegionClick(e: maplibregl.MapLayerMouseEvent) {
    const slug = e.features?.[0]?.properties?.region_name as string;
    if (!slug || slug === appState.region) return;
    appState.setRegion(slug);
  }

  const CLICKABLE_LAYER_IDS = [
    'pct-frozen-lines', ...ALL_VIEWPORT_LAYER_IDS,
    'desire-lines', 'routes-fast-lines', 'routes-quiet-lines', 'rnet-lines',
    'school-destinations', 'zones-fill'
  ];

  $effect(() => {
    const map = mapInstance;
    if (!map) return;
    const onMapClick = (event: maplibregl.MapMouseEvent) => {
      const layers = CLICKABLE_LAYER_IDS.filter((id) => map.getLayer(id));
      const feature = map.queryRenderedFeatures(event.point, { layers })[0];
      if (!feature) {
        popupPinned = false;
        hoverInfo = null;
        return;
      }
      popupPinned = true;
      mapCursor = 'pointer';
      hoverInfo = {
        layerId: feature.layer.id,
        properties: feature.properties,
        lngLat: { lng: event.lngLat.lng, lat: event.lngLat.lat }
      };
    };
    map.on('click', onMapClick);
    return () => map.off('click', onMapClick);
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
            onmousemove={(e) => handleFeatureHover(e, 'zones-fill')}
            onmouseleave={handleFeatureLeave}
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
            onmousemove={handleRnetHover}
            onmouseleave={handleFeatureLeave}
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
            onmousemove={(e) => handleFeatureHover(e, 'school-destinations')}
            onmouseleave={handleFeatureLeave}
          />
        </VectorTileSource>
      {/key}
    {/if}

    <!-- 3. FAST ROUTES -->
    {#if hasRoutes && appState.isLayerActive('fast')}
      {#key regionKey}
        <VectorTileSource
          id="routes-fast-source"
          url={getPMTilesUrl(regionFile('routes_fast'))}
        >
          <LineLayer
            id="routes-fast-casing"
            sourceLayer="routes_fast"
            paint={{
              'line-color': '#ffffff',
              'line-width': ['+', flowLineWidth as any, 1.5],
              'line-opacity': 0.5
            }}
          />
          <LineLayer
            id="routes-fast-lines"
            sourceLayer="routes_fast"
            paint={{
              'line-color': '#800080',
              'line-width': flowLineWidth as any,
              'line-opacity': 0.5,
            }}
            onmousemove={(e) => handleFeatureHover(e, 'routes-fast-lines')}
            onmouseleave={handleFeatureLeave}
          />
        </VectorTileSource>
      {/key}
    {/if}

    <!-- 4. QUIETER ROUTES -->
    {#if hasRoutes && appState.isLayerActive('quiet')}
      {#key regionKey}
        <VectorTileSource
          id="routes-quiet-source"
          url={getPMTilesUrl(regionFile('routes_quiet'))}
        >
          <LineLayer
            id="routes-quiet-casing"
            sourceLayer="routes_quiet"
            paint={{
              'line-color': '#ffffff',
              'line-width': ['+', flowLineWidth as any, 1.5],
              'line-opacity': 0.5
            }}
          />
          <LineLayer
            id="routes-quiet-lines"
            sourceLayer="routes_quiet"
            paint={{
              'line-color': '#006400',
              'line-width': flowLineWidth as any,
              'line-opacity': 0.5,
              'line-dasharray': [2, 1],
            }}
            onmousemove={(e) => handleFeatureHover(e, 'routes-quiet-lines')}
            onmouseleave={handleFeatureLeave}
          />
        </VectorTileSource>
      {/key}
    {/if}

    <!-- 5. DESIRE LINES -->
    {#if hasDesire && appState.isLayerActive('desire')}
      {#key regionKey}
        <VectorTileSource
          id="desire-source"
          url={getPMTilesUrl(regionFile('desire_lines'))}
        >
          <LineLayer
            id="desire-casing"
            sourceLayer="desire_lines"
            filter={desireFilter as any}
            paint={{
              'line-color': '#ffffff',
              'line-width': ['+', desireLineWidth as any, 1.5],
              'line-opacity': 0.5
            }}
          />
          <LineLayer
            id="desire-lines"
            sourceLayer="desire_lines"
            filter={desireFilter as any}
            paint={{
              'line-color': desireLineColor as any,
              'line-width': desireLineWidth as any,
              'line-opacity': 0.85,
            }}
            onmousemove={(e) => handleFeatureHover(e, 'desire-lines')}
            onmouseleave={handleFeatureLeave}
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
