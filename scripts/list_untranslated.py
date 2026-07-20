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
rows = conn.execute("SELECT Key, Name FROM album_config ORDER BY Key").fetchall()

def is_cn(s):
    return any('\u4e00' <= c <= '\u9fff' for c in (s or ""))

print(f"总专辑数: {len(rows)}")
print()
print("=== 未汉化专辑 ===")
cnt = 0
for r in rows:
    if not is_cn(r['Name']):
        print(r['Key'])
        cnt += 1

print()
print(f"未汉化: {cnt} / {len(rows)}")
conn.close()
