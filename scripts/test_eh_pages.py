"""
测试 EH 页面解析器 — 手动请求一个画廊页面，查看 HTML 中的缩略图链接格式
用法: python scripts/test_eh_pages.py <gid> <token>
"""
import requests, re, sys, os

if len(sys.argv) < 3:
    print("用法: python test_eh_pages.py <gid> <token>")
    sys.exit(1)

gid, token = sys.argv[1], sys.argv[2]

# 读取 cookie
cookie_file = os.path.join(os.path.dirname(__file__), "..", "src", "backend", "MangaManager.Api", "ehentai_cookies.json")
if not os.path.exists(cookie_file):
    cookie_file = os.path.join(os.path.dirname(__file__), "..", "src", "backend", "MangaManager.Api", "bin", "Debug", "net9.0", "ehentai_cookies.json")

import json
with open(cookie_file) as f:
    cookies = json.load(f)

cookie_str = f"ipb_member_id={cookies['ipb_member_id']}; ipb_pass_hash={cookies['ipb_pass_hash']}"
if cookies.get('igneous'):
    cookie_str += f"; igneous={cookies['igneous']}"

headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Cookie": cookie_str,
}

# 先尝试 exhentai，失败则用 e-hentai
for base in ["https://exhentai.org", "https://e-hentai.org"]:
    url = f"{base}/g/{gid}/{token}/"
    print(f"请求: {url}")
    r = requests.get(url, headers=headers, timeout=15)
    if r.status_code == 200 and "Gallery not found" not in r.text[:100]:
        break
    print(f"  失败，尝试下一个...")
print(f"请求: {url}")
r = requests.get(url, headers=headers, timeout=15)
print(f"状态码: {r.status_code}")
html = r.text

# 测试各种正则
patterns = {
    "模式1 (标准 /s/ href)": r'<a\s+href="([^"]*?/s/[0-9a-f]{10}/\d+-\d+)"',
    "模式2 (宽松 /s/ href)": r'href="(?:https?://[^/]+)?(/s/([0-9a-f]{10})/(\d+)-(\d+))"',
    "模式3 (data-src/src)": r'(?:data-src|src)="([^"]*?/s/[0-9a-f]{10}/\d+-\d+)"',
    "所有 /s/ 链接": r'/s/[0-9a-f]{10}/\d+-\d+',
}

for name, pattern in patterns.items():
    matches = re.findall(pattern, html, re.I)
    count = len(matches)
    print(f"\n{name}: {count} 个匹配")
    if count > 0 and count <= 5:
        for m in matches[:5]:
            print(f"  {m}")

# 如果没有匹配，输出 HTML 片段
total = sum(len(re.findall(p, html, re.I)) for p in patterns.values())
if total == 0:
    print("\n⚠️ 所有正则均无匹配！HTML 前 1000 字符:")
    print(html[:1000])
