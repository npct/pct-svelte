<script lang="ts">
  import Sidebar from './lib/components/Sidebar.svelte';
  import MapView from './lib/components/MapView.svelte';
  import ToastContainer from './lib/components/ToastContainer.svelte';
  import InfoModal from './lib/components/InfoModal.svelte';
  import DataDownloadsModal from './lib/components/DataDownloadsModal.svelte';
  import RegionStatsModal from './lib/components/RegionStatsModal.svelte';
  import Landing from './lib/components/Landing.svelte';
  import { appState } from './lib/state.svelte';

  // Dynamic document title follows the active region + view (idea #5).
  $effect(() => {
    if (typeof document === 'undefined') return;
    const base = 'Propensity to Cycle Tool (PCT)';
    document.title = appState.hasRegion ? `${appState.regionPretty} — ${base}` : `Welcome to the ${base}`;
  });
</script>

{#if appState.hasRegion}
  <main class="relative h-screen w-screen overflow-hidden bg-slate-900 font-sans antialiased">
    <!-- Full-viewport Maplibre Map -->
    <MapView />

    <!-- Left Collapsible Dashboard Sidebar -->
    <Sidebar />

    <!-- Toast Alerts Container -->
    <ToastContainer />

    <!-- Info & Methodology Modal -->
    <InfoModal />

    <!-- Data & Downloads Modal -->
    <DataDownloadsModal />

    <!-- Region Summary Statistics Modal -->
    <RegionStatsModal />
  </main>
{:else}
  <!-- Landing page: welcome + regions choropleth (no region selected yet) -->
  <Landing />
{/if}
