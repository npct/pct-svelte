import type { AppState, BasemapId, Geography, LayerId, Purpose, Scenario, ScenarioOption } from './types';

export const SCENARIOS: ScenarioOption[] = [
  {
    id: 'base',
    name: 'Census 2011 Cycling',
    shortName: 'Census 2011',
    description: 'Baseline commuter cycling travel patterns recorded in the 2011 Census.',
    badge: 'Baseline',
    color: '#0284c7'
  },
  {
    id: 'govtarget',
    name: 'Government Target (equality)',
    shortName: 'Gov Target',
    description: 'Targeted doubling of national cycling levels focused on shorter commuting trips.',
    badge: 'Near-term',
    color: '#10b981'
  },
  {
    id: 'gendereq',
    name: 'Gender equality',
    shortName: 'Gender Eq',
    description: 'Models what cycling uptake looks like if women cycle as much as men for all trip distances.',
    badge: 'Equitable',
    color: '#ec4899'
  },
  {
    id: 'govnearmkt',
    name: 'Government Target (near market)',
    shortName: 'Gov Target (near market)',
    description: 'Targeted near-market cycling growth focused on the most feasible trips.',
    badge: 'Near-term',
    color: '#f59e0b'
  },
  {
    id: 'dutch',
    name: 'Go Dutch',
    shortName: 'Go Dutch',
    description: 'Dutch-level cycling infrastructure and cycling propensities applied to UK topography.',
    badge: 'Transformative',
    color: '#f97316'
  },
  {
    id: 'ebike',
    name: 'Ebikes',
    shortName: 'E-Bikes',
    description: 'High e-bike uptake extending cycling reach over hilly terrain and longer distances.',
    badge: 'Technology',
    color: '#8b5cf6'
  }
];

export const SCHOOL_SCENARIOS: ScenarioOption[] = [
  {
    id: 'base',
    name: 'School Census 2011',
    shortName: 'School Census',
    description: 'Baseline school travel patterns recorded in the National School Census.',
    badge: 'Baseline',
    color: '#0284c7'
  },
  {
    id: 'govtarget',
    name: 'Government Target (equality)',
    shortName: 'Gov Target',
    description: 'Targeted doubling of cycling to school focused on shorter trips.',
    badge: 'Near-term',
    color: '#10b981'
  },
  {
    id: 'cambridge',
    name: 'Go Cambridge',
    shortName: 'Go Cambridge',
    description: 'Cambridge-style cycling levels applied to school travel.',
    badge: 'Reference',
    color: '#f97316'
  },
  {
    id: 'dutch',
    name: 'Go Dutch',
    shortName: 'Go Dutch',
    description: 'Dutch-level cycling infrastructure and propensities applied to school travel.',
    badge: 'Transformative',
    color: '#8b5cf6'
  }
];

export function scenariosForPurpose(purpose: Purpose): ScenarioOption[] {
  return purpose === 'school' ? SCHOOL_SCENARIOS : SCENARIOS;
}

export const VALID_SCENARIOS: Scenario[] = ['base', 'govtarget', 'gendereq', 'govnearmkt', 'dutch', 'ebike', 'cambridge'];

export const LAYERS: { id: LayerId; name: string; description: string; color: string; sourceUrl: string; sourceLayer: string }[] = [
  {
    id: 'zones',
    name: 'Zones (MSOA Choropleth)',
    description: 'Commuter cycling mode share (% cycling of all commuters)',
    color: '#2ca25f',
    sourceUrl: '/data/zones.pmtiles',
    sourceLayer: 'zones'
  },
  {
    id: 'desire',
    name: 'Desire Lines',
    description: 'Origin-destination straight-line commuter flows',
    color: '#dd3497',
    sourceUrl: '/data/desire_lines.pmtiles',
    sourceLayer: 'desire_lines'
  },
  {
    id: 'fast',
    name: 'Fast Routes',
    description: 'Direct cycling routes along major roads',
    color: '#dc2626',
    sourceUrl: '/data/routes_fast.pmtiles',
    sourceLayer: 'routes_fast'
  },
  {
    id: 'quiet',
    name: 'Quieter Routes',
    description: 'Low-traffic and off-road alternative routes',
    color: '#2563eb',
    sourceUrl: '/data/routes_quiet.pmtiles',
    sourceLayer: 'routes_quiet'
  },
  {
    id: 'rnet',
    name: 'Route Network (RNet)',
    description: 'Aggregated cycle network potential across all routes',
    color: '#059669',
    sourceUrl: '/data/rnet.pmtiles',
    sourceLayer: 'rnet'
  }
];

