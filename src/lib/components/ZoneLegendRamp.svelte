<script lang="ts">
  // pct-shiny zone choropleth legend: 10 stacked swatch+label rows
  // (bins 0-1, 2-3, 4-6, 7-9, 10-14, 15-19, 20-24, 25-29, 30-39, 40+).
  // Shared by the region-view Legend and the Landing hover card so the
  // two always stay in sync.
  import { ZONE_COLORS } from '../mapStyles';

  const zoneRamp = [
    { color: ZONE_COLORS[0], label: '0-1%' },
    { color: ZONE_COLORS[1], label: '2-3%' },
    { color: ZONE_COLORS[2], label: '4-6%' },
    { color: ZONE_COLORS[3], label: '7-9%' },
    { color: ZONE_COLORS[4], label: '10-14%' },
    { color: ZONE_COLORS[5], label: '15-19%' },
    { color: ZONE_COLORS[6], label: '20-24%' },
    { color: ZONE_COLORS[7], label: '25-29%' },
    { color: ZONE_COLORS[8], label: '30-39%' },
    { color: ZONE_COLORS[9], label: '40%+' }
  ];
</script>

<div class="space-y-px">
  {#each zoneRamp as step}
    <div class="flex items-center gap-1.5">
      <span class="h-3 w-6 border border-slate-200" style="background-color: {step.color};"></span>
      <span class="text-[9px] text-slate-600 font-mono">{step.label}</span>
    </div>
  {/each}
</div>
