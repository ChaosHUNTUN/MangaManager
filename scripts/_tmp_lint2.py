# -*- coding: utf-8 -*-
"""eslint 结果分组（临时工具）"""
import collections
import json
import os
import subprocess

UI = os.path.join("src", "frontend", "manga-ui")
out = subprocess.run(["npx", "eslint", ".", "-f", "json"], cwd=UI, shell=True,
                     capture_output=True, text=True, encoding="utf-8", errors="replace")
data = json.loads(out.stdout or "[]")

byrule = collections.Counter()
files = collections.defaultdict(list)
for f in data:
    path = f["filePath"].split("manga-ui")[-1].lstrip("\\/")
    for m in f.get("messages", []):
        if m.get("severity") == 2:
            byrule[m["ruleId"]] += 1
            files[m["ruleId"]].append(f"{path}:{m['line']}")

for rule, count in byrule.most_common():
    print(f"{count:>4}  {rule}")
    if rule == "no-unused-vars":
        continue
    for x in files[rule][:25]:
        print("        ", x)
