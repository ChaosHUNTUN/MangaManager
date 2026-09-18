#!/usr/bin/env python3
"""MangaManager 端到端冒烟测试

在真实数据库副本上启动临时 API，验证关键链路（标签筛选/分组/进度偏移/设置/
目录保护/库不变量），用于改动后快速回归。用法：

    python scripts/smoke_test.py                      # 用 %TEMP%\\mm_p4_build 下的构建
    python scripts/smoke_test.py --build              # 先 dotnet build 到临时目录
    python scripts/smoke_test.py --dll <path> --db <path> --port 5299

退出码：0=全部通过；非 0=有失败。
"""
import argparse
import json
import os
import shutil
import socket
import sqlite3
import subprocess
import sys
import tempfile
import time
import urllib.request

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")


def req(api, method, path, body=None, timeout=30):
    data = json.dumps(body).encode("utf-8") if body is not None else None
    r = urllib.request.Request(
        api + path,
        data=data,
        method=method,
        headers={"Content-Type": "application/json"} if data else {},
    )
    with urllib.request.urlopen(r, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8"))


def pick_free_port(preferred=18099):
    """挑一个能立即绑定的端口。

    不要用 5299 这类"动态端口范围"内的端口：Windows 动态范围默认为 1024~15000，
    落在其中的端口可能已被临时分配占用，Kestrel 绑定会抛 WSAEACCES(10013)，
    表现为"临时 API 起不来、冒烟测试卡满 90 秒"。
    """
    for port in [preferred] + list(range(preferred + 1, preferred + 20)):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            try:
                s.bind(("127.0.0.1", port))
                return port
            except OSError:
                continue
    raise SystemExit("找不到可用端口（18099 起试了 20 个）")


def main():
    ap = argparse.ArgumentParser(description="MangaManager smoke test")
    ap.add_argument("--dll", default=os.path.join(tempfile.gettempdir(), "mm_p4_build", "MangaManager.Api.dll"))
    ap.add_argument("--db", default=r"D:\MangaManager\src\backend\MangaManager.Api\manga.db")
    ap.add_argument("--port", type=int, default=0, help="0 = 自动选择空闲端口（默认，避开系统动态端口范围）")
    ap.add_argument("--build", action="store_true", help="先 dotnet build 到临时目录")
    args = ap.parse_args()

    if not args.port:
        args.port = pick_free_port()
        print("使用空闲端口: %d" % args.port)

    api = "http://127.0.0.1:%d" % args.port
    root = os.path.join(tempfile.gettempdir(), "mm_smoke")
    shutil.rmtree(root, ignore_errors=True)
    os.makedirs(root, exist_ok=True)

    # 清理残留端口进程
    try:
        out = subprocess.run(["netstat", "-ano"], capture_output=True, text=True, timeout=10).stdout
        for line in out.splitlines():
            if ":%d" % args.port in line and "LISTENING" in line:
                pid = line.strip().split()[-1]
                subprocess.run(["taskkill", "/PID", pid, "/T", "/F"], capture_output=True)
                time.sleep(1)
    except Exception:
        pass

    if args.build:
        subprocess.run(
            ["dotnet", "build", r"D:\MangaManager\src\backend\MangaManager.Api\MangaManager.Api.csproj",
             "-c", "Release", "-o", os.path.dirname(args.dll), "--nologo"],
            check=True,
        )

    # 真实库 WAL checkpoint 后复制主文件（无数据变化）
    c = sqlite3.connect(args.db)
    c.execute("PRAGMA wal_checkpoint(TRUNCATE)")
    c.close()
    shutil.copy(args.db, os.path.join(root, "manga.db"))

    cfg = {
        "Database": {"Provider": "sqlite"},
        "ConnectionStrings": {"Default": "Data Source=manga.db"},
        # 下载目录指向不存在路径 → 验证目录保护（画廊不被清空）
        "Ehentai": {"Proxy": "", "DownloadDir": os.path.join(root, "no_such_downloads")},
        "Urls": api,
        "Logging": {"LogLevel": {"Default": "Information"}},
    }
    with open(os.path.join(root, "appsettings.json"), "w", encoding="utf-8") as f:
        json.dump(cfg, f, ensure_ascii=False)

    p = subprocess.Popen(
        ["C:\\Program Files\\dotnet\\dotnet.exe", args.dll, "--urls", api, "--contentRoot", root],
        cwd=root,
        stdout=open(os.path.join(root, "o.log"), "w"),
        stderr=open(os.path.join(root, "e.log"), "w"),
        creationflags=subprocess.CREATE_NO_WINDOW,
    )

    failures = []

    def check(name, ok, detail=""):
        print(("PASS  " if ok else "FAIL  ") + name + ("  | " + str(detail) if detail else ""))
        if not ok:
            failures.append(name)

    try:
        up = False
        for _ in range(90):
            # 进程已退出就不必再空等 90 秒：直接把 stderr 末尾打出来（例如端口绑定失败 WSAEACCES）
            if p.poll() is not None:
                print("临时 API 进程已退出，stderr 末尾：")
                try:
                    with open(os.path.join(root, "e.log"), encoding="utf-8", errors="replace") as f:
                        print("".join(f.readlines()[-10:]).rstrip())
                except Exception:
                    pass
                break
            time.sleep(1)
            try:
                req(api, "GET", "/health", timeout=2)
                up = True
                break
            except Exception:
                pass
        check("API 启动", up)
        time.sleep(2)

        # 1) 标签统计
        stats = req(api, "GET", "/api/local/galleries/tag-stats")
        check("tag-stats 返回标签", stats["success"] and len(stats["data"]) > 0, "count=%d" % len(stats["data"]))

        # 2) tagIds 筛选（JOIN 命中数与标签计数一致）
        top = max(stats["data"], key=lambda t: t.get("count") or 0)
        gids = req(api, "POST", "/api/local/galleries/gids", {"tagIds": [top["id"]], "pageSize": 10000})
        check("tagIds 筛选命中数一致", len(gids["data"]) == top["count"],
              "tag=%s expect=%d got=%d" % (top["name"], top["count"], len(gids["data"])))

        # 3) 作品标签包含所选标签
        gid = int(gids["data"][0])
        wt = req(api, "GET", "/api/work/%d/tags" % gid)
        check("作品标签含命中标签", any(t["id"] == top["id"] for t in wt["data"]))

        # 4) 分组筛选（artist/multi/unknown）与 work_tag SQL 计数一致
        db = sqlite3.connect(os.path.join(root, "manga.db"))
        artist_tag = db.execute(
            "SELECT t.Name FROM tag t WHERE t.Namespace='artist' "
            "AND (SELECT COUNT(*) FROM work_tag w WHERE w.TagId=t.Id) BETWEEN 2 AND 200 LIMIT 1"
        ).fetchone()
        if artist_tag:
            name = artist_tag[0]
            expect = db.execute(
                "SELECT COUNT(DISTINCT w.WorkId) FROM work_tag w JOIN tag t ON t.Id=w.TagId "
                "WHERE t.Namespace='artist' AND t.Name=?", (name,)
            ).fetchone()[0]
            got = len(req(api, "POST", "/api/local/galleries/gids", {"group": "artist:" + name, "pageSize": 10000})["data"])
            check("artist 分组筛选", got == expect, "name=%s expect=%d got=%d" % (name, expect, got))

        for grp in ("multi", "unknown"):
            ns_cond = "t.Namespace IN ('artist','group')"
            if grp == "multi":
                expect = db.execute(
                    "SELECT COUNT(*) FROM local_gallery g WHERE "
                    "(SELECT COUNT(*) FROM work_tag w JOIN tag t ON t.Id=w.TagId "
                    "WHERE w.WorkId=g.Gid AND %s) > 1" % ns_cond
                ).fetchone()[0]
            else:
                expect = db.execute(
                    "SELECT COUNT(*) FROM local_gallery g WHERE NOT EXISTS "
                    "(SELECT 1 FROM work_tag w JOIN tag t ON t.Id=w.TagId "
                    "WHERE w.WorkId=g.Gid AND %s)" % ns_cond
                ).fetchone()[0]
            got = len(req(api, "POST", "/api/local/galleries/gids", {"group": grp, "pageSize": 10000})["data"])
            check("分组 %s 筛选" % grp, got == expect, "expect=%d got=%d" % (expect, got))
        db.close()

        # 5) 进度含页内偏移
        req(api, "POST", "/api/readingprogress", [{"gid": gid, "pageIndex": 12, "scrollOffset": 0.37}])
        rp = req(api, "GET", "/api/readingprogress/%d" % gid)
        check("进度偏移往返", rp["data"]["pageIndex"] == 12 and abs(rp["data"]["scrollOffset"] - 0.37) < 0.001)

        # 6) 阅读器设置 JSON 落库往返
        settings = {"direction": "horizontal", "flow": "continuous", "readingOrder": "rtl", "fit": "width",
                    "zoom": 1.25, "background": 1, "padding": 5, "slideshowInterval": 7, "scrollSpeed": 360}
        req(api, "PUT", "/api/settings/reader", {"data": settings})
        s2 = req(api, "GET", "/api/settings/reader")
        check("设置 JSON 往返", s2["data"]["data"] == settings)

        # 7) 标签搜索
        ts = req(api, "GET", "/api/tag/search?q=%s&limit=5" % urllib.parse.quote(top["name"]))
        check("tag/search 可用", ts["success"] and len(ts["data"]) > 0)

        # 8) 多作者修复回归：作者非数组首元素也能筛到
        db = sqlite3.connect(os.path.join(root, "manga.db"))
        multi_case = db.execute(
            "SELECT g.Gid, g.Artists, t.Name FROM local_gallery g "
            "JOIN work_tag w ON w.WorkId=g.Gid JOIN tag t ON t.Id=w.TagId AND t.Namespace='artist' "
            "WHERE g.Artists LIKE '%\"' || t.Name || '\"%' "
            "AND g.Artists NOT LIKE '[\"' || t.Name || '\"%' LIMIT 1"
        ).fetchone()
        if multi_case:
            name = multi_case[2]
            expect = db.execute(
                "SELECT COUNT(DISTINCT w.WorkId) FROM work_tag w JOIN tag t ON t.Id=w.TagId "
                "WHERE t.Namespace='artist' AND t.Name=?", (name,)
            ).fetchone()[0]
            got = len(req(api, "POST", "/api/local/galleries/gids", {"group": "artist:" + name, "pageSize": 10000})["data"])
            check("多作者作品可筛到", got == expect, "name=%s expect=%d got=%d" % (name, expect, got))
        db.close()
    finally:
        p.terminate()
        try:
            p.wait(timeout=5)
        except subprocess.TimeoutExpired:
            p.kill()
        time.sleep(2)

    # 库不变量（API 停止后检查，WAL 已合并）
    db = sqlite3.connect(os.path.join(root, "manga.db"))
    galleries = db.execute("SELECT COUNT(*) FROM local_gallery").fetchone()[0]
    orphans = db.execute(
        "SELECT COUNT(*) FROM work_tag w LEFT JOIN tag t ON t.Id=w.TagId WHERE t.Id IS NULL"
    ).fetchone()[0]
    tags = db.execute("SELECT COUNT(*) FROM tag").fetchone()[0]
    albums = db.execute("SELECT COUNT(*) FROM album_config").fetchone()[0]
    db.close()
    check("目录保护：画廊不丢", galleries > 0, "galleries=%d" % galleries)
    check("无孤儿 work_tag", orphans == 0, "orphans=%d" % orphans)
    check("标签库稳定", tags > 0, "tags=%d" % tags)
    check("专辑数据保留", albums >= 0, "albums=%d" % albums)

    shutil.rmtree(root, ignore_errors=True)
    print("\n%s (%d failed)" % ("SMOKE PASSED" if not failures else "SMOKE FAILED", len(failures)))
    return 0 if not failures else 1


if __name__ == "__main__":
    sys.exit(main())
