#!/usr/bin/env bash
# Prepare the PCT West Yorkshire MapLibre data bundle.
#
# Prerequisites: curl, ogr2ogr, sqlite3, tippecanoe and a PMTiles CLI.
# The script downloads a pinned PMTiles CLI to /tmp when one is not on PATH.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DATA_DIR="$REPO_ROOT/public/data"
WORK_DIR="$REPO_ROOT/.data-work"
SOURCE_DIR="${PCT_SOURCE_DIR:-/tmp}"
TIPPECANOE_BIN="${TIPPECANOE_BIN:-}"
PMTILES_BIN="${PMTILES_BIN:-}"

REGIONAL_URL="https://media.githubusercontent.com/media/npct/pct-outputs-regional-notR/master/commute/msoa/west-yorkshire"
SCHOOL_REGIONAL_URL="https://media.githubusercontent.com/media/npct/pct-outputs-regional-notR/master/school/lsoa/west-yorkshire"
RNET_URL="https://media.githubusercontent.com/media/npct/pct-outputs-national/commute/msoa/rnet.geojson"
# The historic national URL above is retained as the first choice specified by
# the data contract.  The current upstream repository no longer serves it, so
# use the equivalent West Yorkshire full-network LFS asset as a fallback.
RNET_FALLBACK_URL="https://media.githubusercontent.com/media/npct/pct-outputs-regional-notR/master/commute/lsoa/west-yorkshire/rnet_full.geojson"
PMTILES_VERSION="1.31.2"

SCENARIO_FIELDS="dutch_slc,dutch_sid,dutch_siyll,dutch_sivalueyll,dutch_sisickdays,dutch_sivaluesick,dutch_sico2,govtarget_slc,govtarget_sid,govtarget_siyll,govtarget_sivalueyll,govtarget_sisickdays,govtarget_sivaluesick,govtarget_sico2,gendereq_slc,gendereq_sid,gendereq_siyll,gendereq_sivalueyll,gendereq_sisickdays,gendereq_sivaluesick,gendereq_sico2,ebike_slc,ebike_sid,ebike_siyll,ebike_sivalueyll,ebike_sisickdays,ebike_sivaluesick,ebike_sico2,govnearmkt_slc,govnearmkt_sid,govnearmkt_siyll,govnearmkt_sivalueyll,govnearmkt_sisickdays,govnearmkt_sivaluesick,govnearmkt_sico2"
# Preserve the fields pct-shiny's zone/straight-line/route popup functions expose.
POPUP_METRICS="car_driver,$SCENARIO_FIELDS"
ZONE_FIELDS="geo_code,geo_name,lad_name,all,bicycle,$POPUP_METRICS"
DESIRE_FIELDS="id,geo_code1,geo_code2,geo_name1,geo_name2,all,bicycle,$POPUP_METRICS,e_dist_km"
ROUTE_FIELDS="id,geo_code1,geo_code2,geo_name1,geo_name2,all,bicycle,$POPUP_METRICS,rf_dist_km,rf_avslope_perc,rq_dist_km,rq_avslope_perc,dist_rq_rf"
SCHOOL_SCENARIO_FIELDS="govtarget_slc,govtarget_sic,govtarget_sid,govtarget_simmet,govtarget_sico2,cambridge_slc,cambridge_sic,cambridge_sid,cambridge_simmet,cambridge_sico2,dutch_slc,dutch_sic,dutch_sid,dutch_simmet,dutch_sico2"
SCHOOL_ZONE_FIELDS="geo_code,geo_name,lad_name,all,bicycle,car,baseline_at_mmet,$SCHOOL_SCENARIO_FIELDS"
SCHOOL_DESTINATION_FIELDS="urn,schoolname,phase,all,bicycle,car,govtarget_slc,govtarget_sic,govtarget_sid,govtarget_sico2,cambridge_slc,cambridge_sic,cambridge_sid,cambridge_sico2,dutch_slc,dutch_sic,dutch_sid,dutch_sico2"

mkdir -p "$DATA_DIR" "$SOURCE_DIR"

download_if_missing() {
  local url="$1" destination="$2"
  if [[ ! -s "$destination" ]]; then
    echo "Downloading $(basename "$destination")"
    curl --fail --location --retry 3 --output "$destination" "$url"
  fi
}

download_rnet() {
  local destination="$1"
  if [[ -s "$destination" ]]; then
    return
  fi
  echo "Downloading pct_rnet.geojson"
  if ! curl --fail --location --retry 3 --output "$destination" "$RNET_URL"; then
    rm -f "$destination"
    echo "National rnet URL is unavailable; using West Yorkshire full-network fallback" >&2
    curl --fail --location --retry 3 --output "$destination" "$RNET_FALLBACK_URL"
  fi
}

