<script lang="ts">
  import { appState } from '../state.svelte';
  import { toastStore } from '../toast.svelte';
  import PctControls from './PctControls.svelte';

  function handleShare() {
    if (typeof window !== 'undefined') {
      const url = window.location.href;
      navigator.clipboard.writeText(url).then(() => {
        toastStore.add('Shareable URL link copied to clipboard!', 'success', 'URL Copied');
      }).catch(() => {
        toastStore.add(url, 'info', 'Current View URL');
      });
    }
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === '[' || (e.key === 'Escape' && appState.sidebarOpen)) {
      appState.toggleSidebar();
    }
  }
</script>

<svelte:window onkeydown={handleKeyDown} />

<!-- Mobile toggle floating button (when sidebar closed) -->
{#if !appState.sidebarOpen}
  <button
    type="button"
    onclick={() => appState.toggleSidebar()}
    aria-label="Show controls panel"
    title="Show controls panel (press [)"
    class="fixed top-4 left-4 z-40 flex h-10 items-center gap-2 rounded-xl border border-sky-300 bg-white/95 px-3.5 shadow-lg ring-2 ring-sky-500/30 backdrop-blur-md transition-all hover:bg-sky-50 hover:border-sky-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
  >
    <svg class="h-4 w-4 text-sky-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <rect width="18" height="18" x="3" y="3" rx="2" />
      <path d="M9 3v18" />
    </svg>
    <span class="text-xs font-semibold text-slate-800">Show Controls</span>
  </button>
{/if}

<!-- Sidebar Container -->
<aside
  aria-label="PCT Controls Panel"
  class={`fixed inset-y-0 left-0 z-30 flex flex-col w-84 max-w-[90vw] bg-white border-r border-slate-200/90 shadow-2xl transition-transform duration-300 ease-in-out ${
    appState.sidebarOpen ? 'translate-x-0' : '-translate-x-full'
  }`}
>
  <!-- Header with PCT logo (click -> landing page) -->
  <div class="relative border-b border-slate-100 bg-white px-6 py-4">
    <a
      href="/"
      onclick={(e) => {
        e.preventDefault();
        appState.setRegion('');
      }}
      aria-label="Propensity to Cycle Tool — back to the regional map"
      title="Back to the regional map"
      class="block"
    >
      <img
        src="/pct-logo.png"
        alt="Propensity to Cycle Tool"
        class="block h-auto w-full"
      />
    </a>

    <!-- Region identity strip (idea #5): mirrors shiny's region context header -->
    <div class="mt-3 flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2">
      <div class="min-w-0 text-xs leading-tight text-slate-600">
        <span class="font-semibold text-slate-800">{appState.regionPretty}</span>
        <span class="mx-1 text-slate-300">·</span>{appState.purpose === 'school' ? 'School travel' : 'Commuting'}
        <span class="mx-1 text-slate-300">·</span>{(appState.geography ?? 'msoa').toUpperCase()}
      </div>
      <button
        type="button"
        onclick={() => appState.setRegion('')}
        aria-label="Change region — back to the landing page"
        title="Change region (back to the national map)"
        class="shrink-0 rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-sky-700 hover:bg-sky-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
      >Change</button>
    </div>

    <!-- Collapse button -->
    <button
      type="button"
      onclick={() => appState.toggleSidebar()}
      aria-label="Hide panel"
      title="Hide panel (Press [)"
      class="absolute right-2 top-2 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white/80 text-slate-400 hover:bg-slate-200/70 hover:text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
    >
      <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
      </svg>
    </button>
  </div>

  <!-- Scrollable Body -->
  <div class="flex-1 overflow-y-auto p-4 space-y-5">
    <PctControls />
  </div>

  <!-- Footer Actions -->
  <div class="border-t border-slate-100 p-3 bg-slate-50/70 flex items-center justify-between gap-2">
    <button
      type="button"
      onclick={handleShare}
      class="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl bg-sky-600 px-3 py-2 text-xs font-semibold text-white shadow-xs hover:bg-sky-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
    >
      <svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path stroke-linecap="round" stroke-linejoin="round" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
      </svg>
      <span>Share View</span>
    </button>

    <button
      type="button"
      onclick={() => appState.downloadsOpen = true}
      class="inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-2.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
      title="Data & downloads (GeoJSON + codebooks)"
    >
      <svg class="h-3.5 w-3.5 text-slate-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path stroke-linecap="round" stroke-linejoin="round" d="M12 3v12m0 0l-4-4m4 4l4-4M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2" />
      </svg>
      <span>Data</span>
    </button>

    <button
      type="button"
      onclick={() => appState.infoModalOpen = true}
      class="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-2.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
      title="About Propensity to Cycle Tool"
    >
      <svg class="h-3.5 w-3.5 text-slate-500" viewBox="0 0 20 20" fill="currentColor">
        <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z" clip-rule="evenodd" />
      </svg>
    </button>
  </div>
</aside>
