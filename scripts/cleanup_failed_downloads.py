import os, json, sqlite3, shutil, sys

auto_yes = '--yes' in sys.argv

candidates = [
    os.path.join(os.path.dirname(__file__), "..", "src", "backend", "MangaManager.Api", "manga.db"),
    os.path.join(os.path.dirname(__file__), "..", "src", "backend", "MangaManager.Api", "bin", "Debug", "net9.0", "manga.db"),
]
db = next((c for c in candidates if os.path.exists(c)), None)
if not db:
    print("DB not found"); exit(1)

conn = sqlite3.connect(db)
r = conn.execute("SELECT DirPath FROM local_gallery LIMIT 1").fetchone()
if not r:
    print("local_gallery empty"); exit(1)

base = os.path.dirname(r[0])
print(f"扫描目录: {base}\n")

# ---- 1. 找出失败目录 ----
failed_gids = []
failed_dirs = []

for d in sorted(os.listdir(base)):
    path = os.path.join(base, d)
    if not os.path.isdir(path): continue
    has_eh = os.path.exists(os.path.join(path, ".eh"))
    has_meta = os.path.exists(os.path.join(path, ".meta.json"))
    files = [f for f in os.listdir(path) if not f.startswith('.')]
    images = [f for f in files if f.endswith(('.jpg','.png','.webp','.gif','.bmp'))]
    if len(images) > 0: continue
    if not (has_eh or has_meta): continue

    gid_str = ""
    try:
        gid_str = d.split('-')[0]
        int(gid_str)
    except: continue

    failed_gids.append(gid_str)
    failed_dirs.append((gid_str, path))

print(f"失败目录: {len(failed_dirs)} 个")

# ---- 2. 删除目录 ----
if failed_dirs:
    if not auto_yes:
        ans = input(f"确认删除 {len(failed_dirs)} 个空目录? [y/N] ")
        if ans.lower() != 'y':
            print("已取消"); conn.close(); exit()
    deleted = 0
    for gid, path in failed_dirs:
        try:
            shutil.rmtree(path)
            deleted += 1
        except Exception as e:
            print(f"  删除失败 {path}: {e}")
    print(f"已删除 {deleted} 个目录")

# ---- 3. 清理 download_task + local_gallery + album_config ----
gid_set = set(failed_gids)
if gid_set:
    placeholders = ','.join(['?']*len(gid_set))
    gids_list = list(gid_set)

    dt = conn.execute(f"SELECT COUNT(*) FROM download_task WHERE Gid IN ({placeholders})", gids_list).fetchone()[0]
    if dt:
        conn.execute(f"DELETE FROM download_task WHERE Gid IN ({placeholders})", gids_list)
        print(f"download_task: 删除 {dt} 条")

    lg = conn.execute(f"SELECT COUNT(*) FROM local_gallery WHERE Gid IN ({placeholders})", gids_list).fetchone()[0]
    if lg:
        conn.execute(f"DELETE FROM local_gallery WHERE Gid IN ({placeholders})", gids_list)
        conn.execute(f"DELETE FROM local_reading_progress WHERE Gid IN ({placeholders})", gids_list)
        print(f"local_gallery: 删除 {lg} 条")

    # album_config
    albums = conn.execute("SELECT Key, Gids FROM album_config WHERE Gids != '[]'").fetchall()
    cleaned = 0
    for key, gids_json in albums:
        try:
            gids = json.loads(gids_json)
            new_gids = [g for g in gids if str(g) not in gid_set]
            if len(new_gids) != len(gids):
                conn.execute("UPDATE album_config SET Gids=?, Count=? WHERE Key=?",
                    [json.dumps(new_gids), len(new_gids), key])
                order_json = conn.execute('SELECT "Order" FROM album_config WHERE Key=?', [key]).fetchone()[0]
                if order_json and order_json != '[]':
                    try:
                        order = json.loads(order_json)
                        new_order = [o for o in order if str(o) not in gid_set]
                        conn.execute('UPDATE album_config SET "Order"=? WHERE Key=?', [json.dumps(new_order), key])
                    except: pass
                cleaned += 1
        except: pass
    if cleaned:
        print(f"album_config: 清理 {cleaned} 个专辑")

    # AlbumKey 清理
    conn.execute(f"UPDATE local_gallery SET AlbumKey=NULL WHERE Gid IN ({placeholders})", gids_list)

    conn.commit()

print("\n✅ 清理完成")
conn.close()
