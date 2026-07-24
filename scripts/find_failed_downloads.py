import os, json, sqlite3

candidates = [
    os.path.join(os.path.dirname(__file__), "..", "src", "backend", "MangaManager.Api", "manga.db"),
    os.path.join(os.path.dirname(__file__), "..", "src", "backend", "MangaManager.Api", "bin", "Debug", "net9.0", "manga.db"),
]
db = next((c for c in candidates if os.path.exists(c)), None)
if not db:
    print("DB not found"); exit(1)

conn = sqlite3.connect(db)
r = conn.execute("SELECT DirPath FROM local_gallery LIMIT 1").fetchone()
if not r:
    print("local_gallery empty"); exit(1)

base = os.path.dirname(r[0])
print(f"扫描: {base}\n")

failed = []
for d in sorted(os.listdir(base)):
    path = os.path.join(base, d)
    if not os.path.isdir(path): continue

    has_eh = os.path.exists(os.path.join(path, ".eh"))
    has_meta = os.path.exists(os.path.join(path, ".meta.json"))
    files = [f for f in os.listdir(path) if not f.startswith('.')]
    images = [f for f in files if f.endswith(('.jpg', '.png', '.webp', '.gif', '.bmp'))]

    if len(images) == 0 and has_eh and has_meta:
        title = ""
        try:
            with open(os.path.join(path, ".meta.json"), encoding='utf-8') as f:
                title = json.load(f).get("title", "")
        except: pass
        gid = d.split('-', 1)[0] if '-' in d else ""

        failed.append({"gid": gid, "title": title})

print(f"=== 下载失败（只有 .eh + .meta.json，无图片）===")
print(f"共 {len(failed)} 个\n")
for f in failed:
    print(f"GID={f['gid']}  {f['title']}")

print(f"\n=== 纯标题列表 ({len([f for f in failed if f['title']])} 个) ===")
for f in failed:
    if f["title"]: print(f["title"])

try:
    import pyperclip
    titles = [f["title"] for f in failed if f["title"]]
    pyperclip.copy("\n".join(titles))
    print(f"\n✅ 已复制 {len(titles)} 个标题到剪贴板")
except: pass

conn.close()
