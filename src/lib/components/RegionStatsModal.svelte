<script lang="ts">
  import { appState, scenariosForPurpose } from '../state.svelte';
  import type * as maplibregl from 'maplibre-gl';
  import type { Scenario } from '../types';

  let dialogEl = $state<HTMLDialogElement | null>(null);
  let zoneFeatures = $state<Record<string, any>[]>([]);

  function closeDialog() {
    appState.statsModalOpen = false;
  }

  function handleDialogClick(event: MouseEvent) {
    if (!dialogEl) return;
    if (!('closedBy' in HTMLDialogElement.prototype)) {
      if (event.target !== dialogEl) return;
      const rect = dialogEl.getBoundingClientRect();
      const isDialogContent =
        rect.top <= event.clientY &&
        event.clientY <= rect.top + rect.height &&
        rect.left <= event.clientX &&
        event.clientX <= rect.left + rect.width;
      if (isDialogContent) return;
      dialogEl.close();
    }
  }

  function collectZoneFeatures() {
    const map = (window as Window & { __pct_map?: maplibregl.Map }).__pct_map;
    if (!map || !map.getSource('zones-source')) {
      zoneFeatures = [];
      return;
    }
    const raw = map.querySourceFeatures('zones-source', { sourceLayer: 'zones' });
    const byCode = new Map<string, Record<string, any>>();
    for (const f of raw) {
      const code = String(f.properties?.geo_code ?? '');
      if (code && !byCode.has(code)) {
        byCode.set(code, f.properties);
      }
    }
    zoneFeatures = [...byCode.values()];
  }

  $effect(() => {
    const open = appState.statsModalOpen;
    void appState.region;
    void appState.purpose;
    void appState.geography;
    void appState.scenario;
    if (!dialogEl) return;
    if (open) {
      if (!dialogEl.open) dialogEl.showModal();
      collectZoneFeatures();
    } else if (dialogEl.open) {
      dialogEl.close();
    }
  });

  const isSchool = $derived(appState.purpose === 'school');
  const scenarios = $derived(scenariosForPurpose(appState.purpose));
  const activeScenarioObj = $derived(
    scenarios.find((s) => s.id === appState.scenario) ?? scenarios[0]
  );

  function getZoneScenarioCyclists(props: Record<string, any>, scenario: Scenario): number {
    const base = Number(props.bicycle ?? 0);
    if (scenario === 'base') return base;
    if (isSchool) {
      if (props[`${scenario}_slc`] !== undefined) return Number(props[`${scenario}_slc`]);
      return base + Number(props[`${scenario}_sic`] ?? 0);
    }
    return Number(props[`${scenario}_slc`] ?? props[`${scenario}_sic`] ?? base);
  }

  function summarizeZones(rows: Record<string, any>[], scenario: Scenario) {
    let all = 0;
    let baseCyclists = 0;
    let baseDrivers = 0;
    let scenCyclists = 0;
    let changeDrivers = 0;
    let yll = 0;
    let valueYll = 0;
    let sickDays = 0;
    let valueSick = 0;
    let co2Kg = 0;

    for (const p of rows) {
      all += Number(p.all ?? 0);
      baseCyclists += Number(p.bicycle ?? 0);
      baseDrivers += Number(isSchool ? (p.car ?? p.car_driver ?? 0) : (p.car_driver ?? 0));
      scenCyclists += getZoneScenarioCyclists(p, scenario);
      if (scenario !== 'base') {
        changeDrivers += Number(p[`${scenario}_sid`] ?? 0);
        yll += Number(p[`${scenario}_siyll`] ?? 0);
        valueYll += Number(p[`${scenario}_sivalueyll`] ?? 0);
        sickDays += Number(p[`${scenario}_sisickdays`] ?? 0);
        valueSick += Number(p[`${scenario}_sivaluesick`] ?? 0);
        co2Kg += Number(p[`${scenario}_sico2`] ?? 0);
      }
    }

    const baseShare = all > 0 ? (baseCyclists / all) * 100 : 0;
    const scenShare = all > 0 ? (scenCyclists / all) * 100 : 0;
    const baseDriverShare = all > 0 ? (baseDrivers / all) * 100 : 0;
    const netCyclistChange = scenCyclists - baseCyclists;
    const totalHealthValue = valueYll + valueSick;
    const co2Tonnes = co2Kg / 1000;

    return {
      zoneCount: rows.length,
      all,
      baseCyclists,
      baseShare,
      baseDrivers,
      baseDriverShare,
      scenCyclists,
      scenShare,
      netCyclistChange,
      changeDrivers,
      yll,
      valueYll,
      sickDays,
      valueSick,
      totalHealthValue,
      co2Tonnes
    };
  }

  const activeSummary = $derived(summarizeZones(zoneFeatures, appState.scenario));

  const scenarioComparison = $derived(
    scenarios.map((s) => ({
      scenario: s,
      stats: summarizeZones(zoneFeatures, s.id)
    }))
  );

  const ladBreakdown = $derived.by(() => {
    const groups = new Map<string, Record<string, any>[]>();
    for (const p of zoneFeatures) {
      const lad = String(p.lad_name ?? appState.regionPretty ?? 'Region');
      const list = groups.get(lad) ?? [];
      list.push(p);
      groups.set(lad, list);
    }
    return [...groups.entries()]
      .map(([ladName, rows]) => ({
        ladName,
        stats: summarizeZones(rows, appState.scenario)
      }))
      .sort((a, b) => b.stats.scenCyclists - a.stats.scenCyclists);
  });

  const fmtInt = (v: number) => Math.round(v).toLocaleString('en-GB');
  const fmtPct = (v: number) => `${v.toFixed(1)}%`;
  const fmtMoney = (v: number) => {
    const abs = Math.abs(v);
    if (abs >= 1_000_000) return `£${(v / 1_000_000).toFixed(2)}m`;
    if (abs >= 1_000) return `£${Math.round(v / 1_000).toLocaleString('en-GB')}k`;
    return `£${Math.round(v).toLocaleString('en-GB')}`;
  };
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<dialog
  bind:this={dialogEl}
  {...({ closedby: 'any' } as any)}
  aria-labelledby="region-stats-title"
  onclose={closeDialog}
  onclick={handleDialogClick}
  class="stats-dialog m-auto w-full max-w-4xl rounded-2xl border border-slate-200 bg-white p-0 text-slate-800 shadow-2xl"