find_tippecanoe() {
  if [[ -n "$TIPPECANOE_BIN" && -x "$TIPPECANOE_BIN" ]]; then
    return
  fi
  if command -v tippecanoe >/dev/null 2>&1; then
    TIPPECANOE_BIN="$(command -v tippecanoe)"
  elif [[ -x /home/robin/bin/tippecanoe ]]; then
    TIPPECANOE_BIN=/home/robin/bin/tippecanoe
  else
    echo "tippecanoe was not found; set TIPPECANOE_BIN or add it to PATH." >&2
    exit 1
  fi
}

find_pmtiles() {
  if [[ -n "$PMTILES_BIN" && -x "$PMTILES_BIN" ]]; then
    return
  fi
  if command -v pmtiles >/dev/null 2>&1; then
    PMTILES_BIN="$(command -v pmtiles)"
    return
  fi

  # The npm `pmtiles` package is a browser decoder and does not expose a CLI.
  # Use the pinned upstream PMTiles CLI so a clean Netlify build can convert.
  local machine archive cli_dir
  machine="$(uname -m)"
  case "$machine" in
    x86_64) archive="go-pmtiles_${PMTILES_VERSION}_Linux_x86_64.tar.gz" ;;
    aarch64|arm64) archive="go-pmtiles_${PMTILES_VERSION}_Linux_arm64.tar.gz" ;;
    *) echo "Unsupported architecture for PMTiles CLI: $machine" >&2; exit 1 ;;
  esac
  cli_dir="/tmp/pct-pmtiles-${PMTILES_VERSION}-${machine}"
  if [[ ! -x "$cli_dir/pmtiles" ]]; then
    mkdir -p "$cli_dir"
    curl --fail --location --retry 3 \
      --output "$cli_dir/$archive" \
      "https://github.com/protomaps/go-pmtiles/releases/download/v${PMTILES_VERSION}/$archive"
    tar -xzf "$cli_dir/$archive" -C "$cli_dir"
  fi
  PMTILES_BIN="$cli_dir/pmtiles"
}

tile_count() {
  sqlite3 "$1" 'SELECT count(*) FROM tiles;'
}

tile_zoom_range() {
  sqlite3 "$1" 'SELECT min(zoom_level) || "-" || max(zoom_level) FROM tiles;'
}

feature_count() {
  # GeoJSONSeq has one complete feature per line, unlike the other GeoJSON files.
  local input="$1"
  if [[ "$input" == *.geojsonseq ]]; then
    wc -l < "$input" | tr -d ' '
  else
    local layer
    layer="$(ogrinfo "$input" 2>/dev/null | awk '/^[0-9]+: / { sub(/^[0-9]+: /, ""); sub(/ .*/, ""); print; exit }')"
    ogrinfo -so "$input" "$layer" 2>/dev/null | awk -F': ' '/Feature Count/ { print $2; exit }'
  fi
}

layer_name() {
  ogrinfo "$1" 2>/dev/null | awk '/^[0-9]+: / { sub(/^[0-9]+: /, ""); sub(/ .*/, ""); print; exit }'
}

# Use ogrinfo's schema rather than assuming every upstream revision carries
# every school metric. This keeps ogr2ogr -select valid while retaining all of
# the requested popup metrics that are present in the download.
existing_fields() {
  local input="$1" requested="$2" layer schema field selected=""
  layer="$(layer_name "$input")"
  schema="$(ogrinfo -so "$input" "$layer" 2>/dev/null)"
  IFS=, read -r -a fields <<< "$requested"
  for field in "${fields[@]}"; do
    if awk -v field="$field" '$0 ~ "^" field ": " { found=1 } END { exit !found }' <<< "$schema"; then
      selected+="${selected:+,}$field"
    else
      echo "School source lacks $field; omitting it from the tile fields" >&2
    fi
  done
  [[ -n "$selected" ]] || { echo "No requested fields found in $input" >&2; exit 1; }
  printf '%s\n' "$selected"
}

