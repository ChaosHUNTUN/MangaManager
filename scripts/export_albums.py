import sqlite3, json, os, csv, sys

candidates = [
    os.path.join(os.path.dirname(__file__), "..", "src", "backend", "MangaManager.Api", "manga.db"),
    os.path.join(os.path.dirname(__file__), "..", "src", "backend", "MangaManager.Api", "bin", "Debug", "net9.0", "manga.db"),
]
db = next((c for c in candidates if os.path.exists(c)), None)
if not db:
    print("DB not found"); sys.exit(1)

conn = sqlite3.connect(db)
conn.row_factory = sqlite3.Row
rows = conn.execute("SELECT Key, Name FROM album_config ORDER BY Key").fetchall()

def is_cn(s):
    return any('\u4e00' <= c <= '\u9fff' for c in (s or ""))

# 输出 CSV 供批量翻译
mode = sys.argv[1] if len(sys.argv) > 1 else "export"

if mode == "export":
    with open("album_translate_export.csv", "w", encoding="utf-8-sig", newline="") as f:
        w = csv.writer(f)
        w.writerow(["Key", "CurrentName", "NewName"])
        for r in rows:
            if not is_cn(r['Name']):
                w.writerow([r['Key'], r['Name'], ""])
    print("导出: album_translate_export.csv (请填写 NewName 列)")

elif mode == "import":
    updated = 0
    with open("album_translate_import.csv", "r", encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        for row in reader:
            new_name = (row.get("NewName") or "").strip()
            if new_name:
                conn.execute("UPDATE album_config SET Name = ? WHERE Key = ?", [new_name, row["Key"]])
                updated += 1
    conn.commit()
    print(f"已更新 {updated} 个专辑名称")

else:
    print("用法: python export_albums.py export|import")
    print("  export → 导出未汉化专辑到 CSV")
    print("  import → 从 CSV 导入翻译后名称")

conn.close()
