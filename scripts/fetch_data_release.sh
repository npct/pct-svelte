#!/usr/bin/env bash
# Fetch region data assets from the GitHub release into public/data/regions.
# Used by CI (Netlify) so large datasets never live in git history.
# Requires GITHUB_TOKEN (or a fine-grained token with repo read) for private repos.
set -euo pipefail

REPO="Robinlovelace/pct-svelte"
RELEASE="pct-svelte-data-v1"
DEST="public/data/regions"

mkdir -p "$DEST"

if [[ -n "${GITHUB_TOKEN:-}" ]]; then
  AUTH=(-H "Authorization: Bearer $GITHUB_TOKEN")
else
  AUTH=()
fi

URL="https://api.github.com/repos/${REPO}/releases/tags/${RELEASE}"

download_asset() {
  local asset_name="$1"
  local asset_url
  asset_url=$(curl -sL "${AUTH[@]}" "$URL" | python3 -c "import json,sys; d=json.load(sys.stdin); a=[x for x in d.get('assets',[]) if x['name']=='${asset_name}']; print(a[0]['browser_download_url'] if a else '')")
  if [[ -z "$asset_url" ]]; then
    echo "WARN: ${asset_name} not found in release ${RELEASE}; skipping" >&2
    return 0
  fi
  echo "Downloading ${asset_url}"
  curl -sL "${AUTH[@]}" -o "/tmp/${asset_name}" "$asset_url"
  tar -xzf "/tmp/${asset_name}" -C "$DEST" --strip-components=2
}

download_asset pct-region-assets.tar.gz
for asset in \
  pct-region-assets-lsoa-zones.tar.gz \
  pct-region-assets-lsoa-desire.tar.gz \
  pct-region-assets-lsoa-fast.tar.gz \
  pct-region-assets-lsoa-lines-b.tar.gz; do
  download_asset "$asset"
done
echo "Region data extracted to ${DEST}"
find "$DEST" -name "*.pmtiles" | wc -l | xargs echo "PMTiles files:"
