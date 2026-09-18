# -*- coding: utf-8 -*-
"""按 eslint 报告批量移除未使用的 import 说明符（仅处理单行 import）"""
import collections
import json
import os
import re
import subprocess

UI = os.path.join("src", "frontend", "manga-ui")
out = subprocess.run(["npx", "eslint", ".", "-f", "json"], cwd=UI, shell=True,
                     capture_output=True, text=True, encoding="utf-8", errors="replace")
data = json.loads(out.stdout or "[]")

# 收集 (相对路径, 行号) -> 未使用的变量名
targets = collections.defaultdict(set)
for f in data:
    rel = os.path.relpath(f["filePath"], UI)
    for m in f.get("messages", []):
        if m.get("ruleId") == "no-unused-vars" and m.get("severity") == 2:
            match = re.match(r"'(.+?)' is (?:defined|assigned a value) but never used", m["message"])
            if match:
                targets[(rel, m["line"])].add(match.group(1))

changed_files = set()
manual = []

for (rel, line), names in sorted(targets.items()):
    path = os.path.join(UI, rel)
    with open(path, encoding="utf-8") as fh:
        lines = fh.readlines()
    idx = line - 1
    if idx >= len(lines):
        continue
    src = lines[idx]
    if not src.lstrip().startswith("import "):
        manual.append(f"{rel}:{line}  {sorted(names)}  (非 import 行，需人工处理)")
        continue

    original = src
    # 默认导入：import React from 'react'
    for name in names:
        src = re.sub(rf"\b{re.escape(name)}\s*,\s*", "", src, count=1)
        src = re.sub(rf",\s*\b{re.escape(name)}\b", "", src, count=1)
        src = re.sub(rf"\b{re.escape(name)}\b", "", src, count=1)
    # 清理空的花括号 import { } from 'x'
    src = re.sub(r"import\s*\{\s*\}\s*from", "import", src)
    src = re.sub(r"import\s+from\s+'", "import '", src)
    src = re.sub(r"\s{2,}", " ", src)

    if src.strip() in ("", "import"):
        lines[idx] = ""
    elif src.lstrip().startswith("import '") and original.lstrip().startswith("import "):
        # 变成副作用导入：若无其他说明符则整行删除更干净
        lines[idx] = ""
    else:
        lines[idx] = src
    with open(path, "w", encoding="utf-8") as fh:
        fh.writelines(lines)
    changed_files.add(rel)

print(f"处理文件 {len(changed_files)} 个，修改说明符 {sum(len(v) for v in targets.values())} 处")
if manual:
    print("\n需人工处理：")
    for m in manual:
        print("  ", m)
