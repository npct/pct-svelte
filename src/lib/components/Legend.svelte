<script lang="ts">
  import { appState, scenariosForPurpose } from '../state.svelte';
  import ZoneLegendRamp from './ZoneLegendRamp.svelte';

  let collapsed = $state(false);

  const desireRamp = [
    { label: '1', width: '1.5px', color: '#800000' },
    { label: '10', width: '2.5px', color: '#800000' },
    { label: '50', width: '4px', color: '#800000' },
    { label: '200+', width: '6px', color: '#800000' }
  ];

  const rnetRamp = [
    { label: '1–9', width: '1px' },
    { label: '10–49', width: '1.5px' },
    { label: '50–199', width: '2px' },
    { label: '200–499', width: '3px' },
    { label: '500–999', width: '4px' },
    { label: '1,000+', width: '5px' }
  ];

  const currentScenarioName = $derived(
    scenariosForPurpose(appState.purpose).find(s => s.id === appState.scenario)?.name || 'Active'
  );
</script>

<div class="pointer-events-auto max-w-xs transition-all duration-200">
  <div class="rounded-xl border border-slate-200/90 bg-white/95 p-3 shadow-lg backdrop-blur-md">
    <!-- Header -->
    <div class="flex items-center justify-between gap-2 pb-2">
      <div class="flex items-center gap-1.5 min-w-0">
        <span class="h-2 w-2 rounded-full bg-emerald-500"></span>
        <h3 class="text-xs font-semibold uppercase tracking-wider text-slate-700 truncate">
          Legend
        </h3>
      </div>
      <button
        type="button"
        onclick={() => collapsed = !collapsed}
        class="text-slate-400 hover:text-slate-600 rounded p-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
        aria-label={collapsed ? 'Expand legend' : 'Collapse legend'}
      >
        <svg
          class={`h-3.5 w-3.5 transform transition-transform ${collapsed ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
    </div>

    {#if !collapsed}
      <div class="space-y-3 pt-1 border-t border-slate-100 text-xs text-slate-700">
        <!-- Zones Choropleth Legend -->
        {#if appState.isLayerActive('zones')}
          <div>
            <div class="flex items-center justify-between text-[11px] font-medium text-slate-600 mb-1">
              <span>{appState.purpose === 'school' ? '% cycling to school' : '% cycling to work'}</span>
            </div>
            <ZoneLegendRamp />
          </div>
        {/if}

        <!-- Desire Lines Legend -->
        {#if appState.isLayerActive('desire')}
          <div class="border-t border-slate-100 pt-2">
            <div class="flex items-center justify-between text-[11px] font-medium text-slate-600 mb-1.5">
              <span>Desire Lines (Cyclists / day)</span>
              <span class="text-[10px] text-sky-600 font-mono">
                {appState.freezeLines ? `Frozen (${appState.frozenLineCount})` : `Top ${appState.n}`}
              </span>
            </div>
            <div class="flex items-center justify-between gap-2 px-1">
              {#each desireRamp as step}
                <div class="flex flex-col items-center gap-1">
                  <div class="h-4 flex items-center justify-center">
                    <span
                      class="rounded-full"
                      style="width: 24px; height: {step.width}; background-color: {step.color};"
                    ></span>
                  </div>
                  <span class="text-[9px] text-slate-500 font-mono">{step.label}</span>
                </div>
              {/each}
            </div>
          </div>
        {/if}

        <!-- Fast / Quiet Routes Legend -->
        {#if appState.isLayerActive('fast') || appState.isLayerActive('quiet')}
          <div class="border-t border-slate-100 pt-2 space-y-1.5">
            <div class="flex items-center justify-between text-[11px] font-medium text-slate-600">
              <span>Routes</span>
              <span class="text-[10px] text-sky-600 font-mono">
                {appState.freezeLines ? `Frozen (${appState.frozenLineCount})` : `Top ${appState.n}`}
              </span>
            </div>
            <div class="space-y-1">
              {#if appState.isLayerActive('fast')}
                <div class="flex items-center gap-2">
                  <span class="h-1 w-5 rounded bg-[#800080]"></span>
                  <span class="text-[11px] text-slate-600">Fast Route (Direct, main roads)</span>
                </div>
              {/if}
              {#if appState.isLayerActive('quiet')}
                <div class="flex items-center gap-2">
                  <span class="w-5 border-b-2 border-dashed border-[#006400]"></span>
                  <span class="text-[11px] text-slate-600">Quieter Route (Low-traffic / greenway)</span>
                </div>
              {/if}
            </div>
          </div>
        {/if}

        <!-- Route Network Legend -->
        {#if appState.isLayerActive('rnet')}
          <div class="border-t border-slate-100 pt-2">
            <div class="flex items-center justify-between text-[11px] font-medium text-slate-600 mb-1">
              <span>{appState.purpose === 'school' ? 'Cyclists on school route network' : 'Cyclists on route network'}</span>
            </div>
            <div class="grid grid-cols-6 gap-1 items-end">
              {#each rnetRamp as step}
                <div class="flex min-w-0 flex-col items-center gap-1">
                  <span class="block w-6 rounded bg-[#4575B4]" style="height: {step.width};"></span>
                  <span class="text-[8px] text-slate-500 font-mono whitespace-nowrap">{step.label}</span>
                </div>
              {/each}
            </div>
            <p class="mt-1 text-[10px] leading-snug text-slate-500">
              Estimated cyclists on each LSOA route segment under {currentScenarioName}.
            </p>
          </div>
        {/if}

        {#if appState.layers.length === 0}
          <p class="text-[11px] text-slate-400 italic py-1">
            No active map layers. Enable layers in the sidebar panel.
          </p>
        {/if}
      </div>
    {/if}
  </div>
</div>
