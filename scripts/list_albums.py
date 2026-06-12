import sqlite3
conn = sqlite3.connect(r'd:\MangaManager\src\backend\MangaManager.Api\manga.db')
rows = conn.execute("SELECT Key, Name, json_array_length(Gids) as Count FROM album_config ORDER BY CreatedAt").fetchall()
for r in rows:
    print(f'{r[0]} | {r[1]} | {r[2]}部')
conn.close()
