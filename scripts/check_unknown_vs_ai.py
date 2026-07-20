import sqlite3, json, os

db = next((c for c in [
    os.path.join(os.path.dirname(__file__), "..", "src", "backend", "MangaManager.Api", "manga.db"),
    os.path.join(os.path.dirname(__file__), "..", "src", "backend", "MangaManager.Api", "bin", "Debug", "net9.0", "manga.db"),
] if os.path.exists(c)), None)
conn = sqlite3.connect(db)

# ai generated 的 Gids
r = conn.execute("SELECT Gids FROM album_config WHERE Key = 'ai generated'").fetchone()
ai_gids = set(json.loads(r[0]) if r else [])
print(f"ai generated Gids: {len(ai_gids)}")

# AlbumKey 为空的 unknown 作品
rows = conn.execute("""
    SELECT Gid, Artists, Groups, AlbumKey
    FROM local_gallery
    WHERE (Artists IS NULL OR Artists = '[]') AND (Groups IS NULL OR Groups = '[]')
""").fetchall()
unknown_gids = [r[0] for r in rows]
print(f"unknown (无标签) 作品: {len(unknown_gids)}")

# 重叠
overlap = [g for g in unknown_gids if g in ai_gids]
print(f"unknown 但已在 ai generated Gids 中: {len(overlap)}")

# AlbumKey 不为空的 unknown
ak_not_null = [r for r in rows if r[3] is not None]
print(f"  其中 AlbumKey 不为空: {len(ak_not_null)}")
if ak_not_null:
    for r in ak_not_null[:5]:
        print(f"    GID={r[0]} AlbumKey={r[3]}")

conn.close()
