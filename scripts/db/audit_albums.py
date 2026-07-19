"""
专辑数据审计脚本
检查项:
1. 重复 KeyTag — 多个专辑共享相同的关键标签
2. 作品重叠 — 同一作品存在于多个专辑的 Gids 中
3. 未分配作品匹配 — 展示未分配作品的标签与现有专辑的差异
"""
import sqlite3
import json
import os
import sys

candidates = [
    os.path.join(os.path.dirname(__file__), "..", "..", "src", "backend", "MangaManager.Api", "manga.db"),
    os.path.join(os.path.dirname(__file__), "..", "..", "src", "backend", "MangaManager.Api", "bin", "Debug", "net9.0", "manga.db"),
]
DB_PATH = next((c for c in candidates if os.path.exists(c)), None)
if not DB_PATH:
    print("❌ 数据库不存在")
    sys.exit(1)

conn = sqlite3.connect(DB_PATH)
conn.row_factory = sqlite3.Row

albums = [
    {**dict(r), "gids": json.loads(r["Gids"] or "[]"), "order": json.loads(r["Order"] or "[]")}
    for r in conn.execute('SELECT Key, Name, Gids, "Order", KeyTag, Count FROM album_config').fetchall()
]

# 同时获取标题
galleries = [
    {**dict(r),
     "artists": json.loads(r["Artists"] or "[]"),
     "groups": json.loads(r["Groups"] or "[]"),
     "all_tags": json.loads(r["AllTags"] or "[]")}
    for r in conn.execute("SELECT Gid, Title, Artists, Groups, AllTags, AlbumKey FROM local_gallery").fetchall()
]

for g in galleries:
    g["simple_tags"] = [*g["artists"], *g["groups"]]

issues = 0

# ═══ 1. 重复 KeyTag ═══
print("=" * 60)
print("1. 重复 KeyTag")
print("=" * 60)
kt_map = {}
for a in albums:
    kt = a.get("KeyTag")
    if kt:
        kt_map.setdefault(kt, []).append(a["Key"])
dup = {k: v for k, v in kt_map.items() if len(v) > 1}
if dup:
    for k, v in dup.items():
        print(f"  🔴 KeyTag='{k}' → {v}")
        issues += 1
else:
    print("  ✅ 无重复")

# ═══ 2. 作品重叠 ═══
print()
print("=" * 60)
print("2. 作品重叠")
print("=" * 60)
gid_albums = {}
for a in albums:
    for gid in a["gids"]:
        gid_albums.setdefault(gid, []).append(a["Key"])
overlap = {g: v for g, v in gid_albums.items() if len(v) > 1}
if overlap:
    for gid in sorted(overlap)[:15]:
        print(f"  🔴 GID={gid} → {overlap[gid]}")
    if len(overlap) > 15:
        print(f"  ... 共 {len(overlap)} 条重复")
    issues += sum(len(v) - 1 for v in overlap.values())
else:
    print("  ✅ 无重叠")

# AlbumKey 一致性
print()
print("  AlbumKey 一致性:")
mismatch = []
owner = dict(gid_albums)
for g in galleries:
    ak = g["AlbumKey"]
    exp = owner.get(g["Gid"], [])
    if exp and len(exp) == 1 and ak != exp[0]:
        mismatch.append((g["Gid"], ak, exp[0]))
    elif not exp and ak:
        mismatch.append((g["Gid"], ak, "[孤立]"))
if mismatch:
    print(f"  🔴 {len(mismatch)} 条不一致")
    for gid, ak, exp in mismatch[:5]:
        print(f"    GID={gid}: AlbumKey={ak}, Gids 期望={exp}")
    issues += len(mismatch)
else:
    print("  ✅ 完全一致")

# ═══ 3. 专辑匹配规则 + 未分配作品分析 ═══
print()
print("=" * 60)
print("3. 专辑匹配规则 & 未分配作品")
print("=" * 60)
print()
print("📁 现有专辑 (Key → 匹配规则):")
for a in albums:
    print(f"  [{a['Name']}] Key='{a['Key']}'  KeyTag={a.get('KeyTag')}  ({len(a['gids'])} 部)")

print()

assigned = set(gid_albums.keys())
unassigned = [g for g in galleries if g["Gid"] not in assigned]
print(f"  已分配: {len(assigned)} | 未分配: {len(unassigned)}")

# 抽取 5 个未分配作品展示
print()
print("  示例: 随机抽取 5 部未分配作品，展示其标签与现有专辑的差异")
print()

count = min(5, len(unassigned))
for g in unassigned[:count]:
    gid = g["Gid"]
    title = g["Title"]
    at = g["all_tags"]
    st = g["simple_tags"]
    print(f"  🎨 GID={gid}  「{title[:50]}」")
    print(f"     AllTags:  {at[:8]}{'...' if len(at) > 8 else ''}")
    print(f"     Simple:   {st}")
    # 找所有专辑的 Key 是否在 allTags 中
    matched = []
    for a in albums:
        if a["Key"] in at or a["Key"] in st:
            matched.append(a["Key"])
        elif a.get("KeyTag") and a["KeyTag"] in at:
            matched.append(f"{a['Key']} (by KeyTag={a['KeyTag']})")
    if matched:
        print(f"     ⚠️  可匹配: {matched}")
    else:
        # 展示差异
        album_keys = [a["Key"] for a in albums]
        album_kts = [a.get("KeyTag") for a in albums if a.get("KeyTag")]
        print(f"     ❌ 无匹配: 专辑 Key 集合 {album_keys[:3]}... 不在本作品标签中")
        if album_kts:
            print(f"         专辑 KeyTag 集合: {album_kts[:3]}... 也不匹配")
    print()

# 统计签名分布
print("─" * 60)
print("  标签签名统计 (allTags 的前缀分布):")
ns_counts = {}
for g in unassigned:
    sig = ",".join(sorted(set(t.split(":")[0] for t in g["all_tags"] if ":" in t))[:5]) or "(none)"
    ns_counts[sig] = ns_counts.get(sig, 0) + 1
for sig, c in sorted(ns_counts.items(), key=lambda x: -x[1])[:10]:
    print(f"    [{c:4d}] {sig}")

print()
print("=" * 60)
print(f"审计完成，共 {issues} 个问题")
conn.close()