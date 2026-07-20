import time, requests, socket, sys

print("=== 1. DNS 连通性 ===")
targets = ['e-hentai.org', 'exhentai.org']
for host in targets:
    try:
        start = time.time()
        ip = socket.gethostbyname(host)
        dns_ms = (time.time() - start) * 1000
        print(f"  {host}: {ip} ({dns_ms:.0f}ms)")
    except Exception as e:
        print(f"  {host}: DNS 失败 - {e}")

print()
print("=== 2. HTTP 首字节延迟 ===")
for host in ['https://e-hentai.org', 'https://exhentai.org']:
    try:
        start = time.time()
        r = requests.get(host, timeout=10, headers={'User-Agent': 'Mozilla/5.0'})
        ttfb = (time.time() - start) * 1000
        print(f"  {host}: {r.status_code} TTFB={ttfb:.0f}ms")
    except Exception as e:
        print(f"  {host}: 失败 - {e}")

print()
print("=== 3. 单图下载速度 (3次取平均) ===")
test_urls = [
    'https://e-hentai.org/s/e9823f150e/4065171-1',
    'https://exhentai.org/s/e9823f150e/4065171-1',
]
for url in test_urls:
    speeds = []
    for i in range(3):
        try:
            start = time.time()
            r = requests.get(url, timeout=30, headers={
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
                'Referer': 'https://e-hentai.org/'
            })
            elapsed = time.time() - start
            size_kb = len(r.content) / 1024
            speed = size_kb / elapsed if elapsed > 0 else 0
            speeds.append(speed)
            print(f"  #{i+1}: {r.status_code} {size_kb:.0f}KB {elapsed:.1f}s ({speed:.0f} KB/s)")
        except Exception as e:
            print(f"  #{i+1}: 失败 - {e}")
    if speeds:
        avg = sum(speeds) / len(speeds)
        print(f"  平均: {avg:.0f} KB/s ≈ {avg/1024:.1f} MB/s")
    print()

print()
print("=== 4. 并发下载测试 ===")
import concurrent.futures
url = 'https://e-hentai.org/s/e9823f150e/4065171-1'
def download_one():
    start = time.time()
    r = requests.get(url, timeout=30, headers={'User-Agent': 'Mozilla/5.0'})
    return (time.time() - start), len(r.content)
with concurrent.futures.ThreadPoolExecutor(max_workers=3) as ex:
    futures = [ex.submit(download_one) for _ in range(3)]
    results = [f.result() for f in futures]
total_time = max(r[0] for r in results)
total_kb = sum(r[1] for r in results) / 1024
print(f"  3 并发: {total_kb:.0f}KB in {total_time:.1f}s ({total_kb/total_time:.0f} KB/s)")
