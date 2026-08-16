"""
专辑数据修复脚本：补全 AlbumKey 为空的作品，清理孤儿 gid。
直接在 manga.db 上操作，会创建备份。
"""
import sqlite3, json, shutil, os, sys
from datetime import datetime

DB = r'D:\MangaManager\src\backend\MangaManager.Api\manga.db'

def main():
    if not os.path.exists(DB):
        print(f"DB 不存在: {DB}")
        return

    # 备份
    backup = DB.replace('.db', f'_backup_{datetime.now().strftime("%Y%m%d_%H%M%S")}.db')
    shutil.copy2(DB, backup)
    print(f"[Backup] {backup}")

    conn = sqlite3.connect(DB)
    conn.execute("PRAGMA journal_mode=WAL")
    cur = conn.cursor()

    # ========== Step 1: 补全 AlbumKey 为空的作品 ==========
    cur.execute("SELECT Gid, Artists, Groups FROM local_gallery WHERE AlbumKey IS NULL OR AlbumKey=''")
    null_rows = cur.fetchall()
    print(f"\n[Step 1] AlbumKey 为空的作品: {len(null_rows)} 个")

    if not null_rows:
        print("无需处理")
    else:
        # 加载所有专辑的 gid→key 映射
        cur.execute("SELECT Key, Gids FROM album_config WHERE Gids IS NOT NULL AND Gids!='' AND Gids!='[]'")
        album_gid_map = {}  # gid → [album_keys]
        for key, gids_json in cur.fetchall():
            try:
                gids = json.loads(gids_json)
                for gid in gids:
                    album_gid_map.setdefault(gid, []).append(key)
            except:
                pass

        updated = 0
        uncategorized = 0
        for gid, artists_json, groups_json in null_rows:
            if gid in album_gid_map:
                keys = album_gid_map[gid]
                # 优先 artist 专辑，其次 group 专辑，最后按字母序
                artist_keys = [k for k in keys if k not in ('multi', '__uncategorized__')]
                primary = artist_keys[0] if artist_keys else keys[0]
                cur.execute("UPDATE local_gallery SET AlbumKey=? WHERE Gid=?", (primary, gid))
                updated += 1
            else:
                cur.execute("UPDATE local_gallery SET AlbumKey='__uncategorized__' WHERE Gid=?", (gid,))
                uncategorized += 1

        conn.commit()
        print(f"  已补全 {updated} 个（从已有专辑匹配）")
        print(f"  兜底到 __uncategorized__: {uncategorized} 个")

        # 确保 __uncategorized__ 专辑存在
        if uncategorized > 0:
            cur.execute("SELECT Key FROM album_config WHERE Key='__uncategorized__'")
            if not cur.fetchone():
                now = datetime.utcnow().isoformat()
                cur.execute(
                    "INSERT INTO album_config (Key, Name, Color, Gids, [Order], Count, KeyTag, CreatedAt, UpdatedAt) "
                    "VALUES ('__uncategorized__', '未分类', '#888888', '[]', '[]', ?, NULL, ?, ?)",
                    (uncategorized, now, now))
                conn.commit()
                print(f"  已创建 __uncategorized__ 专辑 (Count={uncategorized})")
            else:
                cur.execute("UPDATE album_config SET Count=Count+? WHERE Key='__uncategorized__'", (uncategorized,))
                conn.commit()

    # ========== Step 2: 清理孤儿 gid ==========
    cur.execute("SELECT Gid FROM local_gallery")
    valid_gids = {row[0] for row in cur.fetchall()}

    cur.execute("SELECT Key, Gids FROM album_config WHERE Gids IS NOT NULL AND Gids!='' AND Gids!='[]'")
    orphan_removed = 0
    for key, gids_json in cur.fetchall():
        try:
            gids = json.loads(gids_json)
            clean = [g for g in gids if g in valid_gids]
            if len(clean) != len(gids):
                cur.execute("UPDATE album_config SET Gids=?, Count=? WHERE Key=?",
                           (json.dumps(clean), len(clean), key))
                orphan_removed += len(gids) - len(clean)
        except:
            pass

    conn.commit()
    print(f"\n[Step 2] 清理孤儿 gid: {orphan_removed} 个")

    # ========== Step 3: 确保 Count 一致性 ==========
    cur.execute("SELECT Key, Gids FROM album_config WHERE Gids IS NOT NULL")
    fixed_count = 0
    for key, gids_json in cur.fetchall():
        try:
            gids = json.loads(gids_json)
            cur.execute("UPDATE album_config SET Count=? WHERE Key=? AND Count!=?",
                       (len(gids), key, len(gids)))
            if cur.rowcount > 0:
                fixed_count += 1
        except:
            pass

    conn.commit()
    print(f"\n[Step 3] 修复 Count 不一致: {fixed_count} 个专辑")

    # ========== 最终统计 ==========
    cur.execute("SELECT COUNT(*) FROM local_gallery WHERE AlbumKey IS NULL OR AlbumKey=''")
    remaining_null = cur.fetchone()[0]
    cur.execute("SELECT COUNT(*) FROM album_config")
    total_albums = cur.fetchone()[0]

    print(f"\n=== 完成 ===")
    print(f"  剩余 AlbumKey 为空: {remaining_null} 个")
    print(f"  专辑总数: {total_albums}")
    print(f"  备份文件: {backup}")

    conn.close()

if __name__ == '__main__':
    main()
