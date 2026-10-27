<script lang="ts">
  import { onMount } from 'svelte';
  import * as maplibregl from 'maplibre-gl';
  import 'maplibre-gl/dist/maplibre-gl.css';
  import { appState, scenariosForPurpose } from '../state.svelte';
  import type { Scenario } from '../types';
  import { initPMTilesProtocol, getPMTilesUrl } from '../pmtiles';
  import { ZONE_COLORS, ZONE_BREAKS, getBasemapStyle } from '../mapStyles';
  import ZoneLegendRamp from './ZoneLegendRamp.svelte';

  initPMTilesProtocol();

  const getLandingStyle = () => getBasemapStyle('positron');


  // Scenario options mirror the legacy landing controls; descriptions come
  // from the shared SCENARIOS metadata in state.svelte.ts (idea #2).
  const commuteScenarios = [
    { id: 'base', label: '2011 Census' },
    { id: 'govtarget', label: 'Government Target (equality)' },
    { id: 'govnearmkt', label: 'Government Target (near market)' },
    { id: 'gendereq', label: 'Gender Equality' },
    { id: 'dutch', label: 'Go Dutch' },
    { id: 'ebike', label: 'Ebike' }
  ];
  const schoolScenarios = [
    { id: 'base', label: '2011 Census' },
    { id: 'govtarget', label: 'Government Target (equality)' },
    { id: 'cambridge', label: 'Go Cambridge' },
    { id: 'dutch', label: 'Go Dutch' }
  ];
  const scenarios = $derived(appState.landingPurpose === 'school' ? schoolScenarios : commuteScenarios);
  const selectedLandingScenario = $derived(
    scenariosForPurpose(appState.landingPurpose).find((s) => s.id === appState.landingScenario) ?? null
  );

  // Per-region choropleth property for the selected purpose/scenario.
  const scenarioProperty = $derived.by(() => {
    const prefix = appState.landingPurpose === 'school' ? 'school_' : '';
    if (appState.landingScenario === 'base') return `${prefix}bicycle_perc`;
    const key = `${appState.landingScenario}_slc_perc`;
    return `${prefix}${key}`;
  });

  const fillColor = $derived([
    'step',
    ['coalesce', ['get', scenarioProperty], 0],
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
  ]);

  let map: maplibregl.Map | undefined = $state();
  let mapLoaded = $state(false);
  let hoveredProps = $state<Record<string, unknown> | null>(null);

  const hoverInfo = $derived.by(() => {
    if (!hoveredProps) return null;
    const name = (hoveredProps.region_pretty as string) || prettify((hoveredProps.region_name as string) ?? '');
    const value = Number(hoveredProps[scenarioProperty] ?? 0);
    return { name, value };
  });

  function openRegion(slug: string) {
    // Carry the chosen landing purpose/scenario into the dashboard view.
    appState.openRegionFromLanding(slug);
  }

  // Region quick-search (idea #3): filter the full region list from
  // region_defaults.json as the user types; Enter opens the top match.
  interface RegionMeta { slug: string; pretty: string }
  let regionSearch = $state('');
  let allRegions = $state<RegionMeta[]>([]);
  const matchingRegions = $derived.by<RegionMeta[]>(() => {
    const q = regionSearch.trim().toLowerCase();
    if (!q) return [];
    return allRegions.filter((r) => r.pretty.toLowerCase().includes(q)).slice(0, 7);
  });

  onMount(() => {
    fetch('/data/regions/region_defaults.json')
      .then((r) => (r.ok ? r.json() : []))
      .then((raw: Array<{ slug: string; pretty: string }>) => {
        allRegions = raw.map((r) => ({ slug: r.slug, pretty: r.pretty })).sort((a, b) => a.pretty.localeCompare(b.pretty));
      })
      .catch(() => {});
  });

  onMount(() => {
    const mapInstance = new maplibregl.Map({
      container: 'landing-map',
      style: getLandingStyle(),
      center: [-2.2, 53.2],
      zoom: 5.6,
      attributionControl: false
    });
    mapInstance.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right');
    mapInstance.on('load', () => {
      mapInstance.addSource('regions-source', {
        type: 'vector',
        url: getPMTilesUrl('/data/regions/regions.pmtiles')
      });
      mapInstance.addLayer({
        id: 'regions-fill',
        type: 'fill',
        source: 'regions-source',
        'source-layer': 'regions',
        paint: { 'fill-color': fillColor as any, 'fill-opacity': 0.85, 'fill-outline-color': '#666666' } as any
      });
      mapInstance.addLayer({
        id: 'regions-outline',
        type: 'line',
        source: 'regions-source',
        'source-layer': 'regions',
        paint: { 'line-color': '#444444', 'line-width': 1 }
      });
      mapInstance.on('mousemove', 'regions-fill', (e) => {
        if (!e.features?.length) return;
        mapInstance.getCanvas().style.cursor = 'pointer';
        hoveredProps = e.features[0].properties as Record<string, unknown>;
      });
      mapInstance.on('mouseleave', 'regions-fill', () => {
        mapInstance.getCanvas().style.cursor = '';
        hoveredProps = null;
      });
      mapInstance.on('click', 'regions-fill', (e) => {
        const slug = (e.features?.[0]?.properties?.region_name as string) ?? '';
        if (slug) openRegion(slug);
      });
      map = mapInstance;
      mapLoaded = true;
      if (typeof window !== 'undefined') {
        (window as Window & { __pct_landing_map?: maplibregl.Map }).__pct_landing_map = mapInstance;
      }
    });
    return () => {
      mapLoaded = false;
      if (typeof window !== 'undefined') {
        delete (window as Window & { __pct_landing_map?: maplibregl.Map }).__pct_landing_map;
      }
      mapInstance.remove();
      map = undefined;
    };
  });

  // Recolour when the scenario or purpose changes.
  $effect(() => {
    const color = fillColor;
    if (!mapLoaded || !map || !map.getLayer('regions-fill')) return;
    map.setPaintProperty('regions-fill', 'fill-color', color as any);
  });

  function prettify(slug: string): string {
    return slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()).replace(/\bAnd\b|\bOf\b/g, (m) => m.toLowerCase());
  }

  // Intro video (same as pct.bike landing) — lazy-loaded: only inject the
  // iframe once the user clicks the poster, keeping first paint fast.
  const VIDEO_ID = '58UaVb8ZCrc';
  let videoPlaying = $state(false);
