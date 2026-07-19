"""
一次性旧数据修复脚本
-------------------
扫描指定目录下的所有符合项目下载格式的文件夹，与数据库进行完整性比对：
1. 检查数据库是否有记录 → 无则新建
2. 检查各字段是否缺失 → 从 .meta.json 补全
3. 检查数据不一致 → 记录并更新
4. 未分配专辑的作品 → 尝试自动匹配

用法:
  python scripts/db/repair_legacy_data.py [--scan-dir "G:/学习资料/本子"] [--dry-run]
"""
import sqlite3
import json
import os
import sys
import traceback
from datetime import datetime

# ============== 配置 ==============
SCAN_DIR = r"G:\学习资料\本子"
DB_PATH = os.path.join(os.path.dirname(__file__), "..", "..", "src", "backend", "MangaManager.Api", "manga.db")
DRY_RUN = "--dry-run" in sys.argv

# 命令行覆盖目录
for arg in sys.argv[1:]:
    if arg.startswith("--scan-dir="):
        SCAN_DIR = arg.split("=", 1)[1].strip('"')
# ===================================

class RepairReport:
    def __init__(self):
        self.scanned = 0
        self.skipped_no_gid = 0
        self.skipped_no_meta = 0
        self.created = 0
        self.updated = 0
        self.unchanged = 0
        self.album_matched = 0           # 匹配到专辑的作品数
        self.album_match_gids = []       # 匹配到的 gid 列表（报告用）
        self.gaps = []                    # 数据缺失记录
        self.errors = []                  # 异常记录
        self.warnings = []                # 警告记录

    def print_summary(self):
        print()
        print("=" * 70)
        print("  旧数据修复执行报告")
        print("=" * 70)
        print(f"  扫描目录:      {SCAN_DIR}")
        print(f"  数据库:        {DB_PATH}")
        print(f"  模式:          {'预览 (DRY-RUN)' if DRY_RUN else '实际写入'}")
        print(f"  扫描文件夹数:  {self.scanned}")
        print(f"  跳过 (无GID):  {self.skipped_no_gid}")
        print(f"  跳过 (无meta): {self.skipped_no_meta}")
        print(f"  新建作品记录:  {self.created}")
        print(f"  更新作品记录:  {self.updated}")
        print(f"  无变化:        {self.unchanged}")
        print(f"  专辑匹配成功:  {self.album_matched} 部 ({len(self.album_match_gids)} 个专辑分配)")
        print(f"  数据缺口修复:  {len(self.gaps)} 处")
        print(f"  警告:          {len(self.warnings)} 条")
        print(f"  错误:          {len(self.errors)} 条")
        print("-" * 70)

        if self.gaps:
            print(f"\n  数据缺口 (共 {len(self.gaps)} 处):")
            for g in self.gaps[:30]:
                print(f"    GID={g['gid']} {g['title']}: 缺失字段 {g['missing']}")
            if len(self.gaps) > 30:
                print(f"    ...还有 {len(self.gaps) - 30} 处")

        if self.warnings:
            print(f"\n  警告 (共 {len(self.warnings)} 条):")
            for w in self.warnings[:10]:
                print(f"    ⚠️  {w}")
            if len(self.warnings) > 10:
                print(f"    ...还有 {len(self.warnings) - 10} 条")

        if self.errors:
            print(f"\n  错误 (共 {len(self.errors)} 条):")
            for e in self.errors[:10]:
                print(f"    ❌  {e}")
            if len(self.errors) > 10:
                print(f"    ...还有 {len(self.errors) - 10} 条")

        if self.album_matched > 0:
            print(f"\n  专辑分配明细 (共 {self.album_matched} 部):")
            for m in self.album_match_gids[:20]:
                print(f"    GID={m['gid']} → {m['album_name']} (Key={m['album_key']})")
            if len(self.album_match_gids) > 20:
                print(f"    ...还有 {len(self.album_match_gids) - 20} 部")

        print()
        print("=" * 70)
        print("  修复完成")
        print("=" * 70)


def parse_gid(dir_name: str):
    """从文件夹名中提取 GID，格式: {GID}-{Title}"""
    dash = dir_name.find("-")
    if dash <= 0:
        return None
    gid_str = dir_name[:dash].strip()
    if not gid_str.isdigit():
        return None
    return int(gid_str)


