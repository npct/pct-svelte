<script lang="ts">
  import { appState } from '../state.svelte';
  import { scenariosForPurpose } from '../state.svelte';

  let open = $derived(appState.downloadsOpen);

  interface DownloadItem { label: string; file: string; note?: string }
  const BASE = 'https://github.com/npct/pct-outputs-regional-notR/raw/master';

  // Upstream npct/pct-outputs-regional-notR layout, verified 2026-08-22:
  //   commute/msoa|lsoa/<region>/: z c l rf rq [rnet_full] z_attributes.csv od_attributes.csv
  //   school/lsoa/<region>/:       z d rnet_full z_attributes.csv d_attributes.csv
  const items = $derived.by<DownloadItem[]>(() => {
    const region = appState.region;
    if (!region) return [];
    const geography = appState.geography;
    const base = `${BASE}/commute/${geography}/${region}`;
    const label = geography === 'lsoa' ? 'LSOA' : 'MSOA';
    const out: DownloadItem[] = [];
    out.push({ label: `Zones (${label}, GeoJSON)`, file: `${base}/z.geojson`, note: `${label} commute data` });
    out.push({ label: `Zones attributes (${label}, CSV)`, file: `${base}/z_attributes.csv`, note: 'codebook: zone attribute definitions' });
    out.push({ label: `Desire lines (${label}, GeoJSON)`, file: `${base}/l.geojson` });
    out.push({ label: `Fast routes (${label}, GeoJSON)`, file: `${base}/rf.geojson` });
    out.push({ label: `Quieter routes (${label}, GeoJSON)`, file: `${base}/rq.geojson` });
    out.push({ label: 'Route network (LSOA, GeoJSON)', file: `${BASE}/commute/lsoa/${region}/rnet_full.geojson`, note: 'LSOA route network' });
    out.push({ label: 'Centroids (GeoJSON)', file: `${base}/c.geojson` });
    out.push({ label: 'OD attributes (CSV)', file: `${base}/od_attributes.csv`, note: 'codebook: OD/desire-line attribute definitions' });
    return out;
  });

  const schoolItems = $derived.by<DownloadItem[]>(() => {
    const region = appState.region;
    if (!region) return [];
    return [
      { label: 'School zones (GeoJSON)', file: `${BASE}/school/lsoa/${region}/z.geojson`, note: 'LSOA school travel data' },
      { label: 'School destinations (GeoJSON)', file: `${BASE}/school/lsoa/${region}/d.geojson` },
      { label: 'School route network (GeoJSON)', file: `${BASE}/school/lsoa/${region}/rnet_full.geojson` },
      { label: 'School zone attributes (CSV)', file: `${BASE}/school/lsoa/${region}/z_attributes.csv`, note: 'codebook' },
      { label: 'School destination attributes (CSV)', file: `${BASE}/school/lsoa/${region}/d_attributes.csv`, note: 'codebook' }
    ];
  });

  function close() {
    appState.downloadsOpen = false;
  }

  function onKeydown(e: KeyboardEvent) {
    if (open && e.key === 'Escape') close();
  }
</script>

<svelte:window onkeydown={onKeydown} />

{#if open}
  <div class="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Data and downloads">
    <button type="button" class="absolute inset-0 cursor-default bg-slate-900/40 backdrop-blur-[2px]" onclick={close} aria-label="Close downloads panel" tabindex="-1"></button>
    <div class="relative flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
      <!-- Header -->
      <div class="flex items-center justify-between border-b border-slate-100 px-5 py-3">
        <div>
          <h2 class="text-sm font-bold text-slate-900">Data &amp; downloads</h2>
          <p class="text-xs text-slate-500">{appState.regionPretty} · upstream PCT open data</p>
        </div>
        <button
          type="button"
          onclick={close}
          aria-label="Close"
          class="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
        >
          <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" d="M6 6l12 12M18 6L6 18"/></svg>
        </button>
      </div>

      <!-- Body -->
      <div class="overflow-y-auto px-5 py-4 text-sm">
        <p class="mb-4 text-xs leading-relaxed text-slate-500">
          GeoJSON files open directly in QGIS or ArcGIS; the CSVs document the attribute fields
          (the "codebook"). Full national datasets and the R package are linked at the bottom.
        </p>

        <div class="font-semibold text-slate-800">Commuting ({appState.geography.toUpperCase()}) · {appState.regionPretty}</div>
        <ul class="mt-1 divide-y divide-slate-100 rounded-xl border border-slate-200">
          {#each items as item (item.file)}
            <li>
              <a href={item.file} target="_blank" rel="noreferrer" class="flex items-center justify-between gap-2 px-3 py-2 hover:bg-sky-50 focus:bg-sky-50 focus:outline-none">
                <span class="text-slate-700">{item.label}</span>
                <span class="shrink-0 text-[11px] font-medium text-sky-700">Download ↓</span>
              </a>
            </li>
          {/each}
        </ul>

        {#if (appState.regionDataManifest[appState.region] ?? {}).school_zones}
          <div class="mt-4 font-semibold text-slate-800">School travel ({appState.regionPretty})</div>
          <ul class="mt-1 divide-y divide-slate-100 rounded-xl border border-slate-200">
            {#each schoolItems as item (item.file)}
              <li>
                <a href={item.file} target="_blank" rel="noreferrer" class="flex items-center justify-between gap-2 px-3 py-2 hover:bg-sky-50 focus:bg-sky-50 focus:outline-none">
                  <span class="text-slate-700">{item.label}</span>
                  <span class="shrink-0 text-[11px] font-medium text-sky-700">Download ↓</span>
                </a>
              </li>
            {/each}
          </ul>
        {:else}
          <p class="mt-4 text-xs italic text-slate-400">No school travel data published for this region upstream.</p>
        {/if}

        <div class="mt-4 font-semibold text-slate-800">National data &amp; tools</div>
        <ul class="mt-1 space-y-1.5 text-xs">
          <li><a class="text-sky-700 hover:underline" href="https://github.com/npct/pct-outputs-regional-notR" target="_blank" rel="noreferrer">All regional outputs (npct/pct-outputs-regional-notR)</a></li>
          <li><a class="text-sky-700 hover:underline" href="https://itsleeds.github.io/pct/articles/getting.html" target="_blank" rel="noreferrer">Getting PCT data with the R package (<code>pct::get_pct()</code>)</a></li>
          <li><a class="text-sky-700 hover:underline" href="https://www.pct.bike/manual.html" target="_blank" rel="noreferrer">User manuals A–D (methods &amp; codebooks)</a></li>
        </ul>
        <p class="mt-4 text-[11px] leading-relaxed text-slate-400">
          Source: PCT open data (CC-BY-SA). Large route files can take a while to download.
        </p>
      </div>
    </div>
  </div>
{/if}
