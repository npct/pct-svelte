#!/usr/bin/env python3
"""Build the complete regional PCT PMTiles bundle."""
import gzip
import json
import math
import re
import shutil
import subprocess
import sys
import tarfile
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "public/data/regions"
WORK = Path("/tmp/pct-region-assets")
PMTILES = Path("/tmp/pct-pmtiles-1.31.2-x86_64/pmtiles")
TIPPECANOE = shutil.which("tippecanoe") or "/home/robin/bin/tippecanoe"
REGIONAL = "https://media.githubusercontent.com/media/npct/pct-outputs-regional-notR/master"
COMMUTE_REGIONS = "https://raw.githubusercontent.com/npct/pct-shiny/master/regions_www/www/front_page/commute/pct_regions_lowres_scenario_commute.js"
SCHOOL_REGIONS = "https://raw.githubusercontent.com/npct/pct-shiny/master/regions_www/www/front_page/school/pct_regions_lowres_scenario_school.js"

SCENARIO = "dutch_slc,dutch_sid,dutch_siyll,dutch_sivalueyll,dutch_sisickdays,dutch_sivaluesick,dutch_sico2,govtarget_slc,govtarget_sid,govtarget_siyll,govtarget_sivalueyll,govtarget_sisickdays,govtarget_sivaluesick,govtarget_sico2,gendereq_slc,gendereq_sid,gendereq_siyll,gendereq_sivalueyll,gendereq_sisickdays,gendereq_sivaluesick,gendereq_sico2,ebike_slc,ebike_sid,ebike_siyll,ebike_sivalueyll,ebike_sisickdays,ebike_sivaluesick,ebike_sico2,govnearmkt_slc,govnearmkt_sid,govnearmkt_siyll,govnearmkt_sivalueyll,govnearmkt_sisickdays,govnearmkt_sivaluesick,govnearmkt_sico2"
POPUP_METRICS = f"car_driver,{SCENARIO}"
ZONE_FIELDS = f"geo_code,geo_name,lad_name,all,bicycle,{POPUP_METRICS}"
DESIRE_FIELDS = f"id,geo_code1,geo_code2,geo_name1,geo_name2,all,bicycle,{POPUP_METRICS},e_dist_km"
ROUTE_FIELDS = f"id,geo_code1,geo_code2,geo_name1,geo_name2,all,bicycle,{POPUP_METRICS},rf_dist_km,rf_avslope_perc,rq_dist_km,rq_avslope_perc,dist_rq_rf"
SCHOOL_SCENARIO = "govtarget_slc,govtarget_sic,govtarget_sid,govtarget_simmet,govtarget_sico2,cambridge_slc,cambridge_sic,cambridge_sid,cambridge_simmet,cambridge_sico2,dutch_slc,dutch_sic,dutch_sid,dutch_simmet,dutch_sico2"
SCHOOL_ZONE_FIELDS = f"geo_code,geo_name,lad_name,all,bicycle,car,baseline_at_mmet,{SCHOOL_SCENARIO}"
SCHOOL_DESTINATION_FIELDS = "urn,schoolname,phase,all,bicycle,car,govtarget_slc,govtarget_sic,govtarget_sid,govtarget_sico2,cambridge_slc,cambridge_sic,cambridge_sid,cambridge_sico2,dutch_slc,dutch_sic,dutch_sid,dutch_sico2"
ASSETS = ("zones", "desire_lines", "routes_fast", "routes_quiet", "rnet", "zones_lsoa", "desire_lines_lsoa", "routes_fast_lsoa", "routes_quiet_lsoa", "rnet_lsoa", "school_zones", "school_destinations", "school_rnet")


def call(args, **kwargs):
    print("+", " ".join(map(str, args)), flush=True)
    return subprocess.run(args, check=True, text=True, **kwargs)


def warn(message):
    print(f"WARN: {message}", file=sys.stderr, flush=True)


def request(url):
    return urllib.request.Request(url, headers={"User-Agent": "pct-svelte-region-assets"})


