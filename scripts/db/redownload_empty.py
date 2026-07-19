"""从空目录的 .eh 文件提取 token，调用后端 API 触发重新下载

用法:
  python scripts/db/redownload_empty.py [--scan-dir "G:/学习资料/本子"] [--api-base http://localhost:5000] [--dry-run]
"""
import sqlite3
import os
import sys
import urllib.request
import urllib.error
import json
import time

SCAN_DIR = r"G:\学习资料\本子"
API_BASE = "http://localhost:5000"
DRY_RUN = "--dry-run" in sys.argv

for arg in sys.argv[1:]:
    if arg.startswith("--scan-dir="):
        SCAN_DIR = arg.split("=", 1)[1].strip('"')
    elif arg.startswith("--api-base="):
        API_BASE = arg.split("=", 1)[1].strip('"')

DB = os.path.join(os.path.dirname(__file__), "..", "..", "src", "backend", "MangaManager.Api", "manga.db")
IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp"}

# 从数据库加载现有记录（用于交叉引用）
conn = sqlite3.connect(DB)
conn.row_factory = sqlite3.Row
db_gids = {r["Gid"] for r in conn.execute("SELECT Gid FROM local_gallery").fetchall()}
conn.close()

empty = []

# 直接扫描文件系统（不依赖数据库中是否有记录）
if os.path.isdir(SCAN_DIR):
    for folder_name in os.listdir(SCAN_DIR):
        full_path = os.path.join(SCAN_DIR, folder_name)
        if not os.path.isdir(full_path):
            continue
        
        # 提取 GID
        dash = folder_name.find("-")
        if dash <= 0:
            continue
        gid_str = folder_name[:dash].strip()
        if not gid_str.isdigit():
            continue
        gid = int(gid_str)
        
        # 统计图片文件
        try:
            files = os.listdir(full_path)
        except:
            continue
        img_count = sum(1 for f in files if os.path.splitext(f)[1].lower() in IMAGE_EXTS)
        if img_count > 0:
            continue  # 有图片，跳过
        
        # 空目录：读取 .eh token
        eh_file = os.path.join(full_path, ".eh")
        token = None
        if os.path.isfile(eh_file):
            try:
                with open(eh_file, "r") as f:
                    for line in f:
                        if line.startswith("token="):
                            token = line[6:].strip()
                            break
            except:
                pass
        
        title = folder_name[dash + 1:] if dash + 1 < len(folder_name) else folder_name
        empty.append({
            "gid": gid,
            "title": title[:60],
            "dir": full_path,
            "token": token,
            "in_db": gid in db_gids,
        })
else:
    print(f"❌ 扫描目录不存在: {SCAN_DIR}")
    sys.exit(1)

print(f"发现 {len(empty)} 个空目录")
print(f"API: {API_BASE}/api/local/gallery/{{gid}}/redownload")
print(f"模式: {'预览 (DRY-RUN)' if DRY_RUN else '实际执行'}")
print()

success = 0
fail = 0
no_token = 0

for i, e in enumerate(empty):
    if not e["token"]:
        no_token += 1
        print(f"  ⚠️  GID={e['gid']} 无 token，跳过")
        continue

    title = e["title"].replace(" ", "%20").replace("/", "%2F").replace("&", "%26")[:100] if e["title"] else "unknown"
    url = f"{API_BASE}/api/local/gallery/{e['gid']}/redownload?title={title}&token={e['token']}"

    if DRY_RUN:
        print(f"  📋 GID={e['gid']} token=****{e['token'][-4:]} → {url}")
        success += 1
    else:
        try:
            req = urllib.request.Request(url, method="POST")
            with urllib.request.urlopen(req, timeout=5) as resp:
                data = json.loads(resp.read().decode())
                if data.get("success"):
                    print(f"  ✅ GID={e['gid']} 下载任务已提交")
                    success += 1
                else:
                    print(f"  ❌ GID={e['gid']} 失败: {data.get('message', '未知')}")
                    fail += 1
        except urllib.error.URLError as ex:
            print(f"  ❌ GID={e['gid']} 连接错误: {ex}")
            fail += 1
        except Exception as ex:
            print(f"  ❌ GID={e['gid']} 异常: {ex}")
            fail += 1

    # API 调用间隔
    if not DRY_RUN and (i + 1) % 20 == 0:
        time.sleep(0.5)

    if (i + 1) % 50 == 0:
        print(f"  进度: {i+1}/{len(empty)} | 成功 {success} | 失败 {fail} | 无token {no_token}")

print()
print("=" * 60)
print("完成")
print(f"  成功提交: {success}")
print(f"  失败:     {fail}")
print(f"  无 token: {no_token}")
if DRY_RUN:
    print("  📋 DRY-RUN 模式，未实际调用 API")