export const BASEMAPS: { id: BasemapId; name: string; description: string }[] = [
  {
    id: 'positron',
    name: 'Positron',
    description: 'Light, minimal Carto base'
  },
  {
    id: 'satellite',
    name: 'Satellite',
    description: 'Esri World Imagery'
  },
  {
    id: 'cyclosm',
    name: 'CyclOSM',
    description: 'Dedicated cycle map'
  }
];

const DEFAULT_WEST_YORKSHIRE: AppState = {
  region: 'west-yorkshire',
  zoom: 10.5,
  lat: 53.79,
  lng: -1.75,
  purpose: 'commute',
  geography: 'msoa',
  scenario: 'base',
  layers: ['zones'],
  basemap: 'positron',
  n: 30
};

export class AppStateManager {
  region = $state<string>('');
  zoom = $state<number>(DEFAULT_WEST_YORKSHIRE.zoom);
  lat = $state<number>(DEFAULT_WEST_YORKSHIRE.lat);
  lng = $state<number>(DEFAULT_WEST_YORKSHIRE.lng);
  purpose = $state<Purpose>(DEFAULT_WEST_YORKSHIRE.purpose);
  geography = $state<Geography>(DEFAULT_WEST_YORKSHIRE.geography);
  scenario = $state<Scenario>(DEFAULT_WEST_YORKSHIRE.scenario);
  layers = $state<LayerId[]>([...DEFAULT_WEST_YORKSHIRE.layers]);
  basemap = $state<BasemapId>(DEFAULT_WEST_YORKSHIRE.basemap);
  n = $state<number>(DEFAULT_WEST_YORKSHIRE.n);
  
  freezeLines = $state<boolean>(false);
  freezeRevision = $state<number>(0);
  frozenLineCount = $state<number>(0);
  
  // UI state
  sidebarOpen = $state<boolean>(true);
  infoModalOpen = $state<boolean>(false);
  downloadsOpen = $state<boolean>(false);
  landingPurpose = $state<'commute' | 'school'>('commute');
  landingScenario = $state<Scenario>('base');

  public setLandingPurpose(purpose: 'commute' | 'school') {
    this.landingPurpose = purpose;
    const valid = scenariosForPurpose(purpose).map((s) => s.id);
    if (!valid.includes(this.landingScenario)) this.landingScenario = 'base';
  }

  public setLandingScenario(scenario: Scenario) {
    this.landingScenario = scenario;
  }

  /**
   * Navigate to a region from the landing page, carrying over the user's
   * chosen landing purpose + scenario so the dashboard opens in the view
   * they were exploring (codex idea #1). Falls back to commute-only when
   * the region's manifest shows no lines/routes data for the purpose.
   */
  public openRegionFromLanding(slug: string) {
    const capabilities = this.regionDataManifest[slug] ?? {};
    const hasLines = Boolean(capabilities.desire_lines || capabilities.routes_fast);
    const purpose = hasLines ? this.landingPurpose : 'commute';
    let scenario = this.landingScenario;
    const valid = scenariosForPurpose(purpose).map((s) => s.id as Scenario);
    if (!valid.includes(scenario)) scenario = 'base';
    const geography: Geography = purpose === 'school' ? 'lsoa' : 'msoa';
    window.location.hash = `?r=${slug}&purpose=${purpose}&scenario=${scenario}&geography=${geography}&layers=zones`;
  }

