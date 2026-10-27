<script lang="ts">
  import { appState, BASEMAPS, scenariosForPurpose } from '../state.svelte';
  import type { BasemapId, Geography, LayerId, Purpose, Scenario } from '../types';

  type FlowId = 'none' | 'desire' | 'fast' | 'fastquiet' | 'rnet' | 'destinations';

  const COMMUTE_FLOWS: { id: FlowId; label: string; layers: LayerId[] }[] = [
    { id: 'none', label: 'None', layers: [] },
    { id: 'desire', label: 'Straight Lines', layers: ['desire'] },
    { id: 'fast', label: 'Fast Routes', layers: ['fast'] },
    { id: 'fastquiet', label: 'Fast & Quieter Routes', layers: ['fast', 'quiet'] },
    { id: 'rnet', label: 'Route Network (LSOA)', layers: ['rnet'] }
  ];

  const SCHOOL_FLOWS: { id: FlowId; label: string; layers: LayerId[] }[] = [
    { id: 'none', label: 'None', layers: [] },
    { id: 'destinations', label: 'Destinations', layers: ['destinations'] },
    { id: 'rnet', label: 'Route Network (LSOA)', layers: ['rnet'] }
  ];

  const currentAsset = (name: string) => {
    if (name === 'rnet') return appState.purpose === 'school' ? 'school_rnet' : 'rnet_lsoa';
    return appState.purpose === 'commute' && appState.geography === 'lsoa' ? `${name}_lsoa` : name;
  };
  const hasRnet = $derived(appState.hasRegionData(currentAsset('rnet')));
  const flows = $derived(appState.purpose === 'school'
    ? SCHOOL_FLOWS.filter((flow) => flow.id === 'none' || (appState.hasRegionData('school_destinations') && flow.id === 'destinations') || hasRnet)
    : COMMUTE_FLOWS.filter((flow) => {
        if (flow.id === 'desire') return appState.hasRegionData(currentAsset('desire_lines'));
        if (flow.id === 'fast') return appState.hasRegionData(currentAsset('routes_fast'));
        if (flow.id === 'fastquiet') return appState.hasRegionData(currentAsset('routes_fast'));
        if (flow.id === 'rnet') return hasRnet;
        return true;
      }));
  const scenarios = $derived(scenariosForPurpose(appState.purpose));

  const flowId = $derived.by<FlowId>(() => {
    const active = appState.layers.filter((layer) => layer !== 'zones').sort().join(',');
    if (active === 'rnet') return 'rnet';
    return flows.find((flow) => flow.layers.slice().sort().join(',') === active)?.id ?? 'none';
  });

  const hasLsoa = $derived(appState.hasRegionData('zones_lsoa'));
  const geographyOptions = $derived<{ id: Geography; label: string }[]>(
    appState.purpose === 'school'
      ? [{ id: 'lsoa', label: 'Lower Super Output Area' }]
      : hasLsoa
        ? [
            { id: 'msoa', label: 'Middle Super Output Area' },
            { id: 'lsoa', label: 'Lower Super Output Area' }
          ]
        : [{ id: 'msoa', label: 'Middle Super Output Area' }]
  );
  const schoolAvailable = $derived(appState.hasRegionData('school_zones'));

  function setPurpose(event: Event) {
    appState.setPurpose((event.target as HTMLSelectElement).value as Purpose);
  }

  function setGeography(event: Event) {
    appState.setGeography((event.target as HTMLSelectElement).value as Geography);
  }

  function setScenario(event: Event) {
    appState.setScenario((event.target as HTMLSelectElement).value as Scenario);
  }

  function setFlow(event: Event) {
    const selected = (event.target as HTMLSelectElement).value as FlowId;
    const flow = flows.find((item) => item.id === selected)!;
    const zones = appState.isLayerActive('zones') ? ['zones'] as LayerId[] : [];
    appState.setFreezeLines(false);
    appState.setLayers([...zones, ...flow.layers]);
  }

  function setZones(event: Event) {
    const checked = (event.target as HTMLInputElement).checked;
    const withoutZones = appState.layers.filter((layer) => layer !== 'zones');
    appState.setLayers(checked ? ['zones', ...withoutZones] : withoutZones);
  }

  function setBasemap(event: Event) {
    appState.setBasemap((event.target as HTMLSelectElement).value as BasemapId);
  }
</script>

