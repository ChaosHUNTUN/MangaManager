import sqlite3, os

candidates = [
    os.path.join(os.path.dirname(__file__), "..", "src", "backend", "MangaManager.Api", "manga.db"),
    os.path.join(os.path.dirname(__file__), "..", "src", "backend", "MangaManager.Api", "bin", "Debug", "net9.0", "manga.db"),
]
db = next((c for c in candidates if os.path.exists(c)), None)
conn = sqlite3.connect(db)

rows = conn.execute("""
    SELECT Gid, Title FROM download_task
    WHERE DownloadedPages = 0 AND Status IN ('failed', 'completed')
      AND CompletedAt >= datetime('now', '-7 days')
""").fetchall()

gids = [r[0] for r in rows]
if not gids:
    print("无匹配任务")
    conn.close()
    exit()

placeholders = ','.join(['?'] * len(gids))
lg = conn.execute(f"SELECT Gid FROM local_gallery WHERE Gid IN ({placeholders})", gids).fetchall()

print(f"download_task 中: {len(rows)} 个")
print(f"local_gallery 中仍有: {len(lg)} 个")
if lg:
    print("local_gallery 中的记录:")
    for r in lg[:10]:
        print(f"  GID={r[0]}")
    if len(lg) > 10:
        print(f"  ... 共 {len(lg)} 个")
    
    # 这些目录实际存在吗
    base = r"D:\MangaManager\downloads"
    exists = 0
    for gid in [r[0] for r in lg]:
        prefix = f"{gid}-"
        if os.path.isdir(base):
            dirs = [d for d in os.listdir(base) if d.startswith(prefix)]
            if dirs:
                images = [f for f in os.listdir(os.path.join(base, dirs[0])) if f.endswith(('.jpg','.png','.webp','.gif'))]
                if images:
                    exists += 1
    print(f"\n磁盘上实际存在图片的目录: {exists}")
    if exists == 0:
        print("→ 这些都是空目录或不存在，应该从 local_gallery 清理")
else:
    print("local_gallery 中无记录 → 已下载标记应该来自磁盘扫描")

conn.close()