  // Region metadata (loaded from the data release): pretty names + fit views
  regionDefaults = $state<Record<string, { pretty: string; centre: [number, number]; zoom: number }>>({});
  regionDefaultsLoaded = $state(false);
  // Per-region dataset availability from the data release manifest:
  // { "<slug>": { desire_lines: true, routes_fast: true, rnet: true, school_zones: true, ... } }
  regionDataManifest = $state<Record<string, Record<string, boolean>>>({});
  private manifestLoaded = false;

  private debounceTimer: number | null = null;
  private isUpdatingFromUrl = false;

  constructor() {
    if (typeof window !== 'undefined') {
      this.loadRegionDefaults();
      this.initFromUrl();
      window.addEventListener('hashchange', () => this.handleHashChange());
      window.addEventListener('popstate', () => this.handleHashChange());
    }
  }

  get hasRegion(): boolean {
    return this.region.length > 0;
  }

  get regionPretty(): string {
    return this.regionDefaults[this.region]?.pretty ?? this.region.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  }

  private async loadRegionDefaults() {
    try {
      const response = await fetch('/data/regions/region_defaults.json');
      if (!response.ok) return;
      const raw = (await response.json()) as
        | Record<string, { pretty: string; centre: [number, number]; zoom: number }>
        | Array<{ slug: string; pretty: string; centre: [number, number]; zoom: number }>;
      const record: Record<string, { pretty: string; centre: [number, number]; zoom: number }> =
        Array.isArray(raw) ? Object.fromEntries(raw.map((r) => [r.slug, r])) : raw;
      this.regionDefaults = record;
      this.regionDefaultsLoaded = true;
      // If a region is already active, snap to its fitted view once defaults arrive.
      if (this.region && this.regionDefaults[this.region]) {
        const d = this.regionDefaults[this.region];
        this.lat = d.centre[0];
        this.lng = d.centre[1];
        this.zoom = d.zoom;
      }
    } catch {
      // Landing still works without region defaults (choropleth is in the tiles).
    }
    if (!this.manifestLoaded) {
      this.manifestLoaded = true;
      try {
        const response = await fetch('/data/regions/data_manifest.json');
        if (response.ok) {
          this.regionDataManifest = (await response.json()) as Record<string, Record<string, boolean>>;
        }
      } catch {
        // Without a manifest every region behaves like zones-only.
      }
    }
  }

  /** Whether the active region ships a given dataset.
   *  No manifest (older release) => assume full availability for compatibility. */
  public hasRegionData(dataset: string): boolean {
    const entry = this.regionDataManifest[this.region];
    if (!entry) return !this.manifestHasAnyEntry;
    return Boolean(entry[dataset]);
  }

  private get manifestHasAnyEntry(): boolean {
    return Object.keys(this.regionDataManifest).length > 0;
  }

  public setRegion(region: string) {
    if (this.region === region) return;
    this.region = region;
    this.setFreezeLines(false);
    // Back to the landing page (empty region): reset the URL so the next
    // visit starts clean instead of re-opening the previous region.
    if (!region && typeof window !== 'undefined') {
      window.history.replaceState(null, '', window.location.pathname);
      return;
    }
    // Reset to what the region's data actually supports (manifest from the release).
    const capabilities = this.regionDataManifest[region] ?? {};
    if (!capabilities.desire_lines && !capabilities.routes_fast) {
      this.purpose = 'commute';
      this.geography = 'msoa';
      if (this.scenario === 'cambridge') this.scenario = 'base';
      this.layers = ['zones'];
    }
    if (region && this.regionDefaults[region]) {
      const d = this.regionDefaults[region];
      this.lat = d.centre[0];
      this.lng = d.centre[1];
      this.zoom = d.zoom;
    } else if (region === DEFAULT_WEST_YORKSHIRE.region) {
      this.lat = DEFAULT_WEST_YORKSHIRE.lat;
      this.lng = DEFAULT_WEST_YORKSHIRE.lng;
      this.zoom = DEFAULT_WEST_YORKSHIRE.zoom;
    }
    this.syncToUrl();
  }

