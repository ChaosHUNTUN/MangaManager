"""
清理数据库中的空目录记录
- 删除 local_gallery 中目录无图片文件的记录
- 从 album_config.Gids 中移除对应的 GID
- 更新 album_config.Count
"""
import sqlite3
import os
import json

DB = os.path.join(os.path.dirname(__file__), "..", "..", "src", "backend", "MangaManager.Api", "manga.db")
IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp"}
DRY_RUN = "--dry-run" in __import__("sys").argv

conn = sqlite3.connect(DB)
conn.row_factory = sqlite3.Row

print(f"模式: {'预览 (DRY-RUN)' if DRY_RUN else '实际执行'}")

# 1. 扫描空目录
rows = conn.execute("SELECT Gid, Title, DirPath, FileCount, AlbumKey FROM local_gallery").fetchall()
empty_gids = []

for r in rows:
    dp = r["DirPath"]
    if not dp or not os.path.isdir(dp):
        empty_gids.append({"gid": r["Gid"], "title": r["Title"][:60], "album_key": r["AlbumKey"], "file_count": r["FileCount"], "reason": "目录不存在"})
        continue
    files = os.listdir(dp)
    img_count = sum(1 for f in files if os.path.splitext(f)[1].lower() in IMAGE_EXTS)
    if img_count == 0:
        empty_gids.append({"gid": r["Gid"], "title": r["Title"][:60], "album_key": r["AlbumKey"], "file_count": r["FileCount"], "reason": "无图片文件"})

print(f"发现 {len(empty_gids)} 条空目录记录")

# 2. 加载专辑配置
albums = {r["Key"]: json.loads(r["Gids"] or "[]") for r in conn.execute("SELECT Key, Gids FROM album_config").fetchall()}

# 3. 清理
removed_from_albums = {}
if not DRY_RUN:
    gid_list = [e["gid"] for e in empty_gids]
    # 删除 local_gallery
    for gid in gid_list:
        conn.execute("DELETE FROM local_gallery WHERE Gid=?", (gid,))
    # 删除阅读进度
    conn.execute(f"DELETE FROM local_reading_progress WHERE Gid IN ({','.join('?'*len(gid_list))})", gid_list)
    # 更新专辑
    album_changes = 0
    for album_key, gids in albums.items():
        new_gids = [g for g in gids if g not in gid_list]
        if len(new_gids) != len(gids):
            removed_from_albums[album_key] = len(gids) - len(new_gids)
            conn.execute("UPDATE album_config SET Gids=?, Count=? WHERE Key=?", (json.dumps(new_gids), len(new_gids), album_key))
            album_changes += 1
    conn.commit()
    print(f"  ✅ 已删除 {len(gid_list)} 条 local_gallery 记录")
    print(f"  ✅ 已更新 {album_changes} 个专辑 (共移除 {sum(removed_from_albums.values())} 个 GID)")
else:
    # dry-run 统计
    gid_set = set(e["gid"] for e in empty_gids)
    affected = 0
    for album_key, gids in albums.items():
        removed = [g for g in gids if g in gid_set]
        if removed:
            affected += 1
            print(f"  📋 {album_key} 将移除 {len(removed)} 个 GID")
    print(f"  📋 将删除 {len(gid_set)} 条 local_gallery 记录")
    print(f"  📋 将更新 {affected} 个专辑")

# 4. 明细
print()
print("=" * 60)
print("清理明细 (前30条)")
print("=" * 60)
for e in empty_gids[:30]:
    print(f"  GID={e['gid']} | AlbumKey={e['album_key']} | DB FileCount={e['file_count']} | {e['reason']}")
    print(f"     {e['title']}")
if len(empty_gids) > 30:
    print(f"  ...还有 {len(empty_gids) - 30} 条")

conn.close()
print()
print("完成")