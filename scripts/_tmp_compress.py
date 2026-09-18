# -*- coding: utf-8 -*-
"""对比：不压缩 vs gzip vs brotli 的实际传输体积"""
import urllib.request

API = "http://127.0.0.1:5208"
TARGETS = [
    ("/api/local/galleries/meta", "侧边栏标签池"),
    ("/api/local/galleries/tag-stats", "标签统计"),
    ("/api/tag", "全量标签"),
]


def size(path, encoding=None):
    req = urllib.request.Request(API + path)
    if encoding:
        req.add_header("Accept-Encoding", encoding)
    with urllib.request.urlopen(req, timeout=60) as r:
        raw = r.read()
        enc = r.headers.get("Content-Encoding") or "(未压缩)"
    return len(raw), enc


print(f"{'接口':<16}{'未压缩':>10}{'gzip':>10}{'brotli':>10}   实际编码")
for path, label in TARGETS:
    raw, _ = size(path)
    gz, gzenc = size(path, "gzip")
    br, prenc = size(path, "br")
    print(f"{label:<16}{raw/1024:>8.0f}KB{gz/1024:>8.0f}KB{br/1024:>8.0f}KB   gzip→{gzenc} / br→{prenc}")
