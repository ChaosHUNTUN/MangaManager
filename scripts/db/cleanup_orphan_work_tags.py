#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""一次性脚本：清理孤儿 work_tag（指向已不存在的作品）

成因：`GallerySyncService` 删除作品记录时（磁盘目录消失 / 一致性检查）原先只删 local_gallery 行，
不同步清理 work_tag，导致标签关联残留。同步逻辑已修复（见 GallerySyncService），
本脚本用于清理历史遗留。

只删除 WorkId 为**正数**且既不在 local_gallery、也不在 manga 表中的关联；
负数 WorkId（旧 Manga 体系）与仍在库中的作品一律不动。

用法：
    python scripts/db/cleanup_orphan_work_tags.py          # 预演
    python scripts/db/cleanup_orphan_work_tags.py --yes    # 执行（先自动备份数据库）
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

ORPHAN_WHERE = """
    WorkId > 0
    AND NOT EXISTS (SELECT 1 FROM local_gallery g WHERE g.Gid = work_tag.WorkId)
    AND NOT EXISTS (SELECT 1 FROM manga m WHERE m.Id = work_tag.WorkId)
"""


def stats(con):
    total = con.execute("SELECT COUNT(*) FROM work_tag").fetchone()[0]
    orphans = con.execute("SELECT COUNT(*) FROM work_tag WHERE " + ORPHAN_WHERE).fetchone()[0]
    works = con.execute("SELECT COUNT(DISTINCT WorkId) FROM work_tag WHERE " + ORPHAN_WHERE).fetchone()[0]
    return total, orphans, works


def backup(db_path, backup_dir):
    os.makedirs(backup_dir, exist_ok=True)
    dst = os.path.join(backup_dir, f"manga_before_orphan_cleanup_{time.strftime('%Y%m%d_%H%M%S')}.db")
    src = sqlite3.connect(db_path)
    out = sqlite3.connect(dst)
    try:
        src.backup(out)
    finally:
        out.close()
        src.close()
    return dst


def main():
    ap = argparse.ArgumentParser(description="清理孤儿 work_tag")
    ap.add_argument("--db", default=DEFAULT_DB)
    ap.add_argument("--backup-dir", default=DEFAULT_BACKUP_DIR)
    ap.add_argument("--yes", action="store_true", help="真正执行删除（缺省只预演）")
    args = ap.parse_args()

    if not os.path.exists(args.db):
        raise SystemExit(f"数据库不存在: {args.db}")

    con = sqlite3.connect(args.db, timeout=30)
    total, orphans, works = stats(con)
    print(f"work_tag 总数: {total}")
    print(f"孤儿关联     : {orphans} 条（涉及 {works} 个已不存在的作品）")
    if orphans == 0:
        con.close()
        print("\n没有需要清理的孤儿关联。")
        return 0

    if not args.yes:
        con.close()
        print("\n这是预演模式，未修改任何数据。确认无误后加 --yes 执行。")
        return 0

    path = backup(args.db, args.backup_dir)
    print(f"\n已备份数据库 → {path}")

    cur = con.cursor()
    cur.execute("BEGIN IMMEDIATE")
    cur.execute("DELETE FROM work_tag WHERE " + ORPHAN_WHERE)
    deleted = cur.rowcount
    con.commit()
    total2, orphans2, _ = stats(con)
    con.close()

    print(f"\n已删除 {deleted} 条孤儿关联")
    print(f"work_tag 总数: {total} → {total2}")
    print(f"剩余孤儿     : {orphans2}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