def fetch(url, path, label):
    """Fetch an optional input, with exactly one retry for transient errors."""
    path.parent.mkdir(parents=True, exist_ok=True)
    for attempt in range(2):
        try:
            print(f"Downloading {url}", flush=True)
            with urllib.request.urlopen(request(url), timeout=180) as response, open(path, "wb") as output:
                shutil.copyfileobj(response, output)
            return True
        except urllib.error.HTTPError as error:
            path.unlink(missing_ok=True)
            if error.code == 404:
                warn(f"{label}: missing upstream source (404): {url}")
                return False
            if attempt:
                raise
            warn(f"{label}: download failed ({error.code}); retrying once")
        except (urllib.error.URLError, TimeoutError, OSError) as error:
            path.unlink(missing_ok=True)
            if attempt:
                raise
            warn(f"{label}: transient download failure ({error}); retrying once")
    raise AssertionError("unreachable")


def repair_geojson_numbers(path):
    """Repair upstream R JSON's invalid exponent values such as -2e-008.0."""
    text = path.read_text(encoding="utf-8")
    repaired = re.sub(r"(?P<number>-?\d+(?:\.\d+)?e[+-]\d+)\.0(?=\D|$)", r"\g<number>", text)
    if repaired != text:
        path.write_text(repaired, encoding="utf-8")


def remote_json(url):
    for attempt in range(2):
        try:
            with urllib.request.urlopen(request(url), timeout=180) as response:
                raw = response.read().decode("utf-8")
            return json.loads(raw.split("=", 1)[1].strip().rstrip(";"))
        except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, OSError) as error:
            if attempt:
                raise
            warn(f"region metadata download failed ({error}); retrying once")
    raise AssertionError("unreachable")


def pretty(slug):
    return " ".join(word if word in {"and", "of"} else word.capitalize() for word in slug.replace("_", "-").split("-"))


def bounds(geometry):
    points = []
    def visit(value):
        if value and isinstance(value[0], (int, float)):
            points.append(value)
        else:
            for child in value or []:
                visit(child)
    visit(geometry["coordinates"])
    return min(p[0] for p in points), min(p[1] for p in points), max(p[0] for p in points), max(p[1] for p in points)


def centre_zoom(extent):
    west, south, east, north = extent
    lat, lng = (south + north) / 2, (west + east) / 2
    cos_lat = max(math.cos(math.radians(lat)), .01)
    x = max((east - west) * 111320 * cos_lat / 960, .01)
    y = max((north - south) * 111320 / 640, .01)
    zoom = min(math.log2(78271.51696 * cos_lat / x), math.log2(78271.51696 * cos_lat / y))
    return [round(lat, 6), round(lng, 6)], round(max(6, min(12, zoom)), 2)


def fields_present(path, wanted, label):
    info = json.loads(call(["ogrinfo", "-ro", "-so", "-json", str(path)], stdout=subprocess.PIPE).stdout)
    available = {item["name"] for item in info["layers"][0].get("fields", [])}
    result = [field for field in wanted.split(",") if field in available]
    for field in wanted.split(","):
        if field not in available:
            warn(f"{label}: school source lacks {field}; omitting it from tile fields")
    if not result:
        raise RuntimeError(f"{label}: no requested fields found")
    return ",".join(result)


def geojson_features(path):
    """Stream a FeatureCollection without materialising the collection."""
    decoder = json.JSONDecoder()
    with open(path, encoding="utf-8") as stream:
        buffer, started, finished = "", False, False
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
                buffer, started = buffer[bracket + 1:], True
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


def round_floats(value, places):
    if isinstance(value, float):
        return round(value, places)
    if isinstance(value, dict):
        return {key: round_floats(item, places) for key, item in value.items()}
    if isinstance(value, list):
        return [round_floats(item, places) for item in value]
    return value