round_rnet() {
  local source="$1" work="$2"
  ogr2ogr -f GeoJSONSeq -spat -2.0 53.5 -1.2 54.05 -lco COORDINATE_PRECISION=6 \
    "$work/rnet-clipped.geojsonseq" "$source"
  python3 - "$work/rnet-clipped.geojsonseq" "$work/rnet-rounded.geojsonseq" <<'PY'
import json
import sys

source, destination = sys.argv[1:]

def round_floats(value):
    if isinstance(value, float):
        return round(value, 6)
    if isinstance(value, dict):
        return {key: round_floats(item) for key, item in value.items()}
    if isinstance(value, list):
        return [round_floats(item) for item in value]
    return value

with open(source, encoding="utf-8") as reader, open(destination, "w", encoding="utf-8") as writer:
    for line in reader:
        feature = json.loads(line)
        feature["properties"] = round_floats(feature.get("properties") or {})
        writer.write(json.dumps(feature, separators=(",", ":"), allow_nan=False) + "\n")
PY
}

join_quiet_routes() {
  local lines="$1" routes="$2" output="$3"
  python3 - "$lines" "$routes" "$output" "$ROUTE_FIELDS" <<'PY'
import json
import sys

lines_path, routes_path, output_path, fields_csv = sys.argv[1:]
fields = fields_csv.split(",")
decoder = json.JSONDecoder()

def features(path):
    """Yield GeoJSON features without materialising a whole collection."""
    with open(path, encoding="utf-8") as stream:
        buffer = ""
        started = False
        finished = False
        while not finished:
            chunk = stream.read(1024 * 1024)
            if not chunk and not buffer:
                break
            buffer += chunk
            if not started:
                marker = buffer.find('"features"')
                if marker < 0:
                    if len(buffer) > 1024 * 1024:
                        buffer = buffer[-1024 * 1024:]
                    if not chunk:
                        raise ValueError(f"No features array in {path}")
                    continue
                bracket = buffer.find("[", marker)
                if bracket < 0:
                    continue
                buffer = buffer[bracket + 1:]
                started = True
            while started:
                buffer = buffer.lstrip(" \t\r\n,")
                if buffer.startswith("]"):
                    finished = True
                    break
                if not buffer:
                    break
                try:
                    feature, index = decoder.raw_decode(buffer)
                except json.JSONDecodeError:
                    break
                yield feature
                buffer = buffer[index:]
            if not chunk and not finished:
                raise ValueError(f"Unexpected end of GeoJSON in {path}")

def round_floats(value):
    if isinstance(value, float):
        return round(value, 6)
    if isinstance(value, dict):
        return {key: round_floats(item) for key, item in value.items()}
    if isinstance(value, list):
        return [round_floats(item) for item in value]
    return value

attributes = {}
for feature in features(lines_path):
    properties = feature.get("properties") or {}
    identifier = properties.get("id")
    if identifier is not None:
        attributes[identifier] = {field: properties.get(field) for field in fields}

written = 0
with open(output_path, "w", encoding="utf-8") as output:
    output.write('{"type":"FeatureCollection","features":[\n')
    for feature in features(routes_path):
        route_properties = feature.get("properties") or {}
        identifier = route_properties.get("id")
        if identifier not in attributes:
            raise ValueError(f"No desire-line attributes for quiet route {identifier!r}")
        feature["properties"] = attributes[identifier]
        if written:
            output.write(",\n")
        output.write(json.dumps(round_floats(feature), separators=(",", ":"), allow_nan=False))
        written += 1
    output.write('\n]}\n')
PY
}

convert_verify_and_record() {
  local mbtiles="$1" pmtiles="$2" input="$3"
  local count
  count="$(tile_count "$mbtiles")"
  [[ "$count" -gt 0 ]] || { echo "$(basename "$mbtiles") contains no tiles" >&2; exit 1; }
  "$PMTILES_BIN" convert "$mbtiles" "$pmtiles"
  "$PMTILES_BIN" verify "$pmtiles"
  printf '%s\t%s\t%s\t%s\t%s\n' "${pmtiles#"$DATA_DIR/"}" \
    "$(stat -c%s "$pmtiles")" "$(feature_count "$input")" "$count" \
    "$(tile_zoom_range "$mbtiles")" >> "$SUMMARY_FILE"
}

record_geojson() {
  local output="$1"
  printf '%s\t%s\t%s\t%s\t%s\n' "${output#"$DATA_DIR/"}" \
    "$(stat -c%s "$output")" "$(feature_count "$output")" '-' '-' >> "$SUMMARY_FILE"
}

