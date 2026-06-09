import sqlite3, json

# 当前使用的是 SQLite 模式
conn = sqlite3.connect(r'D:\MangaManager\src\backend\MangaManager.Api\manga.db')
cur = conn.cursor()

# 所有表
cur.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
tables = [r[0] for r in cur.fetchall()]
print("=== SQLite 表 ===")
for t in tables:
    cur.execute(f"SELECT COUNT(*) FROM [{t}]")
    cnt = cur.fetchone()[0]
    print(f"  {t}: {cnt} 行")

# 标签
cur.execute("SELECT * FROM tag")
rows = cur.fetchall()
print(f"\n=== tag 表 ({len(rows)} 行) ===")
for r in rows:
    print(f"  id={r[0]}, name={r[1]}, color={r[2]}, category={r[3] if len(r)>3 else 'N/A'}")

# 漫画标签关联
cur.execute("SELECT COUNT(*) FROM manga_tag")
cnt = cur.fetchone()[0]
print(f"\n=== manga_tag 表: {cnt} 行 ===")
cur.execute("SELECT * FROM manga_tag LIMIT 5")
for r in cur.fetchall():
    print(f"  id={r[0]}, manga_id={r[1]}, tag_id={r[2]}")

# 漫画数
cur.execute("SELECT COUNT(*) FROM manga")
cnt = cur.fetchone()[0]
print(f"\n=== manga 表: {cnt} 部漫画 ===")

conn.close()
