"""
检查数据库中记录的作品目录是否为空（无图片文件）
扫描 local_gallery 中所有 DirPath，确认目录是否存在图片文件
"""
import sqlite3
import os
import json
import sys

DB = os.path.join(os.path.dirname(__file__), "..", "..", "src", "backend", "MangaManager.Api", "manga.db")
IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp"}

conn = sqlite3.connect(DB)
conn.row_factory = sqlite3.Row

rows = conn.execute("SELECT Gid, Title, DirPath, FileCount FROM local_gallery ORDER BY Gid").fetchall()

empty_dirs = []
missing_dirs = []
empty_by_file_count_zero = []
dir_exists_but_no_images = []

total = len(rows)
print(f"检查 {total} 条记录...")

for i, r in enumerate(rows):
    gid = r["Gid"]
    title = r["Title"]
    dir_path = r["DirPath"]
    db_fc = r["FileCount"]

    if i % 500 == 0 and i > 0:
        print(f"  进度: {i}/{total} | 空目录: {len(empty_dirs)} | 缺失目录: {len(missing_dirs)} | FileCount=0: {len(empty_by_file_count_zero)}")

    # 检查目录是否存在
    if not dir_path or not os.path.isdir(dir_path):
        missing_dirs.append({"gid": gid, "title": title[:60], "path": dir_path})
        continue

    # 统计目录中的实际图片文件数
    try:
        files = os.listdir(dir_path)
        image_count = sum(1 for f in files if os.path.splitext(f)[1].lower() in IMAGE_EXTS)
    except:
        image_count = -1

    if image_count == 0:
        # 目录存在但没有图片文件
        non_image_files = [f for f in files if os.path.splitext(f)[1].lower() not in IMAGE_EXTS]
        empty_dirs.append({
            "gid": gid,
            "title": title[:60],
            "path": dir_path,
            "non_image_count": len(non_image_files),
            "non_image_sample": non_image_files[:5],
            "db_file_count": db_fc,
        })
    elif image_count == -1:
        pass  # 权限错误等

    if db_fc == 0 and image_count > 0:
        empty_by_file_count_zero.append({
            "gid": gid,
            "title": title[:60],
            "actual_images": image_count,
        })

conn.close()

print()
print("=" * 60)
print("检查完成")
print("=" * 60)

if missing_dirs:
    print(f"\n🔴 目录不存在 (共 {len(missing_dirs)} 条):")
    for d in missing_dirs[:20]:
        print(f"  GID={d['gid']} 「{d['title']}」")
        print(f"    路径: {d['path']}")
    if len(missing_dirs) > 20:
        print(f"  ...还有 {len(missing_dirs) - 20} 条")

if empty_dirs:
    print(f"\n🔴 目录存在但无图片文件 (共 {len(empty_dirs)} 条):")
    for d in empty_dirs[:20]:
        print(f"  GID={d['gid']} 「{d['title']}」")
        print(f"    路径: {d['path']}")
        print(f"    非图片文件数: {d['non_image_count']} | DB FileCount: {d['db_file_count']}")
        if d['non_image_sample']:
            print(f"    示例文件: {d['non_image_sample']}")
    if len(empty_dirs) > 20:
        print(f"  ...还有 {len(empty_dirs) - 20} 条")

if empty_by_file_count_zero:
    print(f"\n🟡 DB FileCount=0 但目录有图片 (共 {len(empty_by_file_count_zero)} 条):")
    for d in empty_by_file_count_zero[:10]:
        print(f"  GID={d['gid']} 「{d['title']}」 | 实际图片: {d['actual_images']}")
    if len(empty_by_file_count_zero) > 10:
        print(f"  ...还有 {len(empty_by_file_count_zero) - 10} 条")

if not missing_dirs and not empty_dirs and not empty_by_file_count_zero:
    print("\n✅ 所有记录对应的目录均有图片文件，数据完整")

print()
print(f"统计: 缺失目录={len(missing_dirs)} | 空目录={len(empty_dirs)} | FileCount=0但有空目录={len(empty_by_file_count_zero)}")