def parse_meta(meta_file: str, gid: int):
    """读取 .meta.json 并返回 (metadata_dict, all_tags_list)"""
    with open(meta_file, "r", encoding="utf-8") as f:
        data = json.load(f)

    # 提取需要的字段
    meta = {
        "titleJpn": data.get("titleJpn", ""),
        "uploader": data.get("uploader", ""),
        "ratingCount": data.get("ratingCount", 0),
        "posted": data.get("posted", 0),
        "category": data.get("category", ""),
        "language": data.get("language", ""),
        "rating": data.get("rating", 0),
        "fileCount": data.get("fileCount", 0),
        "fileSize": data.get("fileSize", 0),
        "downloadedAt": data.get("downloadedAt", ""),
    }

    # 处理 rating (可能是字符串或数字)
    raw_rating = data.get("rating", 0)
    if isinstance(raw_rating, str):
        try:
            meta["rating"] = float(raw_rating)
        except:
            meta["rating"] = 0.0
    else:
        meta["rating"] = float(raw_rating)

    # 处理 downloadedAt
    da = data.get("downloadedAt", "")
    if da:
        try:
            meta["downloadedAt"] = datetime.fromisoformat(da).isoformat() if isinstance(da, str) else str(da)
        except:
            meta["downloadedAt"] = ""

    # 解析 artists / groups
    tags = data.get("tags", {})
    artists_list = tags.get("artist", [])
    groups_list = tags.get("group", [])
    meta["artists"] = json.dumps(artists_list) if artists_list else "[]"
    meta["groups"] = json.dumps(groups_list) if groups_list else "[]"

    # 构建 AllTags
    all_tags = []
    for ns, vals in tags.items():
        if isinstance(vals, list):
            ns_lower = ns.lower()
            for v in vals:
                if v and isinstance(v, str):
                    all_tags.append(f"{ns_lower}:{v}")
    meta["allTags"] = json.dumps(all_tags) if all_tags else "[]"

    return meta, all_tags


def build_album_matchers(conn):
    """构建专辑匹配器: {album_key: matcher_info}"""
    albums = {}
    for r in conn.execute("SELECT Key, Name, KeyTag, Gids FROM album_config").fetchall():
        matchers = []
        if r["Key"]:
            matchers.append(r["Key"])
        if r["KeyTag"]:
            matchers.append(r["KeyTag"])
        albums[r["Key"]] = {
            "name": r["Name"],
            "matchers": matchers,
            "gids": json.loads(r["Gids"] or "[]"),
        }
    return albums


def match_album(all_tags: list, albums: dict, simple_tags: list):
    """尝试为作品匹配专辑。返回匹配的 album_key 或 None。"""
    # candidate tags: all_tags + simple + inferred artist:/group: 前缀
    candidates = set(all_tags)
    for t in simple_tags:
        if t and not t.startswith("artist:") and not t.startswith("group:"):
            candidates.add(t)
            candidates.add(f"artist:{t}")
            candidates.add(f"group:{t}")
        else:
            candidates.add(t)

    for album_key, info in albums.items():
        for m in info["matchers"]:
            if m in candidates:
                return album_key
    return None


