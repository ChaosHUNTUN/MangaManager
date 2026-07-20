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

# 下载了 0 页的任务（token 过期导致）
rows = conn.execute("""
    SELECT Gid, Token, Title, DownloadedPages, TotalPages, Status, ErrorMsg, CompletedAt
    FROM download_task
    WHERE DownloadedPages = 0 AND Status IN ('failed', 'completed')
    ORDER BY CompletedAt DESC
""").fetchall()

print(f"Token 过期/0 页下载任务: {len(rows)} 个")
print()
for r in rows:
    print(f"GID={r['Gid']}  {r['Title']}")

conn.close()