</script>

<div class="landing-page flex h-[100dvh] w-screen flex-col overflow-hidden bg-white font-sans text-slate-800 antialiased">
  <!-- Top navbar (mirrors legacy landing) -->
  <nav class="landing-nav flex shrink-0 flex-wrap items-center gap-x-6 gap-y-2 border-b border-slate-200 bg-white px-4 py-3 shadow-sm sm:px-6">
    <a href="/" class="flex items-center">
      <img src="/pct-logo.png" alt="Propensity to Cycle Tool" class="h-9" />
    </a>
    <ul class="flex items-center gap-4 text-sm font-medium text-slate-700 sm:gap-5">
      <li><a href="https://blog.pct.bike/" target="_blank" rel="noreferrer" class="hover:text-sky-700">Blog</a></li>
      <li><a href="https://www.pct.bike/manual.html" target="_blank" rel="noreferrer" class="hover:text-sky-700">Manual + Reports</a></li>
      <li><a href="https://www.pct.bike/about.html" target="_blank" rel="noreferrer" class="hover:text-sky-700">About</a></li>
    </ul>
  </nav>

  <div class="landing-main flex min-h-0 flex-1 flex-col lg:flex-row">
    <!-- Left/top: region map (full width on mobile) -->
    <div class="landing-map-panel relative h-[45vh] w-full shrink-0 min-w-0 lg:h-auto lg:w-[52%]">
      <div id="landing-map" class="h-full w-full bg-slate-100"></div>
      <div class="pointer-events-none absolute left-3 top-3 z-10 max-w-xs rounded-lg border border-slate-200 bg-white/95 p-3 shadow-lg backdrop-blur">
        <div class="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Cycling to {appState.landingPurpose === 'school' ? 'school' : 'work'}</div>
        {#if hoverInfo}
          <div class="mt-1 text-sm text-slate-800"><strong>{hoverInfo.name}</strong>: {hoverInfo.value}%</div>
        {:else}
          <div class="mt-1 text-sm text-slate-400">Hover over a region</div>
        {/if}
        <div class="mt-2">
          <ZoneLegendRamp />
        </div>
      </div>
    </div>

    <!-- Right/bottom: welcome panel + controls -->
    <div class="landing-content w-full flex-1 overflow-y-auto border-t border-slate-200 bg-white p-5 sm:p-8 lg:w-[48%] lg:border-t-0 lg:border-l">
      <h1 class="landing-title text-xl font-bold text-slate-900 sm:text-2xl">
        Welcome to the Propensity to Cycle Tool (PCT)
      </h1>
      <p class="landing-intro mt-3 max-w-xl text-sm leading-relaxed text-slate-600">
        The PCT is an evidence-based planning tool that assists transport planners and authorities in
        prioritising cycling infrastructure investments. Hover over a region on the map to see its current
        cycling levels, then click it to open the full dashboard for that region.
      </p>

      <!-- Region quick-search (jump straight to a known region) -->
      <div class="landing-search relative mt-4 max-w-xl">
        <label for="region-search" class="sr-only">Find a region</label>
        <div class="flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2 shadow-xs focus-within:border-sky-500 focus-within:ring-1 focus-within:ring-sky-500">
          <svg class="h-4 w-4 shrink-0 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
          </svg>
          <input
            id="region-search"
            type="text"
            bind:value={regionSearch}
            onkeydown={(e) => {
              if (e.key === 'Enter' && matchingRegions.length > 0) {
                openRegion(matchingRegions[0].slug);
              }
            }}
            placeholder="Find a region (e.g. West Yorkshire)…"
            autocomplete="off"
            class="w-full bg-transparent text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none"
          />
        </div>
        {#if matchingRegions.length > 0}
          <ul class="absolute z-20 mt-1 w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg" role="listbox" aria-label="Matching regions">
            {#each matchingRegions as region (region.slug)}
              <li role="option" aria-selected="false">
                <button
                  type="button"
                  class="block w-full px-3 py-2 text-left text-sm text-slate-700 hover:bg-sky-50 hover:text-sky-800 focus:bg-sky-50 focus:outline-none"
                  onclick={() => openRegion(region.slug)}
                >
                  {region.pretty}
                </button>
              </li>
            {/each}
          </ul>
        {/if}
      </div>

      <!-- Intro video (same embed as the legacy landing, lazy-loaded) -->
      <div class="landing-video mt-5 max-w-xl">
        <div class="landing-video-frame relative w-full overflow-hidden rounded-xl border border-slate-200 shadow-sm" style="aspect-ratio: 16 / 9;">
          {#if videoPlaying}
            <iframe
              class="absolute inset-0 h-full w-full"
              src="https://www.youtube.com/embed/{VIDEO_ID}?autoplay=1"
              title="An introduction to the Propensity to Cycle Tool"
              frameborder="0"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowfullscreen
            ></iframe>
          {:else}
            <button
              type="button"
              class="group absolute inset-0 h-full w-full cursor-pointer"
              onclick={() => (videoPlaying = true)}
              aria-label="Play the introductory video: Propensity to Cycle Tool"
            >
              <img
                src="https://i.ytimg.com/vi/{VIDEO_ID}/hqdefault.jpg"
                alt="Introduction to the Propensity to Cycle Tool (video preview)"
                class="h-full w-full object-cover"
                loading="lazy"
              />
              <span class="absolute inset-0 flex items-center justify-center bg-slate-900/10 transition group-hover:bg-slate-900/25">
                <span class="flex h-14 w-20 items-center justify-center rounded-xl bg-red-600 shadow-lg transition group-hover:scale-105">
                  <svg viewBox="0 0 24 24" class="h-7 w-7 fill-white" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>
                </span>
              </span>
              <span class="absolute bottom-2 left-3 rounded bg-slate-900/70 px-2 py-0.5 text-[11px] font-medium text-white">
                Watch: an introduction to the PCT
              </span>
            </button>
          {/if}
        </div>
        <p class="mt-2 text-xs leading-relaxed text-slate-500">
          For an introduction to the tool, its use, and the scenarios, please watch the video above and read the
          <a class="text-sky-700 hover:underline" href="https://npct.github.io/pct-shiny/regions_www/www/static/03d_other_reports/2020-pct-essentials.pdf" target="_blank" rel="noreferrer">Essentials</a>.
        </p>
      </div>

      <div class="landing-scenarios mt-6 rounded-xl border border-slate-200 bg-slate-50 p-4">
        <div class="flex gap-6 text-sm">
          <label class="flex cursor-pointer items-center gap-2">
            <input type="radio" name="purpose" value="commute" checked={appState.landingPurpose === 'commute'} onchange={() => appState.setLandingPurpose('commute')} class="accent-sky-600" />
            Commute
          </label>
          <label class="flex cursor-pointer items-center gap-2">
            <input type="radio" name="purpose" value="school" checked={appState.landingPurpose === 'school'} onchange={() => appState.setLandingPurpose('school')} class="accent-sky-600" />
            School
          </label>
        </div>
        <div class="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm">
          {#each scenarios as scenario (scenario.id)}
            <label class="flex cursor-pointer items-center gap-2">
              <input type="radio" name="scenario" value={scenario.id} checked={appState.landingScenario === scenario.id} onchange={() => appState.setLandingScenario(scenario.id as Scenario)} class="accent-sky-600" />
              {scenario.label}
            </label>
          {/each}
        </div>
        {#if selectedLandingScenario}
          <p class="mt-3 border-t border-slate-200 pt-2 text-xs leading-relaxed text-slate-500">
            <span class="font-semibold text-slate-600">{selectedLandingScenario.name}:</span>
            {selectedLandingScenario.description}
          </p>
        {/if}
      </div>

      <details class="landing-resources mt-6 text-sm text-slate-700" open>
        <summary class="cursor-pointer font-semibold text-slate-800 marker:text-slate-500">Getting started</summary>
        <ul class="mt-2 list-disc space-y-1 pl-5 text-slate-600">
          <li><a class="text-sky-700 hover:underline" href="https://npct.github.io/pct-shiny/regions_www/www/static/03d_other_reports/2020-pct-essentials.pdf" target="_blank" rel="noreferrer">Read the PCT Essentials two-pager</a></li>
          <li><a class="text-sky-700 hover:underline" href="https://www.pct.bike/manual.html" target="_blank" rel="noreferrer">User Manuals and Training Materials</a></li>
          <li><a class="text-sky-700 hover:underline" href="https://blog.pct.bike/2021/09/02/getting-data/" target="_blank" rel="noreferrer">Workshop on using PCT data with QGIS</a></li>
          <li><a class="text-sky-700 hover:underline" href="https://npct.github.io/pct-shiny/regions_www/www/static/03d_other_reports/2020-pct-impact-report.pdf" target="_blank" rel="noreferrer">PCT Impact report (Nov 2020)</a></li>
          <li><a class="text-sky-700 hover:underline" href="https://www.landtransportgovernance.org/single-post/ltt-article-don-t-overlook-equity-when-deciding-where-to-place-cycling-schemes" target="_blank" rel="noreferrer">LTT article: Don't overlook equity when placing cycling schemes</a></li>
        </ul>
      </details>

      <!-- Institutional sponsors remain visible, as on the original PCT landing. -->
      <section class="landing-partners mt-6 border-t border-slate-200 pt-3" aria-labelledby="sponsors-heading">
        <h2 id="sponsors-heading" class="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Sponsored by</h2>
        <div class="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
          <a href="https://www.cam.ac.uk/" target="_blank" rel="noreferrer"><img src="/logos/camuni-logo.png" alt="University of Cambridge" class="sponsor-logo" /></a>
          <a href="https://www.cedar.iph.cam.ac.uk/" target="_blank" rel="noreferrer"><img src="/logos/cedar-logo.png" alt="CEDAR" class="sponsor-logo" /></a>
          <a href="https://www.leeds.ac.uk/" target="_blank" rel="noreferrer"><img src="/logos/leeds-logo.png" alt="University of Leeds" class="sponsor-logo" /></a>
          <a href="https://www.gov.uk/government/organisations/department-for-transport/" target="_blank" rel="noreferrer"><img src="/logos/Department_for_Transport.png" alt="Department for Transport" class="sponsor-logo" /></a>
          <a href="https://www.gov.wales/" target="_blank" rel="noreferrer"><img src="/logos/wales-logo-printed-materials.png" alt="Welsh Government" class="sponsor-logo" /></a>
          <a href="https://www.activetravelengland.gov.uk/" target="_blank" rel="noreferrer"><img src="/logos/active-travel-england.svg" alt="Active Travel England" class="sponsor-logo sponsor-logo-ate" /></a>
        </div>
      </section>
    </div>
  </div>
</div>

<style>
  .sponsor-logo { height: 2rem; max-width: 7.5rem; object-fit: contain; object-position: left center; }
  .sponsor-logo-ate { height: 2.4rem; max-width: 2.2rem; }

  /* Laptop-first compaction: common 1366x768 and 1440x900 screens retain
     an entirely usable landing view without sacrificing the map. */
  @media (min-width: 1024px) and (max-height: 850px) {
    .landing-nav { padding-top: 0.45rem; padding-bottom: 0.45rem; }
    .landing-nav img { height: 2rem; }
    .landing-content { padding: 0.8rem 1rem; }
    .landing-title { font-size: 1.15rem; line-height: 1.35; }
    .landing-intro { margin-top: 0.35rem; font-size: 0.75rem; line-height: 1.35; }
    .landing-search { margin-top: 0.55rem; }
    .landing-search > div { padding-top: 0.35rem; padding-bottom: 0.35rem; }
    .landing-video { margin-top: 0.55rem; max-width: 26rem; }
    .landing-video-frame { aspect-ratio: 16 / 6 !important; }
    .landing-video p { margin-top: 0.25rem; font-size: 0.65rem; line-height: 1.25; }
    .landing-scenarios { margin-top: 0.55rem; padding: 0.55rem 0.7rem; }
    .landing-scenarios > div { font-size: 0.75rem; }
    .landing-scenarios > div + div { margin-top: 0.4rem; gap: 0.4rem 1rem; }
    .landing-scenarios p { margin-top: 0.45rem; padding-top: 0.4rem; font-size: 0.65rem; line-height: 1.25; }
    .landing-resources { margin-top: 0.55rem; font-size: 0.75rem; }
    .landing-partners { margin-top: 0.55rem; font-size: 0.75rem; }
    .sponsor-logo { height: 1.8rem; max-width: 6.5rem; }
    .sponsor-logo-ate { height: 2.25rem; max-width: 2rem; }
  }
</style>


