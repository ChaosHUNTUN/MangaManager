"""Fix AlbumKey inconsistencies and auto-assign unassigned works to albums.

Usage:
  python scripts/db/fix_album_assignment.py [--dry-run]
"""
import sqlite3, json, os, sys

DB = os.path.join(os.path.dirname(__file__), "..", "..", "src", "backend", "MangaManager.Api", "manga.db")
DRY_RUN = "--dry-run" in sys.argv

conn = sqlite3.connect(DB)
conn.row_factory = sqlite3.Row

print(f"Mode: {'DRY-RUN' if DRY_RUN else 'EXECUTE'}")

# ─── Load data ────────────────────────────
albums = []
for r in conn.execute("SELECT Key, Name, Gids, KeyTag, Count FROM album_config").fetchall():
    albums.append({**dict(r), "gids": json.loads(r["Gids"] or "[]")})

# gallery → id lookups    
gallery_rows = conn.execute("SELECT Gid, Artists, Groups, AllTags, AlbumKey FROM local_gallery").fetchall()
galleries = []
for r in gallery_rows:
    g = dict(r)
    g["artists"] = json.loads(g["Artists"] or "[]")
    g["groups"] = json.loads(g["Groups"] or "[]")
    g["all_tags"] = json.loads(g["AllTags"] or "[]")
    g["simple_tags"] = [*g["artists"], *g["groups"]]
    galleries.append(g)

album_gid_set = set()
for a in albums:
    album_gid_set.update(a["gids"])

# ─── 1. Fix AlbumKey inconsistencies ──────
print("\n=== Phase 1: Fix AlbumKey inconsistencies ===")
ak_fixes = 0
for g in galleries:
    gid = g["Gid"]
    current_ak = g["AlbumKey"]
    # Find which album(s) contain this gid
    expected_keys = [a["Key"] for a in albums if gid in a["gids"]]
    
    if not expected_keys:
        if current_ak is not None:
            # Stale AlbumKey: GID not in any album but AlbumKey set
            print(f"  GID={gid}: AlbumKey='{current_ak}' but not in any album Gids → clearing")
            if not DRY_RUN:
                conn.execute("UPDATE local_gallery SET AlbumKey=NULL WHERE Gid=?", (gid,))
            ak_fixes += 1
        continue
    
    if len(expected_keys) == 1:
        target = expected_keys[0]
        if current_ak != target:
            print(f"  GID={gid}: AlbumKey='{current_ak}' → '{target}'")
            if not DRY_RUN:
                conn.execute("UPDATE local_gallery SET AlbumKey=? WHERE Gid=?", (target, gid))
            ak_fixes += 1
    else:
        # Multiple albums contain this GID (overlap) — set to first one, will fix overlap later
        target = expected_keys[0]
        if current_ak != target:
            print(f"  GID={gid}: AlbumKey='{current_ak}' → '{target}' (multiple: {expected_keys})")
            if not DRY_RUN:
                conn.execute("UPDATE local_gallery SET AlbumKey=? WHERE Gid=?", (target, gid))
            ak_fixes += 1

# ─── 2. Build album matchers ──────────────
album_matchers = []
for a in albums:
    matchers = set()
    if a["Key"]:
        matchers.add(a["Key"])
    if a["KeyTag"]:
        matchers.add(a["KeyTag"])
    album_matchers.append({"key": a["Key"], "name": a["Name"], "matchers": matchers, "gids": a["gids"]})

# ─── 3. Auto-assign unassigned works ──────
print("\n=== Phase 2: Auto-assign unassigned works ===")
assignments = 0
for g in galleries:
    gid = g["Gid"]
    if gid in album_gid_set:
        continue  # Already assigned
    
    # Build candidate match set: all_tags + simple + namespace-inferred
    candidates = set(g["all_tags"])
    for t in g["simple_tags"]:
        if t and ":" not in t:
            candidates.add(f"artist:{t}")
            candidates.add(f"group:{t}")
        candidates.add(t)
    
    matched_album = None
    for am in album_matchers:
        for m in am["matchers"]:
            if m in candidates:
                matched_album = am
                break
        if matched_album:
            break
    
    if matched_album:
        print(f"  GID={gid} → {matched_album['name']} (Key={matched_album['key']})")
        if not DRY_RUN:
            # Add to album Gids
            new_gids = list(set(matched_album["gids"] + [gid]))
            conn.execute("UPDATE album_config SET Gids=?, Count=? WHERE Key=?",
                        (json.dumps(new_gids), len(new_gids), matched_album["key"]))
            # Set AlbumKey on gallery
            conn.execute("UPDATE local_gallery SET AlbumKey=? WHERE Gid=?", (matched_album["key"], gid))
            # Update in-memory
            matched_album["gids"].append(gid)
            album_gid_set.add(gid)
        assignments += 1

if not DRY_RUN:
    conn.commit()
    print(f"\n  💾 Committed {ak_fixes} AlbumKey fixes + {assignments} album assignments")
else:
    print(f"\n  📋 Would fix {ak_fixes} AlbumKey inconsistencies + {assignments} album assignments")

conn.close()
print("Done")