#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""一次性脚本：清理「专辑方案」遗留数据

专辑方案已废弃（前端 FEATURES.enableAlbums=false），但数据仍在库里占位：
  - album_config 表（专辑定义）
  - Category='album' 的标签（迁移时按专辑生成的合成标签）+ 其作品关联
  - local_gallery.AlbumKey（作品上的专辑归属）

本脚本把这些一次性清掉。作品本身、作品标签、阅读进度等都不受影响。

用法：
    python scripts/db/cleanup_albums.py              # 预演（只看会删什么，不改数据）
    python scripts/db/cleanup_albums.py --yes        # 执行（先自动备份数据库）
    python scripts/db/cleanup_albums.py --yes --vacuum   # 顺手 VACUUM 回收空间

退出码：0=成功；非 0=失败。
"""
import argparse
import os
import sqlite3
import sys
import time

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DEFAULT_DB = os.path.join(PROJECT_ROOT, "src", "backend", "MangaManager.Api", "manga.db")
DEFAULT_BACKUP_DIR = os.path.join(PROJECT_ROOT, "src", "backend", "MangaManager.Api", "backups")


def collect(con):
    """统计当前专辑遗留数据"""
    def one(sql, params=()):
        return con.execute(sql, params).fetchone()[0]

    album_tag_ids = [r[0] for r in con.execute("SELECT Id FROM tag WHERE Category = 'album'")]
    if album_tag_ids:
        qmarks = ",".join("?" * len(album_tag_ids))
        work_links = one(f"SELECT COUNT(*) FROM work_tag WHERE TagId IN ({qmarks})", album_tag_ids)
        order_rows = one(f"SELECT COUNT(*) FROM tag_order WHERE TagId IN ({qmarks})", album_tag_ids)
    else:
        work_links = order_rows = 0
    return {
        "album_config": one("SELECT COUNT(*) FROM album_config"),
        "album_tags": len(album_tag_ids),
        "album_tag_work_links": work_links,
        "album_tag_order": order_rows,
        "albumkey_works": one(
            "SELECT COUNT(*) FROM local_gallery WHERE IFNULL(AlbumKey,'') <> ''"),
        "tags_total": one("SELECT COUNT(*) FROM tag"),
        "galleries_total": one("SELECT COUNT(*) FROM local_gallery"),
    }, album_tag_ids


def backup(db_path, backup_dir):
    os.makedirs(backup_dir, exist_ok=True)
    dst = os.path.join(backup_dir, f"manga_before_album_cleanup_{time.strftime('%Y%m%d_%H%M%S')}.db")
    src = sqlite3.connect(db_path)
    out = sqlite3.connect(dst)
    try:
        src.backup(out)          # SQLite 一致性快照（WAL 安全）
    finally:
        out.close()
        src.close()
    return dst


def main():
    ap = argparse.ArgumentParser(description="清理专辑方案遗留数据")
    ap.add_argument("--db", default=DEFAULT_DB)
    ap.add_argument("--backup-dir", default=DEFAULT_BACKUP_DIR)
    ap.add_argument("--yes", action="store_true", help="真正执行删除（缺省只预演）")
    ap.add_argument("--no-backup", action="store_true", help="跳过自动备份（不推荐）")
    ap.add_argument("--vacuum", action="store_true", help="删除后 VACUUM 回收磁盘空间")
    args = ap.parse_args()

    if not os.path.exists(args.db):
        raise SystemExit(f"数据库不存在: {args.db}")

    con = sqlite3.connect(args.db, timeout=30)
    before, album_tag_ids = collect(con)
    con.close()

    print("当前专辑遗留数据：")
    print(f"  album_config 专辑定义      : {before['album_config']}")
    print(f"  album 分类标签             : {before['album_tags']}")
    print(f"  这些标签的作品关联         : {before['album_tag_work_links']}")
    print(f"  这些标签的阅读顺序记录     : {before['album_tag_order']}")
    print(f"  作品上的 AlbumKey 归属     : {before['albumkey_works']} 部")
    print(f"  （作品总数 {before['galleries_total']}，标签总数 {before['tags_total']}）")

    if not args.yes:
        print("\n这是预演模式，未修改任何数据。确认无误后加 --yes 执行。")
        return 0

    if not args.no_backup:
        path = backup(args.db, args.backup_dir)
        print(f"\n已备份数据库 → {path}")

    con = sqlite3.connect(args.db, timeout=60)
    try:
        cur = con.cursor()
        cur.execute("BEGIN IMMEDIATE")
        if album_tag_ids:
            qmarks = ",".join("?" * len(album_tag_ids))
            cur.execute(f"DELETE FROM tag_order WHERE TagId IN ({qmarks})", album_tag_ids)
            cur.execute(f"DELETE FROM work_tag  WHERE TagId IN ({qmarks})", album_tag_ids)
            cur.execute(f"DELETE FROM manga_tag WHERE TagId IN ({qmarks})", album_tag_ids)
            cur.execute(f"DELETE FROM tag       WHERE Id     IN ({qmarks})", album_tag_ids)
        cur.execute("DELETE FROM album_config")
        cur.execute("UPDATE local_gallery SET AlbumKey = NULL WHERE IFNULL(AlbumKey,'') <> ''")
        con.commit()
    except Exception as e:
        con.rollback()
        raise SystemExit(f"执行失败，已回滚，数据未变更：{e}")

    after, _ = collect(con)
    if args.vacuum:
        con.execute("VACUUM")
    con.close()

    print("\n清理后：")
    print(f"  album_config               : {before['album_config']} → {after['album_config']}")
    print(f"  album 分类标签             : {before['album_tags']} → {after['album_tags']}")
    print(f"  作品上的 AlbumKey 归属     : {before['albumkey_works']} → {after['albumkey_works']}")
    print(f"  作品总数                   : {before['galleries_total']} → {after['galleries_total']}（应保持不变）")
    print(f"  标签总数                   : {before['tags_total']} → {after['tags_total']}")
    print("\n完成。建议重启 API 进程，避免内存中的旧标签/专辑缓存继续被使用。")
    return 0


if __name__ == "__main__":
    sys.exit(main())