  private initFromUrl() {
    this.isUpdatingFromUrl = true;
    try {
      // 1. Check legacy query string (?r=west-yorkshire as pct.bike uses)
      const searchParams = new URLSearchParams(window.location.search);
      const legacyRegion = searchParams.get('r');
      if (legacyRegion) {
        this.region = legacyRegion;
        if (legacyRegion === 'west-yorkshire') {
          this.lat = DEFAULT_WEST_YORKSHIRE.lat;
          this.lng = DEFAULT_WEST_YORKSHIRE.lng;
          this.zoom = DEFAULT_WEST_YORKSHIRE.zoom;
        }
      }

      // 2. Check hash params: #r=west-yorkshire&z=10.5&lat=53.79&lng=-1.75&scenario=dutch&layers=zones,desire,rnet&basemap=positron&n=30
      const hash = window.location.hash.startsWith('#') ? window.location.hash.slice(1) : window.location.hash;
      if (hash) {
        const hashParams = new URLSearchParams(hash);
        
        if (hashParams.has('r')) {
          this.region = hashParams.get('r')!;
        }
        if (hashParams.has('z')) {
          const parsedZ = parseFloat(hashParams.get('z')!);
          if (!isNaN(parsedZ)) this.zoom = parsedZ;
        }
        if (hashParams.has('lat')) {
          const parsedLat = parseFloat(hashParams.get('lat')!);
          if (!isNaN(parsedLat)) this.lat = parsedLat;
        }
        if (hashParams.has('lng')) {
          const parsedLng = parseFloat(hashParams.get('lng')!);
          if (!isNaN(parsedLng)) this.lng = parsedLng;
        }
        if (hashParams.has('purpose')) {
          const p = hashParams.get('purpose') as Purpose;
          if (p === 'commute' || p === 'school') this.purpose = p;
        }
        if (hashParams.has('geography')) {
          const g = hashParams.get('geography') as Geography;
          if (g === 'msoa' || g === 'lsoa') this.geography = g;
        }
        // School travel is only published at LSOA level, mirroring pct-shiny.
        if (this.purpose === 'school') this.geography = 'lsoa';
        if (hashParams.has('scenario')) {
          const s = hashParams.get('scenario') as Scenario;
          if (VALID_SCENARIOS.includes(s)) {
            this.scenario = s;
          }
        }
        if (hashParams.has('layers')) {
          const rawLayers = hashParams.get('layers')!.split(',').map(l => l.trim().toLowerCase());
          const validLayers: LayerId[] = [];
          
          for (const l of rawLayers) {
            if (l === 'zones' || l === 'zone') validLayers.push('zones');
            else if (l === 'desire' || l === 'desire_lines' || l === 'lines' || l === 'l') validLayers.push('desire');
            else if (l === 'fast' || l === 'routes_fast' || l === 'rf') validLayers.push('fast');
            else if (l === 'quiet' || l === 'routes_quiet' || l === 'rq') validLayers.push('quiet');
            else if (l === 'rnet' || l === 'network' || l === 'route_network') validLayers.push('rnet');
            else if (l === 'destinations' || l === 'schools' || l === 'd') validLayers.push('destinations');
          }
          if (validLayers.length > 0) {
            this.layers = validLayers;
          }
        }
        if (hashParams.has('basemap')) {
          const b = hashParams.get('basemap') as BasemapId;
          if (['positron', 'satellite', 'cyclosm'].includes(b)) {
            this.basemap = b;
          }
        }
        if (hashParams.has('n')) {
          const parsedN = parseInt(hashParams.get('n')!, 10);
          if (!isNaN(parsedN) && parsedN >= 10 && parsedN <= 100) {
            this.n = parsedN;
          }
        }
      }
    } finally {
      this.isUpdatingFromUrl = false;
      this.syncToUrl();
    }
  }