<div class="space-y-3">
  <div class="space-y-1">
    <label for="purpose" class="block text-xs font-semibold text-slate-700">Trip purpose</label>
    <select id="purpose" value={appState.purpose} onchange={setPurpose} disabled={!schoolAvailable} class="w-full cursor-pointer rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-800 shadow-xs focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500 disabled:cursor-not-allowed disabled:opacity-60">
      <option value="commute">Commuting</option>
      <option value="school">School travel</option>
    </select>
  </div>

  <div class="space-y-1">
    <label for="scenario" class="block text-xs font-semibold text-slate-700">Scenario</label>
    <select id="scenario" value={appState.scenario} onchange={setScenario} class="w-full cursor-pointer rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-800 shadow-xs focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500">
      {#each scenarios as scenario (scenario.id)}
        <option value={scenario.id}>{scenario.name}</option>
      {/each}
    </select>
  </div>

  <div class="space-y-1">
    <label for="flows" class="block text-xs font-semibold text-slate-700">Cycling Flows</label>
    <select id="flows" value={flowId} onchange={setFlow} class="w-full cursor-pointer rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-800 shadow-xs focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500">
      {#each flows as flow (flow.id)}
        <option value={flow.id}>{flow.label}</option>
      {/each}
    </select>
  </div>

  {#if flowId === 'desire' || flowId === 'fast' || flowId === 'fastquiet'}
    <div class="flex items-center gap-2">
      <label for="top-n" class="shrink-0 text-xs font-semibold text-slate-700">Top N lines</label>
      <input id="top-n" type="range" min="10" max="100" step="5" value={appState.n} oninput={(event) => appState.setN(Number((event.target as HTMLInputElement).value))} class="h-1.5 min-w-0 flex-1 cursor-pointer appearance-none rounded bg-slate-200 accent-sky-600" />
      <output for="top-n" class="w-7 text-right font-mono text-xs text-slate-600">{appState.n}</output>
    </div>
  {/if}

  {#if flowId === 'desire' || flowId === 'fast' || flowId === 'fastquiet'}
    <div class="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-2">
      <div class="flex items-center justify-between gap-2">
        <label class="flex cursor-pointer items-center gap-2 text-xs font-medium text-slate-700">
          <input
            type="checkbox"
            checked={appState.freezeLines}
            onchange={(event) => appState.setFreezeLines((event.target as HTMLInputElement).checked)}
            class="h-3.5 w-3.5 cursor-pointer rounded border-slate-300 accent-sky-600"
          />
          Freeze Lines
        </label>
        {#if appState.freezeLines}
          <button
            type="button"
            onclick={() => appState.refreshFrozenLines()}
            class="rounded border border-sky-200 bg-white px-1.5 py-0.5 text-[11px] font-semibold text-sky-700 hover:bg-sky-50"
            title="Capture lines from the current map view"
          >Update</button>
        {/if}
      </div>
      {#if appState.freezeLines}
        <p class="mt-1 text-[10px] leading-snug text-slate-500">
          Locked to this view: {appState.frozenLineCount} line{appState.frozenLineCount === 1 ? '' : 's'}.
        </p>
      {/if}
    </div>
  {/if}

  <label class="flex cursor-pointer items-center gap-2 text-sm font-medium text-slate-700">
    <input type="checkbox" checked={appState.isLayerActive('zones')} onchange={setZones} class="h-4 w-4 cursor-pointer rounded border-slate-300 accent-sky-600" />
    Show Zones
  </label>

  <div class="space-y-1">
    <label for="geography" class="block text-xs font-semibold text-slate-700">Geography</label>
    <select id="geography" value={appState.geography} onchange={setGeography} class="w-full cursor-pointer rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-800 shadow-xs focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500">
      {#each geographyOptions as option (option.id)}
        <option value={option.id}>{option.label}</option>
      {/each}
    </select>
  </div>

  <div class="space-y-1">
    <label for="basemap" class="block text-xs font-semibold text-slate-700">Map Base</label>
    <select id="basemap" value={appState.basemap} onchange={setBasemap} class="w-full cursor-pointer rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-800 shadow-xs focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500">
      {#each BASEMAPS as basemap (basemap.id)}
        <option value={basemap.id}>{basemap.id === 'positron' ? 'Roadmap (Black & White)' : basemap.id === 'cyclosm' ? 'Roadmap (OpenCycleMap)' : 'Satellite'}</option>
      {/each}
    </select>
  </div>
</div>
