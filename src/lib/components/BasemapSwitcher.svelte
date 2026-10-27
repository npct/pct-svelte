<script lang="ts">
  import { appState, BASEMAPS } from '../state.svelte';
  import type { BasemapId } from '../types';

  function handleSelect(id: BasemapId) {
    appState.setBasemap(id);
  }
</script>

<div class="space-y-2">
  <div class="flex items-center justify-between">
    <span class="text-xs font-semibold uppercase tracking-wider text-slate-500">
      Basemap
    </span>
    <span class="text-xs text-slate-400 capitalize">
      {appState.basemap}
    </span>
  </div>

  <div class="grid grid-cols-3 gap-1.5 rounded-xl bg-slate-100 p-1" role="group" aria-label="Basemap Style">
    {#each BASEMAPS as bm (bm.id)}
      {@const isActive = appState.basemap === bm.id}
      <button
        type="button"
        onclick={() => handleSelect(bm.id)}
        aria-pressed={isActive}
        class={`flex flex-col items-center justify-center rounded-lg py-2 px-1 text-center transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 ${
          isActive
            ? 'bg-white text-sky-900 font-semibold shadow-xs ring-1 ring-slate-200/80'
            : 'text-slate-600 hover:bg-slate-200/60 hover:text-slate-900'
        }`}
      >
        <span class="text-xs font-medium">{bm.name}</span>
        <span class="text-[9px] text-slate-400 tracking-tight">{bm.id === 'positron' ? 'Default' : bm.id === 'satellite' ? 'Imagery' : 'Cycling'}</span>
      </button>
    {/each}
  </div>
</div>
