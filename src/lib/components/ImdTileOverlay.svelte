<script lang="ts">
  import type * as maplibregl from 'maplibre-gl';

  let { map }: { map: maplibregl.Map | undefined } = $props();

  interface TileCoord {
    key: string;
    z: number;
    x: number;
    y: number;
    left: number;
    top: number;
    size: number;
  }

  let tiles = $state<TileCoord[]>([]);

  function lon2tile(lon: number, z: number) {
    return ((lon + 180) / 360) * Math.pow(2, z);
  }

  function lat2tile(lat: number, z: number) {
    const rad = (lat * Math.PI) / 180;
    return ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * Math.pow(2, z);
  }

  function updateTiles() {
    if (!map) {
      tiles = [];
      return;
    }
    const canvas = map.getCanvas();
    const width = canvas.clientWidth || canvas.width;
    const height = canvas.clientHeight || canvas.height;
    const rawZoom = map.getZoom();
    const z = Math.max(6, Math.min(14, Math.round(rawZoom)));
    const scale = Math.pow(2, rawZoom - z);
    const tileSize = 256 * scale;

    const center = map.getCenter();
    const centerTileX = lon2tile(center.lng, z);
    const centerTileY = lat2tile(center.lat, z);

    const halfCols = Math.ceil(width / tileSize / 2) + 1;
    const halfRows = Math.ceil(height / tileSize / 2) + 1;
    const minX = Math.floor(centerTileX) - halfCols;
    const maxX = Math.floor(centerTileX) + halfCols;
    const minY = Math.floor(centerTileY) - halfRows;
    const maxY = Math.floor(centerTileY) + halfRows;
    const maxTileIndex = (1 << z) - 1;

    const next: TileCoord[] = [];
    for (let x = minX; x <= maxX; x++) {
      if (x < 0 || x > maxTileIndex) continue;
      for (let y = minY; y <= maxY; y++) {
        if (y < 0 || y > maxTileIndex) continue;
        const left = width / 2 + (x - centerTileX) * tileSize;
        const top = height / 2 + (y - centerTileY) * tileSize;
        next.push({
          key: `${z}/${x}/${y}`,
          z,
          x,
          y,
          left,
          top,
          size: tileSize
        });
      }
    }
    tiles = next;
  }

  $effect(() => {
    const m = map;
    if (!m) return;
    updateTiles();
    m.on('move', updateTiles);
    m.on('zoom', updateTiles);
    m.on('resize', updateTiles);
    return () => {
      m.off('move', updateTiles);
      m.off('zoom', updateTiles);
      m.off('resize', updateTiles);
    };
  });
</script>

<div class="pointer-events-none absolute inset-0 overflow-hidden bg-[#e5e7eb]" aria-hidden="true">
  {#each tiles as t (t.key)}
    <img
      src="https://maps.cdrc.ac.uk/tiles/imd2015_eng/{t.z}/{t.x}/{t.y}.png"
      alt=""
      class=" absolute max-w-none select-none opacity-65"
      style="left: {t.left}px; top: {t.top}px; width: {t.size + 0.5}px; height: {t.size + 0.5}px;"
    />
    <img
      src="https://maps.cdrc.ac.uk/tiles/shine_urbanmask_dark/{t.z}/{t.x}/{t.y}.png"
      alt=""
      class="absolute max-w-none select-none opacity-45"
      style="left: {t.left}px; top: {t.top}px; width: {t.size + 0.5}px; height: {t.size + 0.5}px;"
    />
  {/each}
</div>
