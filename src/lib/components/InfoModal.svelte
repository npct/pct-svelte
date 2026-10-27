<script lang="ts">
  import { appState } from '../state.svelte';

  function close() {
    appState.infoModalOpen = false;
  }

  function handleBackdrop(e: MouseEvent) {
    if (e.target === e.currentTarget) {
      close();
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape' && appState.infoModalOpen) {
      close();
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

{#if appState.infoModalOpen}
  <div
    role="presentation"
    class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs transition-opacity"
    onclick={handleBackdrop}
  >
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
      tabindex="-1"
      class="relative w-full max-w-lg overflow-hidden rounded-2xl bg-white p-6 shadow-2xl border border-slate-200 focus:outline-none"
    >
      <!-- Close Button -->
      <button
        type="button"
        onclick={close}
        class="absolute top-4 right-4 text-slate-400 hover:text-slate-600 rounded-lg p-1.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
        aria-label="Close dialog"
      >
        <svg class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
          <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd" />
        </svg>
      </button>

      <div class="mb-4">
        <h2 id="modal-title" class="text-lg font-bold text-slate-900">Propensity to Cycle Tool</h2>
        <p class="text-xs text-slate-500">West Yorkshire Combined Authority Dashboard</p>
      </div>

      <div class="space-y-3 text-sm text-slate-600 leading-relaxed">
        <p>
          The <strong>Propensity to Cycle Tool (PCT)</strong> is an evidence-based planning tool that assists transport planners and authorities in prioritizing cycling infrastructure investments.
        </p>

        <div class="rounded-xl bg-slate-50 p-3 border border-slate-100 space-y-2 text-xs">
          <div class="font-semibold text-slate-800">Cycling Scenarios:</div>
          <ul class="list-disc list-inside space-y-1 text-slate-600">
            <li><strong>Census 2011 (Base):</strong> Baseline commuter cycling levels recorded in the census.</li>
            <li><strong>Government Target:</strong> Models near-term doubling of national cycling stages.</li>
            <li><strong>Gender Equality:</strong> Models equality in cycling propensity between women and men.</li>
            <li><strong>Go Dutch:</strong> Simulates high-quality Dutch-standard cycling infrastructure.</li>
            <li><strong>Ebikes:</strong> Accounts for electric cycle uptake reducing the impact of hilliness.</li>
          </ul>
        </div>

        <div class="rounded-xl bg-sky-50 p-3 border border-sky-100 text-xs text-sky-900 space-y-1">
          <div class="font-semibold text-sky-950">Data & Vector Tiles:</div>
          <p>
            This modernized application streams compact PMTiles archives directly to the client with MapLibre GL JS and Svelte 5.
          </p>
        </div>
      </div>

      <div class="mt-6 flex justify-end">
        <button
          type="button"
          onclick={close}
          class="rounded-xl bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
        >
          Close
        </button>
      </div>
    </div>
  </div>
{/if}
