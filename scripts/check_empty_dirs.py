import sqlite3, os

candidates = [
    os.path.join(os.path.dirname(__file__), "..", "src", "backend", "MangaManager.Api", "manga.db"),
    os.path.join(os.path.dirname(__file__), "..", "src", "backend", "MangaManager.Api", "bin", "Debug", "net9.0", "manga.db"),
]
db = next((c for c in candidates if os.path.exists(c)), None)
conn = sqlite3.connect(db)

# 找最近失败的 0 页任务
rows = conn.execute("""
    SELECT Gid, Title FROM download_task
    WHERE DownloadedPages = 0 AND Status IN ('failed', 'completed')
      AND CompletedAt >= datetime('now', '-7 days')
    ORDER BY CompletedAt DESC
""").fetchall()

base = r"D:\MangaManager\downloads"
print(f"检查 {len(rows)} 个目录...\n")
empty = []
has_files = 0
for r in rows:
    gid, title = r[0], r[1]
    # 找匹配的目录
    prefix = f"{gid}-"
    dirs = [d for d in os.listdir(base) if d.startswith(prefix)] if os.path.isdir(base) else []
    if not dirs:
        continue
    d = os.path.join(base, dirs[0])
    images = [f for f in os.listdir(d) if f.endswith(('.jpg', '.png', '.webp', '.gif'))]
    if images:
        has_files += 1
    else:
        empty.append((gid, dirs[0]))

print(f"有图片文件: {has_files}")
print(f"空目录: {len(empty)}")
if empty:
    print("\n空目录列表:")
    for gid, d in empty[:10]:
        print(f"  GID={gid}  {d}")
    if len(empty) > 10:
        print(f"  ... 共 {len(empty)} 个")

conn.close()
