#!/usr/bin/env sh
# Fetch region data assets from the public GitHub release into public/data/regions.
# POSIX-compatible (works in sh, dash, bash, zsh).
# Usage:
#   sh scripts/fetch_data_release.sh         # Download all 45 regions (~5.3 GB)
#   sh scripts/fetch_data_release.sh --dev   # Download overview + West Yorkshire dev bundle (~313 MB)
set -eu

REPO="${PCT_DATA_REPO:-npct/pct-svelte}"
FALLBACK_REPO="Robinlovelace/pct-svelte"
RELEASE="${PCT_DATA_RELEASE:-pct-svelte-data-v1}"
DEST="public/data/regions"
MODE="${1:-all}"
TMP_DIR="${TMPDIR:-/tmp}"

mkdir -p "$DEST"

download_asset() {
  asset_name="$1"
  tmp_file="${TMP_DIR}/${asset_name}"
  asset_url="https://github.com/${REPO}/releases/download/${RELEASE}/${asset_name}"

  echo "Downloading ${asset_name} from ${REPO}@${RELEASE}..."
  if curl -fSL --retry 3 --retry-delay 2 -o "$tmp_file" "$asset_url"; then
    :
  elif command -v gh >/dev/null 2>&1 && gh release download "$RELEASE" -R "$REPO" -p "$asset_name" -D "$TMP_DIR" --clobber; then
    :
  elif command -v gh >/dev/null 2>&1 && gh release download "$RELEASE" -R "$FALLBACK_REPO" -p "$asset_name" -D "$TMP_DIR" --clobber; then
    :
  else
    echo "ERROR: Could not download ${asset_name} from ${REPO} (release ${RELEASE})." >&2
    return 1
  fi

  echo "Extracting ${asset_name} to ${DEST}..."
  tar -xzf "$tmp_file" -C "$DEST" --strip-components=3
  rm -f "$tmp_file"
}

if [ "$MODE" = "--dev" ] || [ "$MODE" = "dev" ]; then
  download_asset pct-region-west-yorkshire.tar.gz
else
  for asset in \
    pct-region-assets.tar.gz \
    pct-region-assets-lsoa-zones.tar.gz \
    pct-region-assets-lsoa-desire.tar.gz \
    pct-region-assets-lsoa-fast.tar.gz \
    pct-region-assets-lsoa-lines-b.tar.gz; do
    download_asset "$asset"
  done
fi

echo "Region data extracted to ${DEST}"
pmtiles_count=$(find "$DEST" -name "*.pmtiles" | wc -l | tr -d ' ')
echo "PMTiles files: ${pmtiles_count}"