  private handleHashChange() {
    this.initFromUrl();
  }

  public syncToUrl() {
    if (this.isUpdatingFromUrl || typeof window === 'undefined') return;

    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = window.setTimeout(() => {
      const params = new URLSearchParams();
      if (this.region) params.set('r', this.region);
      params.set('z', Number(this.zoom.toFixed(2)).toString());
      params.set('lat', Number(this.lat.toFixed(4)).toString());
      params.set('lng', Number(this.lng.toFixed(4)).toString());
      params.set('purpose', this.purpose);
      params.set('geography', this.geography);
      params.set('scenario', this.scenario);
      params.set('layers', this.layers.join(','));
      params.set('basemap', this.basemap);
      params.set('n', this.n.toString());

      // Canonical form is always <pathname>#<state>: a legacy ?r=… query is
      // consumed on entry and must not linger alongside the hash.
      const newUrl = `${window.location.pathname}#${params.toString()}`;
      if (window.location.href !== newUrl) {
        window.history.replaceState(null, '', newUrl);
      }
    }, 150);
  }

  public setPosition(lat: number, lng: number, zoom: number) {
    this.lat = lat;
    this.lng = lng;
    this.zoom = zoom;
    this.syncToUrl();
  }

  public setScenario(scenario: Scenario) {
    this.scenario = scenario;
    this.syncToUrl();
  }

  public setPurpose(purpose: Purpose) {
    if (this.purpose === purpose) return;
    this.purpose = purpose;
    // School travel is only available at LSOA level (mirrors pct-shiny).
    if (purpose === 'school') this.geography = 'lsoa';
    // Scenarios that do not exist for the new purpose fall back to baseline.
    const valid = scenariosForPurpose(purpose).map((s) => s.id);
    if (!valid.includes(this.scenario)) this.scenario = 'base';
    // Layers that do not exist for the new purpose are removed.
    const allowed: LayerId[] = purpose === 'school'
      ? ['zones', 'rnet', 'destinations']
      : ['zones', 'desire', 'fast', 'quiet', 'rnet'];
    this.layers = this.layers.filter((layer) => allowed.includes(layer));
    this.setFreezeLines(false);
    this.syncToUrl();
  }

  public setGeography(geography: Geography) {
    if (this.purpose === 'school' && geography !== 'lsoa') return;
    if (this.geography === geography) return;
    this.geography = geography;
    this.setFreezeLines(false);
    this.syncToUrl();
  }

  public setBasemap(basemap: BasemapId) {
    this.basemap = basemap;
    this.syncToUrl();
  }

  public setN(n: number) {
    this.n = Math.max(10, Math.min(100, n));
    this.syncToUrl();
  }

  public setFreezeLines(freeze: boolean) {
    this.freezeLines = freeze;
    if (freeze) this.freezeRevision += 1;
    else this.frozenLineCount = 0;
  }

  public refreshFrozenLines() {
    if (this.freezeLines) this.freezeRevision += 1;
  }

  public setLayers(layers: LayerId[]) {
    this.layers = layers;
    this.syncToUrl();
  }

  public toggleLayer(id: LayerId) {
    if (this.layers.includes(id)) {
      this.layers = this.layers.filter(l => l !== id);
    } else {
      this.layers = [...this.layers, id];
    }
    this.syncToUrl();
  }

  public isLayerActive(id: LayerId): boolean {
    return this.layers.includes(id);
  }

  public toggleSidebar() {
    this.sidebarOpen = !this.sidebarOpen;
  }

  public resetToWestYorkshire() {
    this.lat = DEFAULT_WEST_YORKSHIRE.lat;
    this.lng = DEFAULT_WEST_YORKSHIRE.lng;
    this.zoom = DEFAULT_WEST_YORKSHIRE.zoom;
    this.syncToUrl();
  }
}

export const appState = new AppStateManager();
