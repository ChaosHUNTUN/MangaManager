import sqlite3, json, os

DB = os.path.join(os.path.dirname(__file__), "..", "..", "src", "backend", "MangaManager.Api", "manga.db")
conn = sqlite3.connect(DB)
conn.row_factory = sqlite3.Row

print("=== album_config 中包含 try 的记录 ===")
for r in conn.execute("SELECT * FROM album_config WHERE Key LIKE '%try%' OR Name LIKE '%try%' OR KeyTag LIKE '%try%' ORDER BY Key").fetchall():
    d = dict(r)
    gids = json.loads(d["Gids"] or "[]")
    print(f"  Id={d['Id']}, Key='{d['Key']}', Name='{d['Name']}', KeyTag={d['KeyTag']}, Count={d['Count']}, Gids({len(gids)})={gids[:5]}...")

print()
print("=== 精确匹配 Key='try' 的记录 ===")
for r in conn.execute("SELECT * FROM album_config WHERE Key='try'").fetchall():
    d = dict(r)
    gids = json.loads(d["Gids"] or "[]")
    print(f"  Id={d['Id']}, Key='{d['Key']}', Name='{d['Name']}', KeyTag={d['KeyTag']}, Count={d['Count']}, Gids({len(gids)})={gids}")

print()
print("=== 精确匹配 Key='artist:try' 的记录 ===")
for r in conn.execute("SELECT * FROM album_config WHERE Key='artist:try'").fetchall():
    d = dict(r)
    gids = json.loads(d["Gids"] or "[]")
    print(f"  Id={d['Id']}, Key='{d['Key']}', Name='{d['Name']}', KeyTag={d['KeyTag']}, Count={d['Count']}, Gids({len(gids)})={gids}")

print()
print("=== local_gallery 中 AlbumKey 含 try 的记录 ===")
rows = conn.execute("SELECT Gid, Title, Artists, Groups, AlbumKey FROM local_gallery WHERE AlbumKey LIKE '%try%'").fetchall()
for r in rows:
    arts = json.loads(r["Artists"] or "[]")
    grps = json.loads(r["Groups"] or "[]")
    print(f"  GID={r['Gid']}, AlbumKey='{r['AlbumKey']}', Artists={arts}, Groups={grps}")

print()
print("=== local_gallery 中 Artists/Groups 包含 try 的记录 (前10条) ===")
rows2 = conn.execute("SELECT Gid, Title, Artists, Groups FROM local_gallery Where Artists LIKE '%try%' OR Groups LIKE '%try%' LIMIT 10").fetchall()
for r in rows2:
    arts = json.loads(r["Artists"] or "[]")
    grps = json.loads(r["Groups"] or "[]")
    print(f"  GID={r['Gid']}, Artists={arts}, Groups={grps}")

conn.close()