def main():
    if not os.path.isdir(SCAN_DIR):
        print(f"❌ 扫描目录不存在: {SCAN_DIR}")
        sys.exit(1)

    if not os.path.isfile(DB_PATH):
        print(f"❌ 数据库文件不存在: {DB_PATH}")
        sys.exit(1)

    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    report = RepairReport()

    print(f"📂 扫描目录: {SCAN_DIR}")
    print(f"📄 数据库:   {DB_PATH}")
    print()

    # 加载现有数据库记录
    db_map = {}
    for r in conn.execute("SELECT * FROM local_gallery").fetchall():
        db_map[r["Gid"]] = dict(r)

    # 加载专辑配置
    albums = build_album_matchers(conn)
    print(f"📁 已加载 {len(albums)} 个专辑配置")

    # 统计
    total_gids_assigned = set()
    for a_info in albums.values():
        total_gids_assigned.update(a_info["gids"])

    # 列出目录
    dirs = sorted([d for d in os.listdir(SCAN_DIR) if os.path.isdir(os.path.join(SCAN_DIR, d))])
    print(f"🔍 扫描 {len(dirs)} 个文件夹...")
    print()

    for folder_name in dirs:
        full_path = os.path.join(SCAN_DIR, folder_name)

        # 跳过子文件夹嵌套
        gid = parse_gid(folder_name)
        if gid is None:
            report.skipped_no_gid += 1
            continue

        report.scanned += 1

        meta_file = os.path.join(full_path, ".meta.json")
        if not os.path.isfile(meta_file):
            report.skipped_no_meta += 1
            continue

        # 解析 .meta.json
        try:
            meta, all_tags = parse_meta(meta_file, gid)
        except Exception as e:
            report.errors.append(f"GID={gid} 解析meta失败: {e}")
            continue

        # 检查数据库
        db_record = db_map.get(gid)

        needs_create = db_record is None
        needs_update = False
        gaps = []

        if db_record:
            # 逐字段检查
            field_map = [
                ("titleJpn", "TitleJpn"),
                ("uploader", "Uploader"),
                ("ratingCount", "RatingCount"),
                ("posted", "Posted"),
                ("category", "Category"),
                ("language", "Language"),
                ("rating", "Rating"),
                ("fileCount", "FileCount"),
                ("fileSize", "FileSize"),
                ("artists", "Artists"),
                ("groups", "Groups"),
                ("allTags", "AllTags"),
            ]
            for meta_key, col in field_map:
                meta_val = meta.get(meta_key)
                db_val = db_record.get(col)

                # 比较
                if meta_key in ("artists", "groups", "allTags"):
                    # JSON 字段比较
                    try:
                        a = json.loads(str(meta_val)) if isinstance(meta_val, str) else meta_val
                        b = json.loads(str(db_val or "[]")) if isinstance(db_val, str) else (db_val or [])
                    except:
                        a = meta_val
                        b = db_val
                    if a != b:
                        needs_update = True
                        gaps.append(col)
                elif meta_key == "downloadedAt":
                    # 跳过下载时间比较
                    pass
                else:
                    # 数值或字符串比较
                    if meta_val is not None and db_val is not None:
                        if isinstance(meta_val, float) and isinstance(db_val, (int, float)):
                            if abs(meta_val - db_val) > 0.01:
                                needs_update = True
                                gaps.append(col)
                        elif str(meta_val) != str(db_val):
                            needs_update = True
                            gaps.append(col)
                    elif meta_val is not None and db_val is None:
                        needs_update = True
                        gaps.append(col)

            if gaps:
                report.gaps.append({
                    "gid": gid,
                    "title": folder_name,
                    "missing": gaps,
                })

        # 专辑匹配
        album_matched = None
        if gid not in total_gids_assigned:
            # 获取作品的 simple 标签（artists + groups）
            artists = json.loads(meta["artists"])
            groups = json.loads(meta["groups"])
            simple_tags = artists + groups
            album_matched = match_album(all_tags, albums, simple_tags)
            if album_matched and album_matched not in total_gids_assigned:
                total_gids_assigned.add(gid)

        # ======== 写入数据库 ========
        if DRY_RUN:
            if needs_create:
                report.created += 1
            elif needs_update:
                report.updated += 1
            else:
                report.unchanged += 1
            if album_matched:
                report.album_matched += 1
                report.album_match_gids.append({
                    "gid": gid,
                    "album_key": album_matched,
                    "album_name": albums[album_matched]["name"],
                })
        else:
            if needs_create:
                try:
                    conn.execute("""
                        INSERT INTO local_gallery (Gid, Title, DirPath, Category, Language, Rating,
                            FileCount, FileSize, Artists, Groups, AllTags, TitleJpn, Uploader,
                            RatingCount, Posted, LastModified, SyncedAt)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """, (
                        gid, folder_name.split("-", 1)[1] if "-" in folder_name else folder_name,
                        full_path.replace("\\", "/"),
                        meta["category"], meta["language"], meta["rating"],
                        meta["fileCount"], meta["fileSize"],
                        meta["artists"], meta["groups"], meta["allTags"],
                        meta["titleJpn"] or None, meta["uploader"] or None,
                        meta["ratingCount"] or 0, meta["posted"] or 0,
                        datetime.utcnow().isoformat(), datetime.utcnow().isoformat()
                    ))
                    report.created += 1
                except Exception as e:
                    report.errors.append(f"GID={gid} 创建失败: {e}")

            elif needs_update:
                try:
                    conn.execute("""
                        UPDATE local_gallery SET
                            TitleJpn=?, Uploader=?, RatingCount=?, Posted=?,
                            Category=?, Language=?, Rating=?, FileCount=?, FileSize=?,
                            Artists=?, Groups=?, AllTags=?, LastModified=?, SyncedAt=?
                        WHERE Gid=?
                    """, (
                        meta["titleJpn"] or None, meta["uploader"] or None,
                        meta["ratingCount"] or 0, meta["posted"] or 0,
                        meta["category"], meta["language"], meta["rating"],
                        meta["fileCount"], meta["fileSize"],
                        meta["artists"], meta["groups"], meta["allTags"],
                        datetime.utcnow().isoformat(), datetime.utcnow().isoformat(),
                        gid
                    ))
                    report.updated += 1
                except Exception as e:
                    report.errors.append(f"GID={gid} 更新失败: {e}")

            else:
                report.unchanged += 1

            # 专辑分配
            if album_matched:
                album_info = albums[album_matched]
                new_gids = list(set(album_info["gids"] + [gid]))
                conn.execute(
                    "UPDATE album_config SET Gids=?, Count=? WHERE Key=?",
                    (json.dumps(new_gids), len(new_gids), album_matched)
                )
                conn.execute(
                    "UPDATE local_gallery SET AlbumKey=? WHERE Gid=?",
                    (album_matched, gid)
                )
                report.album_matched += 1
                report.album_match_gids.append({
                    "gid": gid,
                    "album_key": album_matched,
                    "album_name": album_info["name"],
                })

        # 进度输出
        if report.scanned % 100 == 0:
            print(f"  进度: {report.scanned}/{len(dirs)} | 新增 {report.created} | 更新 {report.updated} | 专辑匹配 {report.album_matched}")

    # 提交事务
    if not DRY_RUN:
        conn.commit()
        print(f"  💾 已提交数据库更改")
    else:
        print(f"  📋 DRY-RUN 模式，未实际写入数据库")

    report.print_summary()
    conn.close()


if __name__ == "__main__":
    main()