def join_quiet(lines, quiet, output):
    fields = ROUTE_FIELDS.split(",")
    attributes = {}
    for feature in geojson_features(lines):
        props = feature.get("properties") or {}
        if props.get("id") is not None:
            attributes[props["id"]] = {field: props.get(field) for field in fields}
    count = 0
    with open(output, "w", encoding="utf-8") as stream:
        stream.write('{"type":"FeatureCollection","features":[\n')
        for feature in geojson_features(quiet):
            identifier = (feature.get("properties") or {}).get("id")
            if identifier not in attributes:
                raise ValueError(f"No desire-line attributes for quiet route {identifier!r}")
            feature["properties"] = attributes[identifier]
            if count:
                stream.write(",\n")
            stream.write(json.dumps(round_floats(feature, 6), separators=(",", ":"), allow_nan=False))
            count += 1
        stream.write("\n]}\n")


def rounded_rnet(source, output):
    with open(output, "w", encoding="utf-8") as stream:
        for feature in geojson_features(source):
            feature["properties"] = round_floats(feature.get("properties") or {}, 3)
            stream.write(json.dumps(feature, separators=(",", ":"), allow_nan=False) + "\n")


def build(input_path, work, destination, name, layer, settings):
    mbtiles, output = work / f"{name}.mbtiles", destination / f"{name}.pmtiles"
    call([TIPPECANOE, "-o", str(mbtiles), "-l", layer, *settings, "--force", str(input_path)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    output.unlink(missing_ok=True)
    call([str(PMTILES), "convert", str(mbtiles), str(output)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    mbtiles.unlink()
    call([str(PMTILES), "verify", str(output)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


def archive(path, include_asset):
    members = [OUT / "regions.pmtiles", OUT / "region_defaults.json", OUT / "data_manifest.json"]
    assets = sorted(p for p in OUT.rglob("*.pmtiles") if p != OUT / "regions.pmtiles" and include_asset(p))
    members += assets
    with open(path, "wb") as raw:
        with gzip.GzipFile(filename="", mode="wb", fileobj=raw, mtime=0) as zipped:
            with tarfile.open(fileobj=zipped, mode="w", format=tarfile.GNU_FORMAT) as tar:
                for member in members:
                    info = tar.gettarinfo(str(member), arcname=str(member.relative_to(ROOT)))
                    info.uid = info.gid = info.mtime = 0
                    info.uname = info.gname = ""
                    with open(member, "rb") as source:
                        tar.addfile(info, source)


def main():
    if not PMTILES.is_file() or not Path(TIPPECANOE).is_file() or not shutil.which("ogr2ogr") or not shutil.which("ogrinfo"):
        raise SystemExit("Need the pinned PMTiles CLI, tippecanoe, ogr2ogr and ogrinfo.")
    commute, school = remote_json(COMMUTE_REGIONS), remote_json(SCHOOL_REGIONS)
    cdata = {f["properties"]["region_name"]: f for f in commute["features"]}
    sdata = {f["properties"]["region_name"]: f["properties"] for f in school["features"]}
    defaults_path = OUT / "region_defaults.json"
    if defaults_path.exists():
        slugs = [item["slug"] for item in json.loads(defaults_path.read_text(encoding="utf-8"))]
    else:
        slugs = sorted(cdata)
    if len(slugs) != 45 or len(set(slugs)) != 45:
        raise SystemExit("Expected exactly 45 unique region slugs in region_defaults.json.")
    if set(slugs) - set(cdata):
        raise SystemExit("Commute metadata lacks: " + ", ".join(sorted(set(slugs) - set(cdata))))
    shutil.rmtree(WORK, ignore_errors=True)
    shutil.rmtree(OUT, ignore_errors=True)
    WORK.mkdir(parents=True)
    OUT.mkdir(parents=True)

    defaults, manifest, region_features = [], {}, []
    zone_settings = ["-Z", "7", "-z", "12", "--drop-densest-as-needed", "--no-tile-size-limit", "--no-feature-limit"]
    line_settings = ["-Z", "8", "-z", "12", "--no-tile-size-limit", "--no-feature-limit"]
    rnet_settings = ["-Z", "6", "-z", "12", "--drop-densest-as-needed", "--no-tile-size-limit", "--no-feature-limit"]
    destination_settings = ["-Z", "7", "-z", "13", "--drop-densest-as-needed", "--no-tile-size-limit", "--no-feature-limit"]
    for slug in slugs:
        meta = cdata[slug]
        props = meta["properties"]
        summary = {"region_name": slug, "region_pretty": pretty(slug)}
        for name in "bicycle_perc govtarget_slc_perc govnearmkt_slc_perc gendereq_slc_perc dutch_slc_perc ebike_slc_perc".split():
            if name in props:
                summary[name] = props[name]
        for name in "bicycle_perc govtarget_slc_perc cambridge_slc_perc dutch_slc_perc".split():
            if name in sdata.get(slug, {}):
                summary["school_" + name] = sdata[slug][name]
        region_features.append({"type": "Feature", "properties": summary, "geometry": meta["geometry"]})
        fallback = bounds(meta["geometry"])
        destination, work = OUT / slug, WORK / slug
        destination.mkdir(exist_ok=True); work.mkdir(exist_ok=True)
        state = {asset: False for asset in ASSETS}
        cb, sb = f"{REGIONAL}/commute/msoa/{slug}", f"{REGIONAL}/school/lsoa/{slug}"
        commute_sources = {name: fetch(f"{cb}/{filename}", work / filename, f"{slug}: {name}") for name, filename in {
            "z": "z.geojson", "l": "l.geojson", "rf": "rf.geojson", "rq": "rq.geojson", "rnet": "rnet_full.geojson"}.items()}
        if commute_sources["z"]:
            slim = work / "zones.geojson"
            call(["ogr2ogr", "-f", "GeoJSON", "-select", ZONE_FIELDS, "-simplify", "0.0001", "-lco", "COORDINATE_PRECISION=6", str(slim), str(work / "z.geojson")])
            build(slim, work, destination, "zones", "zones", zone_settings); state["zones"] = True
            info = json.loads(call(["ogrinfo", "-ro", "-so", "-json", str(work / "z.geojson")], stdout=subprocess.PIPE).stdout)
            centre, zoom = centre_zoom(info["layers"][0]["geometryFields"][0]["extent"])
        else:
            centre, zoom = centre_zoom(fallback)
        if commute_sources["l"]:
            slim = work / "desire_lines.geojson"
            call(["ogr2ogr", "-f", "GeoJSON", "-select", DESIRE_FIELDS, "-lco", "COORDINATE_PRECISION=6", str(slim), str(work / "l.geojson")])
            build(slim, work, destination, "desire_lines", "desire_lines", line_settings); state["desire_lines"] = True
        if commute_sources["rf"]:
            slim = work / "routes_fast.geojson"
            call(["ogr2ogr", "-f", "GeoJSON", "-select", ROUTE_FIELDS, "-lco", "COORDINATE_PRECISION=6", str(slim), str(work / "rf.geojson")])
            build(slim, work, destination, "routes_fast", "routes_fast", line_settings); state["routes_fast"] = True
        if commute_sources["l"] and commute_sources["rq"]:
            slim = work / "routes_quiet.geojson"; join_quiet(work / "l.geojson", work / "rq.geojson", slim)
            build(slim, work, destination, "routes_quiet", "routes_quiet", line_settings); state["routes_quiet"] = True
        elif commute_sources["rq"]:
            warn(f"{slug}: routes_quiet not built because l.geojson is missing")
        if commute_sources["rnet"]:
            slim = work / "rnet-rounded.geojsonseq"; rounded_rnet(work / "rnet_full.geojson", slim)
            build(slim, work, destination, "rnet", "rnet", rnet_settings); state["rnet"] = True

        # The shiny app's route-network and school views use LSOA geography.
        # Publish a parallel commute LSOA bundle rather than silently reusing
        # the coarser MSOA assets when users switch Geography.
        lsoa_work = WORK / f"{slug}-lsoa"
        lsoa_work.mkdir(exist_ok=True)
        lsoa_base = f"{REGIONAL}/commute/lsoa/{slug}"
        lsoa_sources = {name: fetch(f"{lsoa_base}/{filename}", lsoa_work / filename, f"{slug}: lsoa {name}") for name, filename in {
            "z": "z.geojson", "l": "l.geojson", "rf": "rf.geojson", "rq": "rq.geojson", "rnet": "rnet_full.geojson"}.items()}
        for source_name, present in lsoa_sources.items():
            if present:
                repair_geojson_numbers(lsoa_work / {"z": "z.geojson", "l": "l.geojson", "rf": "rf.geojson", "rq": "rq.geojson", "rnet": "rnet_full.geojson"}[source_name])
        if lsoa_sources["z"]:
            slim = lsoa_work / "zones_lsoa.geojson"
            call(["ogr2ogr", "-f", "GeoJSON", "-select", ZONE_FIELDS, "-simplify", "0.0001", "-lco", "COORDINATE_PRECISION=6", str(slim), str(lsoa_work / "z.geojson")])
            build(slim, lsoa_work, destination, "zones_lsoa", "zones", zone_settings); state["zones_lsoa"] = True
        if lsoa_sources["l"]:
            slim = lsoa_work / "desire_lines_lsoa.geojson"
            call(["ogr2ogr", "-f", "GeoJSON", "-select", DESIRE_FIELDS, "-lco", "COORDINATE_PRECISION=6", str(slim), str(lsoa_work / "l.geojson")])
            build(slim, lsoa_work, destination, "desire_lines_lsoa", "desire_lines", line_settings); state["desire_lines_lsoa"] = True
        if lsoa_sources["rf"]:
            slim = lsoa_work / "routes_fast_lsoa.geojson"
            call(["ogr2ogr", "-f", "GeoJSON", "-select", ROUTE_FIELDS, "-lco", "COORDINATE_PRECISION=6", str(slim), str(lsoa_work / "rf.geojson")])
            build(slim, lsoa_work, destination, "routes_fast_lsoa", "routes_fast", line_settings); state["routes_fast_lsoa"] = True
        if lsoa_sources["l"] and lsoa_sources["rq"]:
            slim = lsoa_work / "routes_quiet_lsoa.geojson"; join_quiet(lsoa_work / "l.geojson", lsoa_work / "rq.geojson", slim)
            build(slim, lsoa_work, destination, "routes_quiet_lsoa", "routes_quiet", line_settings); state["routes_quiet_lsoa"] = True
        if lsoa_sources["rnet"]:
            slim = lsoa_work / "rnet_lsoa-rounded.geojsonseq"; rounded_rnet(lsoa_work / "rnet_full.geojson", slim)
            build(slim, lsoa_work, destination, "rnet_lsoa", "rnet", rnet_settings); state["rnet_lsoa"] = True
        shutil.rmtree(lsoa_work)

        school_sources = {name: fetch(f"{sb}/{filename}", work / f"school-{filename}", f"{slug}: {name}") for name, filename in {
            "z": "z.geojson", "z_csv": "z_attributes.csv", "d": "d.geojson", "d_csv": "d_attributes.csv", "rnet": "rnet_full.geojson"}.items()}
        if school_sources["z"] and school_sources["z_csv"]:
            slim = work / "school_zones.geojson"
            call(["ogr2ogr", "-f", "GeoJSON", "-select", fields_present(work / "school-z.geojson", SCHOOL_ZONE_FIELDS, f"{slug}: school_zones"), "-simplify", "0.0001", "-lco", "COORDINATE_PRECISION=6", str(slim), str(work / "school-z.geojson")])
            build(slim, work, destination, "school_zones", "zones", zone_settings); state["school_zones"] = True
        elif school_sources["z"]:
            warn(f"{slug}: school_zones not built because z_attributes.csv is missing")
        if school_sources["d"] and school_sources["d_csv"]:
            slim = work / "school_destinations.geojson"
            call(["ogr2ogr", "-f", "GeoJSON", "-select", fields_present(work / "school-d.geojson", SCHOOL_DESTINATION_FIELDS, f"{slug}: school_destinations"), "-lco", "COORDINATE_PRECISION=6", str(slim), str(work / "school-d.geojson")])
            build(slim, work, destination, "school_destinations", "destinations", destination_settings); state["school_destinations"] = True
        elif school_sources["d"]:
            warn(f"{slug}: school_destinations not built because d_attributes.csv is missing")
        if school_sources["rnet"]:
            slim = work / "school-rnet-rounded.geojsonseq"; rounded_rnet(work / "school-rnet_full.geojson", slim)
            build(slim, work, destination, "school_rnet", "rnet", rnet_settings); state["school_rnet"] = True
        state["school"] = all(state[name] for name in ("school_zones", "school_destinations", "school_rnet"))
        state["complete"] = all(state[name] for name in ASSETS)
        manifest[slug] = state
        defaults.append({"slug": slug, "pretty": pretty(slug), "centre": centre, "zoom": zoom})
        shutil.rmtree(work)

    regions = WORK / "regions.geojson"
    regions.write_text(json.dumps({"type": "FeatureCollection", "features": region_features}, separators=(",", ":")), encoding="utf-8")
    mbtiles = WORK / "regions.mbtiles"
    call([TIPPECANOE, "-o", str(mbtiles), "-l", "regions", "-Z", "4", "-z", "8", "--drop-densest-as-needed", "--no-tile-size-limit", "--force", str(regions)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    output = OUT / "regions.pmtiles"; output.unlink(missing_ok=True)
    call([str(PMTILES), "convert", str(mbtiles), str(output)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL); mbtiles.unlink()
    defaults.sort(key=lambda item: item["slug"])
    (OUT / "region_defaults.json").write_text(json.dumps(defaults, indent=2) + "\n", encoding="utf-8")
    (OUT / "data_manifest.json").write_text(json.dumps(manifest, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    for path in sorted(OUT.rglob("*.pmtiles")):
        call([str(PMTILES), "verify", str(path)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    base_tarball = OUT / "pct-region-assets.tar.gz"
    archive(base_tarball, lambda p: not p.name.endswith("_lsoa.pmtiles"))
    lsoa_zones_tarball = OUT / "pct-region-assets-lsoa-zones.tar.gz"
    archive(lsoa_zones_tarball, lambda p: p.name == "zones_lsoa.pmtiles")
    lsoa_desire_tarball = OUT / "pct-region-assets-lsoa-desire.tar.gz"
    archive(lsoa_desire_tarball, lambda p: p.name == "desire_lines_lsoa.pmtiles")
    lsoa_fast_tarball = OUT / "pct-region-assets-lsoa-fast.tar.gz"
    archive(lsoa_fast_tarball, lambda p: p.name == "routes_fast_lsoa.pmtiles")
    lsoa_lines_b_tarball = OUT / "pct-region-assets-lsoa-lines-b.tar.gz"
    archive(lsoa_lines_b_tarball, lambda p: p.name in {"routes_quiet_lsoa.pmtiles", "rnet_lsoa.pmtiles"})
    print("===SUMMARY START===")
    summary_assets = ["zones", "desire_lines", "routes_fast", "routes_quiet", "rnet", "zones_lsoa", "desire_lines_lsoa", "routes_fast_lsoa", "routes_quiet_lsoa", "rnet_lsoa", "school_zones", "school_destinations", "school_rnet"]
    print("\t".join(["region", *summary_assets, "full"]))
    for slug in sorted(manifest):
        state = manifest[slug]
        print("\t".join([slug] + ["yes" if state[name] else "no" for name in summary_assets] + ["yes" if state["complete"] else "no"]))
    print("total pmtiles bytes\t" + str(sum(path.stat().st_size for path in OUT.rglob("*.pmtiles"))))
    print("base tarball bytes\t" + str(base_tarball.stat().st_size))
    print("lsoa zones tarball bytes\t" + str(lsoa_zones_tarball.stat().st_size))
    print("lsoa desire tarball bytes\t" + str(lsoa_desire_tarball.stat().st_size))
    print("lsoa fast tarball bytes\t" + str(lsoa_fast_tarball.stat().st_size))
    print("lsoa lines-b tarball bytes\t" + str(lsoa_lines_b_tarball.stat().st_size))
    print("===SUMMARY END===")


if __name__ == "__main__":
    main()