>
  <div class="flex max-h-[86vh] flex-col">
    <!-- Modal Header -->
    <div class="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-6 py-4">
      <div>
        <div class="flex items-center gap-2">
          <span class="rounded bg-sky-100 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider text-sky-800">
            Region Stats
          </span>
          <span class="text-xs font-medium text-slate-500">
            {isSchool ? 'School travel (LSOA)' : `Commuting (${appState.geography.toUpperCase()})`}
          </span>
        </div>
        <h2 id="region-stats-title" class="mt-1 text-lg font-bold text-slate-900">
          {appState.regionPretty} — {activeScenarioObj.name}
        </h2>
      </div>
      <button
        type="button"
        onclick={closeDialog}
        aria-label="Close region statistics"
        class="rounded-lg p-1.5 text-slate-400 hover:bg-slate-200/70 hover:text-slate-700"
      >
        <svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>

    <!-- Modal Body -->
    <div class=" space-y-6 overflow-y-auto p-6 text-sm">
      {#if zoneFeatures.length === 0}
        <div class="rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-900">
          Enable <strong>Show Zones</strong> in the sidebar so regional zone statistics can be aggregated from the loaded map tiles.
        </div>
      {:else}
        <!-- Summary Cards -->
        <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div class="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5">
            <div class="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              {isSchool ? 'School Children' : 'Total Commuters'}
            </div>
            <div class="mt-1 text-xl font-bold text-slate-900">{fmtInt(activeSummary.all)}</div>
            <div class="mt-0.5 text-xs text-slate-500">
              Across {activeSummary.zoneCount} {appState.geography.toUpperCase()} zones
            </div>
          </div>

          <div class="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5">
            <div class="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Baseline Cyclists (2011)
            </div>
            <div class="mt-1 text-xl font-bold text-sky-700">
              {fmtInt(activeSummary.baseCyclists)}
              <span class="text-sm font-semibold text-slate-600">({fmtPct(activeSummary.baseShare)})</span>
            </div>
            <div class="mt-0.5 text-xs text-slate-500">
              {fmtInt(activeSummary.baseDrivers)} ({fmtPct(activeSummary.baseDriverShare)}) by car
            </div>
          </div>

          <div class="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3.5">
            <div class="text-[11px] font-semibold uppercase tracking-wider text-emerald-800">
              {appState.scenario === 'base' ? 'Active Scenario' : activeScenarioObj.shortName} Cyclists
            </div>
            <div class="mt-1 text-xl font-bold text-emerald-800">
              {fmtInt(activeSummary.scenCyclists)}
              <span class="text-sm font-semibold text-emerald-700">({fmtPct(activeSummary.scenShare)})</span>
            </div>
            <div class="mt-0.5 text-xs text-emerald-700">
              {#if appState.scenario === 'base'}
                Baseline Census mode share
              {:else}
                +{fmtInt(activeSummary.netCyclistChange)} cyclists ({fmtInt(activeSummary.changeDrivers)} car trips)
              {/if}
            </div>
          </div>

          <div class="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5">
            <div class="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              {isSchool ? 'CO₂e Impact (t/yr)' : 'Health & CO₂e Impact'}
            </div>
            {#if appState.scenario === 'base'}
              <div class="mt-1 text-sm font-medium text-slate-600">
                Select a future scenario to model health &amp; CO₂e gains
              </div>
            {:else if isSchool}
              <div class="mt-1 text-xl font-bold text-slate-900">
                {activeSummary.co2Tonnes.toFixed(1)} t/yr
              </div>
              <div class="mt-0.5 text-xs text-slate-500">Change in school travel CO₂e</div>
            {:else}
              <div class="mt-1 text-xl font-bold text-slate-900">
                {fmtMoney(activeSummary.totalHealthValue)}/yr
              </div>
              <div class="mt-0.5 text-xs text-slate-500">
                {activeSummary.co2Tonnes.toFixed(1)} t CO₂e/yr ({activeSummary.yll.toFixed(1)} YLLs)
              </div>
            {/if}
          </div>
        </div>

        <!-- Scenario Comparison Table -->
        <div>
          <h3 id="scenario-table-caption" class="mb-2 text-xs font-bold uppercase tracking-wider text-slate-600">
            Scenario Comparison ({appState.regionPretty})
          </h3>
          <div tabindex="0" role="region" aria-labelledby="scenario-table-caption" class="table-wrapper rounded-xl border border-slate-200">
            <table class="stats-table w-full text-left text-xs">
              <thead class="bg-slate-100 text-slate-700">
                <tr>
                  <th class="px-3 py-2.5 font-semibold">Scenario</th>
                  <th class="px-3 py-2.5 text-right font-semibold">Cyclists</th>
                  <th class="px-3 py-2.5 text-right font-semibold">Cycling %</th>
                  <th class="px-3 py-2.5 text-right font-semibold">Change in Cyclists</th>
                  <th class="px-3 py-2.5 text-right font-semibold">Change in Drivers</th>
                  {#if !isSchool}
                    <th class="px-3 py-2.5 text-right font-semibold">Health Benefit (£/yr)</th>
                  {/if}
                  <th class="px-3 py-2.5 text-right font-semibold">CO₂e Change (t/yr)</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-200">
                {#each scenarioComparison as row (row.scenario.id)}
                  <tr class={row.scenario.id === appState.scenario ? 'bg-sky-50/80 font-semibold' : 'hover:bg-slate-50'}>
                    <th class="px-3 py-2 font-medium text-slate-900">
                      <span class="mr-1.5 inline-block h-2 w-2 rounded-full" style="background-color: {row.scenario.color}"></span>
                      {row.scenario.name}
                    </th>
                    <td class="px-3 py-2 text-right font-mono">{fmtInt(row.stats.scenCyclists)}</td>
                    <td class="px-3 py-2 text-right font-mono">{fmtPct(row.stats.scenShare)}</td>
                    <td class="px-3 py-2 text-right font-mono">
                      {row.scenario.id === 'base' ? '–' : `+${fmtInt(row.stats.netCyclistChange)}`}
                    </td>
                    <td class="px-3 py-2 text-right font-mono">
                      {row.scenario.id === 'base' ? '–' : fmtInt(row.stats.changeDrivers)}
                    </td>
                    {#if !isSchool}
                      <td class="px-3 py-2 text-right font-mono">
                        {row.scenario.id === 'base' ? '–' : fmtMoney(row.stats.totalHealthValue)}
                      </td>
                    {/if}
                    <td class="px-3 py-2 text-right font-mono">
                      {row.scenario.id === 'base' ? '–' : row.stats.co2Tonnes.toFixed(1)}
                    </td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        </div>

        <!-- Local Authority Breakdown Table -->
        {#if ladBreakdown.length > 0}
          <div>
            <h3 id="lad-table-caption" class="mb-2 text-xs font-bold uppercase tracking-wider text-slate-600">
              Local Authority District Breakdown ({activeScenarioObj.shortName})
            </h3>
            <div tabindex="0" role="region" aria-labelledby="lad-table-caption" class="table-wrapper rounded-xl border border-slate-200">
              <table class="stats-table w-full text-left text-xs">
                <thead class="bg-slate-100 text-slate-700">
                  <tr>
                    <th class="px-3 py-2.5 font-semibold">Local Authority</th>
                    <th class="px-3 py-2.5 text-right font-semibold">Zones</th>
                    <th class="px-3 py-2.5 text-right font-semibold">{isSchool ? 'Children' : 'Commuters'}</th>
                    <th class="px-3 py-2.5 text-right font-semibold">Baseline Cyclists</th>
                    <th class="px-3 py-2.5 text-right font-semibold">Scenario Cyclists</th>
                    <th class="px-3 py-2.5 text-right font-semibold">Mode Share</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-slate-200">
                  {#each ladBreakdown as row (row.ladName)}
                    <tr class="hover:bg-slate-50">
                      <th class="px-3 py-2 font-medium text-slate-900">{row.ladName}</th>
                      <td class="px-3 py-2 text-right font-mono">{row.stats.zoneCount}</td>
                      <td class="px-3 py-2 text-right font-mono">{fmtInt(row.stats.all)}</td>
                      <td class="px-3 py-2 text-right font-mono">
                        {fmtInt(row.stats.baseCyclists)} ({fmtPct(row.stats.baseShare)})
                      </td>
                      <td class="px-3 py-2 text-right font-mono font-semibold text-sky-800">
                        {fmtInt(row.stats.scenCyclists)}
                      </td>
                      <td class="px-3 py-2 text-right font-mono font-semibold text-emerald-700">
                        {fmtPct(row.stats.scenShare)}
                      </td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            </div>
          </div>
        {/if}
      {/if}
    </div>
  </div>
</dialog>

<style>
  .stats-dialog::backdrop {
    background-color: rgba(15, 23, 42, 0.5);
    backdrop-filter: blur(2px);
  }

  .table-wrapper {
    overflow: auto;
    max-inline-size: 100%;
    max-block-size: min(320px, 50vh);
    container-type: inline-size;
  }

  .stats-table {
    border-collapse: separate;
    border-spacing: 0;
  }

  .stats-table thead {
    position: sticky;
    inset-block-start: 0;
    z-index: 2;
  }

  .stats-table tbody th {
    position: sticky;
    inset-inline-start: 0;
    background: inherit;
    z-index: 1;
  }
</style>
