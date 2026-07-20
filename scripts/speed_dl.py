import requests, time, concurrent.futures

urls = [
    "https://e-hentai.org/s/e9823f150e/4065171-1",
    "https://exhentai.org/s/e9823f150e/4065171-1",
]

headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"}

for url in urls:
    print(f"测试: {url}")
    # 并发下载 5 次
    def dl():
        start = time.time()
        r = requests.get(url, timeout=30, headers=headers)
        return time.time() - start, len(r.content)

    with concurrent.futures.ThreadPoolExecutor(max_workers=5) as ex:
        results = [ex.submit(dl) for _ in range(5)]
        times = []
        sizes = []
        for f in concurrent.futures.as_completed(results):
            t, s = f.result()
            times.append(t)
            sizes.append(s)
            print(f"  {t:.1f}s {s/1024:.0f}KB")

    total_kb = sum(sizes) / 1024
    total_time = max(times)
    print(f"  5并发合计: {total_kb:.0f}KB {total_time:.1f}s = {total_kb/total_time:.0f} KB/s")
    print()

# 测大文件
print("=== 大图测试 (翻页后的原图) ===")
import re, json
cookie_file = r"D:\MangaManager\src\backend\MangaManager.Api\ehentai_cookies.json"
try:
    with open(cookie_file) as f:
        cookies = json.load(f)
    cookie_str = f"ipb_member_id={cookies['ipb_member_id']}; ipb_pass_hash={cookies['ipb_pass_hash']}"
    if cookies.get('igneous'): cookie_str += f"; igneous={cookies['igneous']}"

    # 先获取真实图片 URL
    r = requests.get("https://exhentai.org/s/e9823f150e/4065171-1", headers={"User-Agent": "Mozilla/5.0", "Cookie": cookie_str}, timeout=15)
    img_match = re.search(r'<img[^>]+src="([^"]+)"[^>]*id="img"', r.text)
    if img_match:
        img_url = img_match.group(1)
        print(f"原图URL: {img_url}")
        start = time.time()
        r2 = requests.get(img_url, timeout=60, headers={"User-Agent": "Mozilla/5.0", "Referer": "https://exhentai.org/"})
        elapsed = time.time() - start
        print(f"原图下载: {len(r2.content)/1024:.0f}KB {elapsed:.1f}s = {len(r2.content)/1024/elapsed:.0f} KB/s")
    else:
        print("未找到原图URL")
except Exception as e:
    print(f"大图测试失败: {e}")
