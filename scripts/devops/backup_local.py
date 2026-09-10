#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""MangaManager 本地项目备份

做三件事，产出一个可完整还原的备份目录：
  1. 复制工作树（排除可重建目录：node_modules / bin / obj / dist / .vs / __pycache__）
  2. 用 SQLite backup API 生成**一致性**数据库快照（直接拷文件在 WAL 模式下可能撕裂）
  3. 生成 git bundle（单文件包含全部历史，可 git clone 还原）

用法：
    python scripts/devops/backup_local.py
    python scripts/devops/backup_local.py --dest E:\\Backups
    python scripts/devops/backup_local.py --no-git      # 跳过 bundle（工作树已含 .git）

退出码：0=成功；非 0=失败。
"""
import argparse
import os
import shutil
import sqlite3
import subprocess
import sys
import time

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DEFAULT_DEST = r"D:\MangaManager_Backups"
DB_REL = os.path.join("src", "backend", "MangaManager.Api", "manga.db")
EXCLUDE_DIRS = ["node_modules", "bin", "obj", "dist", ".vs", ".idea", "__pycache__"]
EXCLUDE_FILES = ["*.log"]


def log(msg):
    print(msg, flush=True)


def run(cmd, **kw):
    return subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8",
                          errors="replace", **kw)


def copy_tree(src, dst):
    """robocopy 复制工作树（返回复制文件数）"""
    cmd = ["robocopy", src, dst, "/E", "/R:1", "/W:1", "/NFL", "/NDL", "/NJH", "/NJS"]
    cmd += ["/XD"] + [os.path.join(src, d) if os.sep in d else d for d in EXCLUDE_DIRS]
    cmd += ["/XF"] + EXCLUDE_FILES
    r = run(cmd)
    # robocopy 退出码 0-7 均为成功（位标志），>=8 表示失败
    if r.returncode >= 8:
        raise RuntimeError(f"robocopy 失败 (code={r.returncode}):\n{r.stdout}\n{r.stderr}")
    return r.returncode


def snapshot_db(src_db, dst_db):
    """SQLite 一致性快照（WAL 安全），返回关键表行数"""
    os.makedirs(os.path.dirname(dst_db), exist_ok=True)
    src = sqlite3.connect(src_db)
    dst = sqlite3.connect(dst_db)
    try:
        src.backup(dst)
    finally:
        dst.close()
        src.close()
    # 快照是自包含的，清掉 robocopy 捎带的 WAL 旁文件，避免误导还原
    for suffix in ("-wal", "-shm"):
        p = dst_db + suffix
        if os.path.exists(p):
            os.remove(p)
    con = sqlite3.connect(dst_db)
    counts = {}
    for t in ("local_gallery", "work_tag", "tag", "tag_order", "download_task",
              "local_reading_progress", "album_config"):
        try:
            counts[t] = con.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0]
        except Exception:
            counts[t] = None
    integrity = con.execute("PRAGMA integrity_check").fetchone()[0]
    con.close()
    return counts, integrity


def make_bundle(dst_bundle):
    r = run(["git", "bundle", "create", dst_bundle, "--all"], cwd=PROJECT_ROOT)
    if r.returncode != 0:
        raise RuntimeError(f"git bundle 失败: {r.stderr}")
    v = run(["git", "bundle", "verify", dst_bundle], cwd=PROJECT_ROOT)
    return v.stdout + v.stderr


def dir_size(path):
    total = files = 0
    for root, _, names in os.walk(path):
        for n in names:
            try:
                total += os.path.getsize(os.path.join(root, n))
                files += 1
            except OSError:
                pass
    return total, files


def main():
    ap = argparse.ArgumentParser(description="MangaManager 本地备份")
    ap.add_argument("--dest", default=DEFAULT_DEST, help="备份根目录")
    ap.add_argument("--no-git", action="store_true", help="跳过 git bundle")
    args = ap.parse_args()

    stamp = time.strftime("%Y%m%d_%H%M%S")
    dest = os.path.join(args.dest, f"MangaManager_{stamp}")
    if os.path.exists(dest):
        raise SystemExit(f"目标已存在: {dest}")
    os.makedirs(dest)
    log(f"[1/4] 复制工作树 → {dest}")
    log(f"      排除目录: {', '.join(EXCLUDE_DIRS)}")
    copy_tree(PROJECT_ROOT, dest)

    log("[2/4] 生成数据库一致性快照")
    src_db = os.path.join(PROJECT_ROOT, DB_REL)
    dst_db = os.path.join(dest, DB_REL)
    if os.path.exists(src_db):
        counts, integrity = snapshot_db(src_db, dst_db)
    else:
        counts, integrity = {}, "源数据库不存在"

    bundle_note = "已跳过（--no-git）"
    if not args.no_git:
        log("[3/4] 生成 git bundle（完整历史）")
        verify_out = make_bundle(os.path.join(dest, "MangaManager-repo.bundle"))
        bundle_note = "OK"
    else:
        log("[3/4] 跳过 git bundle")
        verify_out = ""

    log("[4/4] 写入 MANIFEST 并校验")
    size, files = dir_size(dest)
    git_head = run(["git", "rev-parse", "HEAD"], cwd=PROJECT_ROOT).stdout.strip()
    git_branch = run(["git", "rev-parse", "--abbrev-ref", "HEAD"], cwd=PROJECT_ROOT).stdout.strip()

    lines = [
        "MangaManager 本地备份清单",
        "=" * 46,
        f"备份时间   : {time.strftime('%Y-%m-%d %H:%M:%S')}",
        f"源目录     : {PROJECT_ROOT}",
        f"备份目录   : {dest}",
        f"体积/文件数: {size / 1024 / 1024:.1f} MB / {files} 个文件",
        f"git 分支   : {git_branch} @ {git_head}",
        f"git bundle : {bundle_note}",
        "",
        "数据库快照（SQLite backup API，WAL 安全）:",
        f"  完整性检查: {integrity}",
    ]
    for t, n in counts.items():
        lines.append(f"  {t}: {n}")
    lines += [
        "",
        "已排除（可重建，还原后重装即可）:",
        "  node_modules / bin / obj / dist / .vs / .idea / __pycache__ / *.log",
        "",
        "未包含（不在项目目录，需单独备份）:",
        "  画廊图片: G:\\学习资料\\本子",
        "",
        "还原方式:",
        "  1) 直接复制本目录内容回项目路径",
        "  2) 或用 bundle 还原历史: git clone MangaManager-repo.bundle MangaManager",
        "  3) 前端依赖: cd src/frontend/manga-ui && npm install",
        "  4) 后端构建: dotnet build src/backend/MangaManager.slnx",
    ]
    if verify_out.strip():
        lines += ["", "git bundle verify:", verify_out.strip()]
    with open(os.path.join(dest, "MANIFEST.txt"), "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")

    log("")
    log("\n".join(lines[:14]))
    log("")
    log(f"备份完成: {dest}")
    if integrity != "ok":
        log(f"警告: 数据库完整性检查返回 {integrity}")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
