import sqlite3, os

candidates = [
    os.path.join(os.path.dirname(__file__), "..", "src", "backend", "MangaManager.Api", "manga.db"),
    os.path.join(os.path.dirname(__file__), "..", "src", "backend", "MangaManager.Api", "bin", "Debug", "net9.0", "manga.db"),
]
db = next((c for c in candidates if os.path.exists(c)), None)
if not db:
    print("DB not found"); exit(1)

conn = sqlite3.connect(db)
conn.row_factory = sqlite3.Row

# 最近 7 天失败且 0 页的任务（token 过期的可能性最高）
rows = conn.execute("""
    SELECT Gid, Token, Title, DownloadedPages, TotalPages, Status, CompletedAt
    FROM download_task
    WHERE DownloadedPages = 0 AND Status IN ('failed', 'completed')
      AND CompletedAt >= datetime('now', '-7 days')
    ORDER BY CompletedAt DESC
""").fetchall()

print(f"最近 7 天 Token 过期/0 页下载: {len(rows)} 个")
print()
for r in rows:
    title = r['Title'] or f"Gallery #{r['Gid']}"
    print(f"GID={r['Gid']}  {title}")

conn.close()
