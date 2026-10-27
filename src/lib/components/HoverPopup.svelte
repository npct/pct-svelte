<script lang="ts">
  import { appState } from '../state.svelte';
  import type { FeatureHoverInfo } from '../types';

  let {
    hoverInfo,
    onClose = () => {}
  }: {
    hoverInfo: FeatureHoverInfo | null;
    onClose?: () => void;
  } = $props();

  const scenarioNames: Record<string, string> = {
    base: 'Census 2011 Cycling',
    govtarget: 'Government Target (equality)',
    gendereq: 'Gender equality',
    govnearmkt: 'Government Target (near market)',
    dutch: 'Go Dutch',
    ebike: 'Ebikes',
    cambridge: 'Go Cambridge'
  };

  const schoolScenarioNames: Record<string, string> = {
    base: 'School Census 2011',
    govtarget: 'Government Target (equality)',
    cambridge: 'Go Cambridge',
    dutch: 'Go Dutch'
  };

  const isSchool = $derived(appState.purpose === 'school');
  const scenarioLabel = $derived(
    isSchool
      ? (schoolScenarioNames[appState.scenario] ?? scenarioNames[appState.scenario])
      : scenarioNames[appState.scenario]
  );

  const fmtInt = (value: unknown) => Math.round(Number(value ?? 0)).toLocaleString('en-GB');
  const fmtOne = (value: unknown) => Number(value ?? 0).toFixed(1);
  const fmtTwo = (value: unknown) => Number(value ?? 0).toFixed(2);
  // R's round() uses round-half-to-even; pct-shiny relies on it for display.
  const roundR = (value: unknown, digits = 1) => {
    const f = 10 ** digits;
    const scaled = Math.round(Number(value ?? 0) * f * 1e10) / 1e10;
    const floored = Math.floor(scaled);
    if (scaled - floored === 0.5) {
      return (floored % 2 === 0 ? floored : floored + 1) / f;
    }
    return Math.round(scaled) / f;
  };
  // pct-shiny suppresses counts of 1-2 in school data ("1 or 2").
  const smallCell = (value: unknown) => {
    const v = Number(value ?? 0);
    return v > 0 && v <= 2 ? '1 or 2' : fmtInt(v);
  };
  const pct = (part: unknown, total: unknown) => {
    const all = Number(total ?? 0);
    return all > 0 ? Math.round((Number(part ?? 0) / all) * 100) : 0;
  };
  const money = (value: unknown) => `£${Math.round(Number(value ?? 0)).toLocaleString('en-GB')}`;

  const scenarioField = (suffix: string) => `${appState.scenario}_${suffix}`;
  const featureProps = $derived((hoverInfo?.properties ?? {}) as Record<string, unknown>);
  const pctStyle = $derived(featureProps.__pct_style as string | undefined);
  const isZone = $derived(hoverInfo?.layerId === 'zones-fill');
  const isDesire = $derived((hoverInfo?.layerId.includes('desire') ?? false) || pctStyle === 'desire');
  const isFast = $derived((hoverInfo?.layerId.includes('fast') ?? false) || pctStyle === 'fast');
  const isQuiet = $derived((hoverInfo?.layerId.includes('quiet') ?? false) || pctStyle === 'quiet');
  const isRnet = $derived(hoverInfo?.layerId.includes('rnet') ?? false);
  const isDestination = $derived(hoverInfo?.layerId === 'school-destinations');
  const isRegion = $derived(hoverInfo?.layerId === 'regions-fill');
  const isBaseline = $derived(appState.scenario === 'base');
  // School zone assets store scenario counts as *_sic, while the school
  // route-network assets store route counts as *_slc. Resolve by layer so a
  // school RNet popup does not silently display zero for a valid segment.
  const scenarioSuffix = $derived(isSchool ? (isRnet ? 'slc' : 'sic') : 'slc');
  const scenarioCyclists = $derived(
    isBaseline
      ? Number(featureProps.bicycle ?? 0)
      : Number(featureProps[scenarioField(scenarioSuffix)] ?? featureProps[scenarioField('slc')] ?? 0)
  );
</script>

