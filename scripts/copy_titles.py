import sqlite3, os, pyperclip

candidates = [
    os.path.join(os.path.dirname(__file__), "..", "src", "backend", "MangaManager.Api", "manga.db"),
    os.path.join(os.path.dirname(__file__), "..", "src", "backend", "MangaManager.Api", "bin", "Debug", "net9.0", "manga.db"),
]
db = next((c for c in candidates if os.path.exists(c)), None)
if not db:
    print("DB not found"); exit(1)

conn = sqlite3.connect(db)
rows = conn.execute("""
    SELECT Title FROM download_task
    WHERE DownloadedPages = 0 AND Status IN ('failed', 'completed')
      AND CompletedAt >= datetime('now', '-7 days')
    ORDER BY CompletedAt DESC
""").fetchall()

titles = [r[0] for r in rows if r[0] and not r[0].startswith("Gallery #")]
print(f"共 {len(titles)} 个标题\n")
for t in titles:
    print(t)

# 复制到剪贴板
try:
    pyperclip.copy("\n".join(titles))
    print(f"\n✅ 已复制 {len(titles)} 个标题到剪贴板")
except:
    print("\n⚠️ pyperclip 未安装，请手动复制上方输出")
    print("   pip install pyperclip")

conn.close()
