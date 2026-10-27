<script lang="ts">
  import { appState, LAYERS } from '../state.svelte';
  import type { LayerId } from '../types';

  function handleToggle(id: LayerId) {
    appState.toggleLayer(id);
  }

  function handleSlider(e: Event) {
    const target = e.target as HTMLInputElement;
    appState.setN(parseInt(target.value, 10));
  }
</script>

<div class="space-y-1.5">
  <div class="flex items-center justify-between">
    <span class="text-xs font-semibold uppercase tracking-wider text-slate-500">
      Cycling Flows &amp; Layers
    </span>
    <span class="text-[11px] text-slate-400 font-mono">
      {appState.layers.length} active
    </span>
  </div>

  <!-- Compact checkbox grid: colour swatch + short name, 2 columns -->
  <div class="grid grid-cols-2 gap-x-2 gap-y-1" role="group" aria-label="Map layers">
    {#each LAYERS as layer (layer.id)}
      {@const isActive = appState.isLayerActive(layer.id)}
      <label
        class={`flex cursor-pointer items-center gap-1.5 rounded-md border px-2 py-1 transition-colors ${
          isActive
            ? 'border-slate-300 bg-white text-slate-900'
            : 'border-slate-200/70 bg-slate-50/50 text-slate-500 hover:bg-slate-100/70'
        }`}
        title={layer.description}
      >
        <input
          type="checkbox"
          checked={isActive}
          onchange={() => handleToggle(layer.id)}
          aria-label={`Toggle ${layer.name}`}
          class="h-3.5 w-3.5 shrink-0 cursor-pointer accent-sky-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
        />
        <span
          class="h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-white/80"
          style="background-color: {layer.color}; opacity: {isActive ? '1' : '0.35'};"
        ></span>
        <span class="truncate text-xs font-medium">
          {layer.name.replace(' (MSOA Choropleth)', '').replace(' (RNet)', '')}
        </span>
      </label>
    {/each}
  </div>

  <!-- Inline Top-N slider, only when desire lines active -->
  {#if appState.isLayerActive('desire')}
    <div class="flex items-center gap-2 px-0.5 pt-0.5">
      <span class="shrink-0 text-[11px] font-medium text-slate-600">Top-N</span>
      <input
        type="range"
        min="10"
        max="100"
        step="5"
        value={appState.n}
        oninput={handleSlider}
        aria-label="Desire lines Top-N slider"
        class="h-1.5 w-full min-w-0 cursor-pointer appearance-none rounded-lg bg-slate-200 accent-sky-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
      />
      <span class="w-7 shrink-0 rounded bg-sky-100 px-1 text-center font-mono text-[11px] font-semibold text-sky-800">
        {appState.n}
      </span>
    </div>
  {/if}
</div>
