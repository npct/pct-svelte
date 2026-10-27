<script lang="ts">
  import { appState, SCENARIOS } from '../state.svelte';
  import type { Scenario } from '../types';

  const active = $derived(SCENARIOS.find(s => s.id === appState.scenario));

  function handleSelect(e: Event) {
    appState.setScenario((e.target as HTMLSelectElement).value as Scenario);
  }
</script>

<div class="space-y-1">
  <label
    for="scenario-select"
    class="block text-xs font-semibold uppercase tracking-wider text-slate-500"
  >
    Scenario
  </label>
  <select
    id="scenario-select"
    value={appState.scenario}
    onchange={handleSelect}
    class="w-full cursor-pointer rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm font-medium text-slate-800 shadow-xs focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
  >
    {#each SCENARIOS as s (s.id)}
      <option value={s.id}>{s.name}</option>
    {/each}
  </select>
  <p class="text-[11px] leading-snug text-slate-500">
    {active?.description}
  </p>
</div>
