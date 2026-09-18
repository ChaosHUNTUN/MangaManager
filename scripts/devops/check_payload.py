#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""接口负载/压缩巡检

检查关键 JSON 接口的未压缩体积与实际压缩后体积（gzip / brotli），
用于发现"接口返回过大"或"响应压缩失效"这类性能回归。

用法：
    python scripts/devops/check_payload.py                 # 默认 http://127.0.0.1:5208
    python scripts/devops/check_payload.py --base http://127.0.0.1:18099
"""
import argparse
import urllib.request

DEFAULT_BASE = "http://127.0.0.1:5208"
TARGETS = [
    ("/api/local/galleries/meta", "侧边栏标签池"),
    ("/api/local/galleries/tag-stats", "标签统计"),
    ("/api/tag", "全量标签"),
    ("/health", "健康检查"),
]


def measure(base, path, encoding=None):
    req = urllib.request.Request(base + path)
    if encoding:
        req.add_header("Accept-Encoding", encoding)
    with urllib.request.urlopen(req, timeout=60) as r:
        data = r.read()
        enc = r.headers.get("Content-Encoding") or "未压缩"
    return len(data), enc


def main():
    ap = argparse.ArgumentParser(description="接口负载/压缩巡检")
    ap.add_argument("--base", default=DEFAULT_BASE, help="API 基地址")
    args = ap.parse_args()

    print(f"目标: {args.base}\n")
    print(f"{'接口':<24}{'未压缩':>10}{'gzip':>10}{'brotli':>10}   实际编码")
    for path, label in TARGETS:
        try:
            raw, _ = measure(args.base, path)
            gz, gz_enc = measure(args.base, path, "gzip")
            br, br_enc = measure(args.base, path, "br")
            print(f"{label:<24}{raw/1024:>8.0f}KB{gz/1024:>8.0f}KB{br/1024:>8.0f}KB   gzip→{gz_enc} / br→{br_enc}")
        except Exception as e:
            print(f"{label:<24}失败: {e}")


if __name__ == "__main__":
    main()
