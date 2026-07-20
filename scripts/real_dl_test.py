import requests, re, json, time

cookie_file = r"D:\MangaManager\src\backend\MangaManager.Api\ehentai_cookies.json"
with open(cookie_file) as f:
    cookies = json.load(f)

cookie_str = f"ipb_member_id={cookies['ipb_member_id']}; ipb_pass_hash={cookies['ipb_pass_hash']}"
if cookies.get('igneous'): cookie_str += f"; igneous={cookies['igneous']}"

headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Cookie": cookie_str,
}

# 通过缩略页获取真实图片 URL
for host in ["https://exhentai.org", "https://e-hentai.org"]:
    url = f"{host}/s/e9823f150e/4065171-1"
    print(f"获取真实URL: {url}")
    r = requests.get(url, headers=headers, timeout=15)
    html = r.text

    # 找 <img id="img" src="...">
    m = re.search(r'<img[^>]+id="img"[^>]+src="([^"]+)"', html)
    if not m:
        # 尝试其他模式
        m = re.search(r'src="(https?://[^"]+/[^"]+)"[^>]*id="img"', html)
    if not m:
        # 输出调试信息
        snippet = html[html.find('<img'):html.find('<img')+300] if '<img' in html else html[:500]
        print(f"  未找到图片URL，HTML片段: {snippet[:200]}")
        continue

    img_url = m.group(1)
    print(f"  原图: {img_url}")

    # 下载原图测速
    start = time.time()
    r2 = requests.get(img_url, timeout=60, headers={**headers, "Referer": host + "/"})
    elapsed = time.time() - start
    size_mb = len(r2.content) / 1024 / 1024
    speed = size_mb / elapsed if elapsed > 0 else 0
    print(f"  原图下载: {size_mb:.2f}MB in {elapsed:.1f}s = {speed*1024:.0f} KB/s ({speed:.2f} MB/s)")
    print()