<div class="pct-popup">
  {#if !isRegion}
    <button type="button" class="popup-close" onclick={onClose} aria-label="Close popup" title="Close popup">×</button>
  {/if}
  {#if isRegion}
    <div class="popup-heading">{featureProps.region_pretty || 'Region'}</div>
    <div class="popup-subheading">Click to view</div>
    <table>
      <tbody>
        <tr><td>Cycling to work (baseline)</td><td>{Number(featureProps.bicycle_perc ?? 0).toFixed(0)}%</td></tr>
      </tbody>
    </table>
  {:else if isZone}
    <div class="popup-heading">{isSchool ? 'All school children living in zone' : 'All residents living in zone'}</div>
    <div class="popup-subheading">
      {#if isBaseline}{scenarioLabel} (baseline){:else}Scenario: {scenarioLabel}{/if}
    </div>
    <div class="popup-place">{featureProps.geo_name} ({featureProps.geo_code})</div>
    <table>
      <tbody>
        <tr><td>{isSchool ? 'Total school children' : 'Total commuters'}</td><td>{isSchool ? smallCell(featureProps.all) : fmtInt(featureProps.all)}</td></tr>
        <tr><td>Cyclists (baseline)</td><td>{isSchool ? smallCell(featureProps.bicycle) : fmtInt(featureProps.bicycle)} ({pct(featureProps.bicycle, featureProps.all)}%)</td></tr>
        {#if isBaseline}
          <tr><td>{isSchool ? 'Driven by car (baseline)' : 'Drivers (baseline)'}</td><td>{isSchool ? smallCell(featureProps.car) : fmtInt(featureProps.car_driver)} ({pct(isSchool ? featureProps.car : featureProps.car_driver, featureProps.all)}%)</td></tr>
        {:else if isSchool}
          <tr><td>Cyclists (scenario)</td><td>{smallCell(featureProps[scenarioField('sic')])} ({pct(featureProps[scenarioField('sic')], featureProps.all)}%)</td></tr>
          <tr><td>Change in driven by car</td><td>{fmtInt(featureProps[scenarioField('sid')])}</td></tr>
          <tr><td>Change (% change) in active travel mMETs/child/week</td><td>{roundR(featureProps[scenarioField('simmet')])} ({pct(featureProps[scenarioField('simmet')], featureProps.baseline_at_mmet)}%)</td></tr>
          <tr><td>Change in CO₂e (t/yr)</td><td>{fmtOne(Number(featureProps[scenarioField('sico2')] ?? 0) / 1000)}</td></tr>
        {:else}
          <tr><td>Cyclists (scenario)</td><td>{fmtInt(scenarioCyclists)} ({pct(scenarioCyclists, featureProps.all)}%)</td></tr>
          <tr><td>Change in drivers</td><td>{fmtInt(featureProps[scenarioField('sid')])}</td></tr>
          <tr><td>Change in YLLs/yr</td><td>{fmtTwo(featureProps[scenarioField('siyll')])} ({money(featureProps[scenarioField('sivalueyll')])})</td></tr>
          <tr><td>Change in days sick leave/yr</td><td>{fmtOne(featureProps[scenarioField('sisickdays')])} ({money(featureProps[scenarioField('sivaluesick')])})</td></tr>
          <tr><td>Change in CO₂e (t/yr)</td><td>{fmtOne(Number(featureProps[scenarioField('sico2')] ?? 0) / 1000)}</td></tr>
        {/if}
      </tbody>
    </table>
  {:else if isDestination}
    <div class="popup-heading">{featureProps.schoolname || 'School'}</div>
    <div class="popup-subheading">
      {#if isBaseline}{scenarioLabel} (baseline){:else}Scenario: {scenarioLabel}{/if}
    </div>
    <div class="popup-place">{featureProps.phase || 'School'} · {featureProps.urn || ''}</div>
    <table>
      <tbody>
        <tr><td>Total school children</td><td>{smallCell(featureProps.all)}</td></tr>
        <tr><td>Cyclists (baseline)</td><td>{smallCell(featureProps.bicycle)} ({pct(featureProps.bicycle, featureProps.all)}%)</td></tr>
        {#if !isBaseline}
          <tr><td>Cyclists (scenario)</td><td>{smallCell(featureProps[scenarioField('sic')])}</td></tr>
        {/if}
      </tbody>
    </table>
  {:else if isDesire || isFast}
    <div class="popup-heading">{isDesire ? 'Straight line commuter flow' : 'Fast route'}</div>
    <div class="popup-subheading">
      {#if isBaseline}{scenarioLabel} (baseline){:else}Scenario: {scenarioLabel}{/if}
    </div>
    <div class="popup-place">{featureProps.geo_name1} – {featureProps.geo_name2}</div>
    <table>
      <tbody>
        <tr><td>Total commuters</td><td>{fmtInt(featureProps.all)}</td></tr>
        <tr><td>Cyclists (baseline)</td><td>{fmtInt(featureProps.bicycle)} ({pct(featureProps.bicycle, featureProps.all)}%)</td></tr>
        {#if isBaseline}
          <tr><td>Drivers (baseline)</td><td>{fmtInt(featureProps.car_driver)} ({pct(featureProps.car_driver, featureProps.all)}%)</td></tr>
        {:else}
          <tr><td>Cyclists (scenario)</td><td>{fmtInt(scenarioCyclists)} ({pct(scenarioCyclists, featureProps.all)}%)</td></tr>
          <tr><td>Change in drivers</td><td>{fmtInt(featureProps[scenarioField('sid')])}</td></tr>
          <tr><td>Change in YLLs/yr</td><td>{fmtTwo(featureProps[scenarioField('siyll')])} ({money(featureProps[scenarioField('sivalueyll')])})</td></tr>
          <tr><td>Change in days sick leave/yr</td><td>{fmtOne(featureProps[scenarioField('sisickdays')])} ({money(featureProps[scenarioField('sivaluesick')])})</td></tr>
          <tr><td>Change in CO₂e (t/yr)</td><td>{fmtOne(Number(featureProps[scenarioField('sico2')] ?? 0) / 1000)}</td></tr>
        {/if}
        <tr><td>{isDesire ? 'Distance (km)' : 'Fast route distance (km)'}</td><td>{fmtOne(isDesire ? featureProps.e_dist_km : featureProps.rf_dist_km)}</td></tr>
        {#if isFast}<tr><td>Hilliness (av. gradient, %)</td><td>{fmtOne(featureProps.rf_avslope_perc)}</td></tr>{/if}
      </tbody>
    </table>
  {:else if isQuiet}
    <div class="popup-heading">Quieter route</div>
    <div class="popup-subheading">{isBaseline ? `${scenarioLabel} (baseline)` : `Scenario: ${scenarioLabel}`}</div>
    <div class="popup-place">{featureProps.geo_name1} – {featureProps.geo_name2}</div>
    <table><tbody>
      <tr><td>Total commuters</td><td>{fmtInt(featureProps.all)}</td></tr>
      <tr><td>Cyclists (baseline)</td><td>{fmtInt(featureProps.bicycle)} ({pct(featureProps.bicycle, featureProps.all)}%)</td></tr>
      {#if !isBaseline}
        <tr><td>Cyclists (scenario)</td><td>{fmtInt(scenarioCyclists)} ({pct(scenarioCyclists, featureProps.all)}%)</td></tr>
      {/if}
      <tr><td>Quieter route distance (km)</td><td>{fmtOne(featureProps.rq_dist_km)}</td></tr>
      <tr><td>Distance compared with fastest route (%)</td><td>{fmtOne((Number(featureProps.dist_rq_rf ?? 0) * 100) - 100)}</td></tr>
      <tr><td>Hilliness (av. gradient, %)</td><td>{fmtOne(featureProps.rq_avslope_perc)}</td></tr>
    </tbody></table>
  {:else if isRnet}
    <div class="popup-heading">Route network segment</div>
    <div class="popup-subheading">{isBaseline ? `${scenarioLabel} (baseline)` : `Scenario: ${scenarioLabel}`}</div>
    <div class="popup-place">{appState.regionPretty} · {isSchool ? 'School travel' : 'Commuting'} · LSOA</div>
    {#if featureProps.local_id}<div class="popup-meta">Segment {featureProps.local_id}</div>{/if}
    <table><tbody>
      <tr><td>Cyclists (baseline)</td><td>{fmtInt(featureProps.bicycle)}</td></tr>
      {#if !isBaseline}
        <tr><td>Cyclists (scenario)</td><td>{fmtInt(scenarioCyclists)}</td></tr>
        <tr><td>Ratio (scenario / baseline)</td><td>{Number(featureProps.bicycle ?? 0) > 0 ? (scenarioCyclists / Number(featureProps.bicycle)).toFixed(2) : '–'}</td></tr>
      {/if}
    </tbody></table>
  {/if}
</div>

<style>
  .pct-popup { position: relative; width: 280px; max-width: 100%; color: #111; font: 13px Arial, sans-serif; line-height: 1.4; }
  .popup-close { position: absolute; top: -3px; right: -4px; width: 22px; height: 22px; border: 0; border-radius: 3px; background: transparent; color: #444; cursor: pointer; font: 22px/18px Arial, sans-serif; }
  .popup-close:hover { background: #eeeeee; color: #000; }
  .popup-heading { padding-right: 22px; font-weight: 700; color: #111; }
  .popup-subheading { color: #222; font-weight: 600; margin-bottom: 6px; }
  .popup-place { border-top: 1px solid #cccccc; padding-top: 6px; margin-bottom: 5px; font-weight: 600; }
  .popup-meta { margin: -2px 0 5px; color: #666; font-size: 11px; }
  table { width: 100%; border-collapse: collapse; table-layout: fixed; }
  td { padding: 2px 0; vertical-align: top; overflow-wrap: break-word; }
  td:first-child { width: 64%; color: #222; padding-right: 12px; }
  td:last-child { width: 36%; text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; color: #111; }
</style>