download_commute_sources() {
  local geography="$1" source url
  source="$SOURCE_DIR/pct-commute-$geography"
  url="https://media.githubusercontent.com/media/npct/pct-outputs-regional-notR/master/commute/$geography/west-yorkshire"
  mkdir -p "$source"
  download_if_missing "$url/z.geojson" "$source/z.geojson"
  download_if_missing "$url/l.geojson" "$source/l.geojson"
  download_if_missing "$url/rf.geojson" "$source/rf.geojson"
  download_if_missing "$url/rq.geojson" "$source/rq.geojson"
  download_if_missing "$url/z_attributes.csv" "$source/z_attributes.csv"
  download_if_missing "$url/od_attributes.csv" "$source/od_attributes.csv"
  # The regional LSOA full network is also the established commute MSOA fallback.
  download_if_missing "$RNET_FALLBACK_URL" "$source/rnet_full.geojson"
}

download_school_sources() {
  local source="$SOURCE_DIR/pct-school-lsoa"
  mkdir -p "$source"
  download_if_missing "$SCHOOL_REGIONAL_URL/z.geojson" "$source/z.geojson"
  download_if_missing "$SCHOOL_REGIONAL_URL/z_attributes.csv" "$source/z_attributes.csv"
  download_if_missing "$SCHOOL_REGIONAL_URL/d.geojson" "$source/d.geojson"
  download_if_missing "$SCHOOL_REGIONAL_URL/d_attributes.csv" "$source/d_attributes.csv"
  download_if_missing "$SCHOOL_REGIONAL_URL/rnet_full.geojson" "$source/rnet_full.geojson"
}

build_commute_dataset() {
  local geography="$1" source destination work
  source="$SOURCE_DIR/pct-commute-$geography"
  destination="$DATA_DIR/commute/$geography"
  work="$WORK_DIR/commute-$geography"
  mkdir -p "$destination" "$work"

  echo "Creating reduced commute $geography GeoJSON inputs"
  ogr2ogr -f GeoJSON -select "$ZONE_FIELDS" -simplify 0.0001 \
    -lco COORDINATE_PRECISION=6 "$destination/zones.geojson" "$source/z.geojson"
  ogr2ogr -f GeoJSON -select "$DESIRE_FIELDS" -lco COORDINATE_PRECISION=6 \
    "$work/desire_lines.geojson" "$source/l.geojson"
  ogr2ogr -f GeoJSON -select "$ROUTE_FIELDS" -lco COORDINATE_PRECISION=6 \
    "$work/routes_fast.geojson" "$source/rf.geojson"
  join_quiet_routes "$source/l.geojson" "$source/rq.geojson" "$work/routes_quiet.geojson"
  round_rnet "$source/rnet_full.geojson" "$work"

  echo "Building commute $geography MBTiles"
  "$TIPPECANOE_BIN" -o "$work/zones.mbtiles" -l zones -Z 7 -z 12 \
    --drop-densest-as-needed --no-tile-size-limit --no-feature-limit --force "$destination/zones.geojson"
  "$TIPPECANOE_BIN" -o "$work/desire_lines.mbtiles" -l desire_lines -Z 8 -z 12 \
    --drop-densest-as-needed --no-tile-size-limit --no-feature-limit --force "$work/desire_lines.geojson"
  "$TIPPECANOE_BIN" -o "$work/routes_fast.mbtiles" -l routes_fast -Z 8 -z 13 \
    --drop-densest-as-needed --no-tile-size-limit --no-feature-limit --force "$work/routes_fast.geojson"
  "$TIPPECANOE_BIN" -o "$work/routes_quiet.mbtiles" -l routes_quiet -Z 8 -z 13 \
    --drop-densest-as-needed --no-tile-size-limit --no-feature-limit --force "$work/routes_quiet.geojson"
  "$TIPPECANOE_BIN" -o "$work/rnet.mbtiles" -l rnet -Z 6 -z 12 \
    --drop-densest-as-needed --no-tile-size-limit --no-feature-limit --force "$work/rnet-rounded.geojsonseq"

  echo "Verifying commute $geography PMTiles"
  convert_verify_and_record "$work/zones.mbtiles" "$destination/zones.pmtiles" "$destination/zones.geojson"
  convert_verify_and_record "$work/desire_lines.mbtiles" "$destination/desire_lines.pmtiles" "$work/desire_lines.geojson"
  convert_verify_and_record "$work/routes_fast.mbtiles" "$destination/routes_fast.pmtiles" "$work/routes_fast.geojson"
  convert_verify_and_record "$work/routes_quiet.mbtiles" "$destination/routes_quiet.pmtiles" "$work/routes_quiet.geojson"
  convert_verify_and_record "$work/rnet.mbtiles" "$destination/rnet.pmtiles" "$work/rnet-rounded.geojsonseq"
  record_geojson "$destination/zones.geojson"
}

