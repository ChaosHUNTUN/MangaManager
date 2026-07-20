import sqlite3, os
candidates = [
    os.path.join(os.path.dirname(__file__), "..", "src", "backend", "MangaManager.Api", "manga.db"),
    os.path.join(os.path.dirname(__file__), "..", "src", "backend", "MangaManager.Api", "bin", "Debug", "net9.0", "manga.db"),
]
db = next((c for c in candidates if os.path.exists(c)), None)
conn = sqlite3.connect(db)
for r in conn.execute("SELECT Gid, Token, Title, DownloadedPages, TotalPages, CompletedAt FROM download_task WHERE Status='completed' AND DownloadedPages > 0 ORDER BY CompletedAt DESC LIMIT 3"):
    print(f"GID={r[0]} Token={r[1]} Title={r[2]} Pages={r[3]}/{r[4]}")
conn.close()
