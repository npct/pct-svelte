#!/usr/bin/env python3
"""Backfill commute rnet for all regions from commute/lsoa/<region>/rnet_full.geojson."""
import json, subprocess, sys, tarfile, urllib.request
from pathlib import Path

ROOT = Path("/home/robin/github/npct/pct-svelte")
OUT = ROOT / "public/data/regions"
WORK = Path("/tmp/pct-rnet-backfill")
PMTILES = Path("/tmp/pct-pmtiles-1.31.2-x86_64/pmtiles")
BASE = "https://media.githubusercontent.com/media/npct/pct-outputs-regional-notR/master/commute/lsoa"

manifest = json.load(open(OUT / "data_manifest.json"))
slugs = sorted(manifest)
print("regions:", len(slugs))

ok = 0
for slug in slugs:
    dest = OUT / slug / "rnet.pmtiles"
    if dest.exists() and dest.stat().st_size > 10000:
        ok += 1
        continue
    work = WORK / slug
    work.mkdir(parents=True, exist_ok=True)
    src = work / "rnet_full.geojson"
    url = f"{BASE}/{slug}/rnet_full.geojson"
    try:
        urllib.request.urlretrieve(url, src)
    except Exception as e:
        print(f"WARN {slug}: {e}")
        continue
    # round floats to keep tiles small (same approach as prepare_data.sh)
    feats = json.loads(src.read_text())["features"]
    out_feats = []
    for f in feats:
        p = f.get("properties", {}) or {}
        props = {}
        for k, v in p.items():
            if isinstance(v, float):
                props[k] = round(v, 3)
            else:
                props[k] = v
        out_feats.append({"type": "Feature", "properties": props, "geometry": f["geometry"]})
    geojson = work / "rnet.geojson"
    geojson.write_text(json.dumps({"type": "FeatureCollection", "features": out_feats}))
    mb = work / "rnet.mbtiles"
    subprocess.run(["tippecanoe", "-o", str(mb), "-l", "rnet", "-Z", "6", "-z", "12",
                    "--drop-densest-as-needed", "--no-tile-size-limit", "--no-feature-limit",
                    "--force", str(geojson)], check=True, capture_output=True)
    subprocess.run([str(PMTILES), "convert", str(mb), str(dest)], check=True, capture_output=True)
    subprocess.run([str(PMTILES), "verify", str(dest)], check=True, capture_output=True)
    manifest[slug]["rnet"] = True
    manifest[slug]["complete"] = all(v for k, v in manifest[slug].items() if k != "complete")
    ok += 1
    print(f"OK {slug} ({dest.stat().st_size/1e6:.1f} MB)")

json.dump(manifest, open(OUT / "data_manifest.json", "w"), indent=1)
print(f"done: rnet present for {ok}/{len(slugs)}")