build_school_dataset() {
  local source="$SOURCE_DIR/pct-school-lsoa" destination="$DATA_DIR/school/lsoa" work="$WORK_DIR/school-lsoa"
  local zone_fields destination_fields
  mkdir -p "$destination" "$work"
  zone_fields="$(existing_fields "$source/z.geojson" "$SCHOOL_ZONE_FIELDS")"
  destination_fields="$(existing_fields "$source/d.geojson" "$SCHOOL_DESTINATION_FIELDS")"

  echo "Creating reduced school LSOA GeoJSON inputs"
  ogr2ogr -f GeoJSON -select "$zone_fields" -simplify 0.0001 \
    -lco COORDINATE_PRECISION=6 "$work/school_zones.geojson" "$source/z.geojson"
  ogr2ogr -f GeoJSON -select "$destination_fields" -lco COORDINATE_PRECISION=6 \
    "$work/school_destinations.geojson" "$source/d.geojson"
  round_rnet "$source/rnet_full.geojson" "$work"

  echo "Building school LSOA MBTiles"
  "$TIPPECANOE_BIN" -o "$work/school_zones.mbtiles" -l zones -Z 7 -z 12 \
    --drop-densest-as-needed --no-tile-size-limit --no-feature-limit --force "$work/school_zones.geojson"
  "$TIPPECANOE_BIN" -o "$work/school_destinations.mbtiles" -l destinations -Z 7 -z 13 \
    --drop-densest-as-needed --no-tile-size-limit --no-feature-limit --force "$work/school_destinations.geojson"
  "$TIPPECANOE_BIN" -o "$work/school_rnet.mbtiles" -l rnet -Z 6 -z 12 \
    --drop-densest-as-needed --no-tile-size-limit --no-feature-limit --force "$work/rnet-rounded.geojsonseq"

  echo "Verifying school LSOA PMTiles"
  convert_verify_and_record "$work/school_zones.mbtiles" "$destination/school_zones.pmtiles" "$work/school_zones.geojson"
  convert_verify_and_record "$work/school_destinations.mbtiles" "$destination/school_destinations.pmtiles" "$work/school_destinations.geojson"
  convert_verify_and_record "$work/school_rnet.mbtiles" "$destination/school_rnet.pmtiles" "$work/rnet-rounded.geojsonseq"
}

find_tippecanoe
find_pmtiles

rm -rf "$WORK_DIR"
mkdir -p "$WORK_DIR"
trap 'rm -rf "$WORK_DIR"' EXIT

# The source downloads are cached by dataset so the MSOA, LSOA and school
# builds can be repeated independently without files with the same names
# overwriting one another in /tmp.
download_commute_sources msoa
download_commute_sources lsoa
download_school_sources

# The new bundle is namespaced by trip purpose and geography. Keep the legacy
# threshold configuration, but remove only the generated top-level artifacts.
rm -f "$DATA_DIR/zones.pmtiles" "$DATA_DIR/desire_lines.pmtiles" \
  "$DATA_DIR/routes_fast.pmtiles" "$DATA_DIR/routes_quiet.pmtiles" \
  "$DATA_DIR/rnet.pmtiles" "$DATA_DIR/zones.geojson" "$DATA_DIR/manifest.json"
rm -rf "$DATA_DIR/commute" "$DATA_DIR/school"
mkdir -p "$DATA_DIR/commute" "$DATA_DIR/school"
SUMMARY_FILE="$WORK_DIR/summary.tsv"
: > "$SUMMARY_FILE"

build_commute_dataset msoa
build_commute_dataset lsoa
build_school_dataset

export DATA_DIR
python3 - <<'PY'
import json
import os
from pathlib import Path

data_dir = Path(os.environ["DATA_DIR"])
files = sorted(
    path for path in data_dir.rglob("*")
    if path.is_file() and path.name != "manifest.json"
)
manifest = {
    "dataset": "PCT West Yorkshire",
    "files": [
        {"file": path.relative_to(data_dir).as_posix(), "bytes": path.stat().st_size}
        for path in files
        if path.name != "line_thresholds.json"
    ],
}
(data_dir / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
PY

printf '\n===SUMMARY START===\n'
printf '%-45s %14s %12s %10s %11s\n' 'file' 'bytes' 'features' 'tiles' 'zooms'
while IFS=$'\t' read -r name bytes features tiles zooms; do
  printf '%-45s %14s %12s %10s %11s\n' "$name" "$bytes" "$features" "$tiles" "$zooms"
done < "$SUMMARY_FILE"
printf 'manifest.json%33s\n' "$(stat -c%s "$DATA_DIR/manifest.json") bytes"
printf '===SUMMARY END===\n'
