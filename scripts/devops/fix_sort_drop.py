"""Fix doSortDrop double render + remove debug logs"""
import re

path = "src/frontend/manga-ui/src/pages/LocalGallery.jsx"
c = open(path, encoding="utf-8").read()

# 1. Remove all [DEBUG] console.log lines
c = re.sub(r'\s*console\.log\("\[DEBUG\].+?\);\n?', '\n', c)

# 2. Fix doSortDrop: remove setPageItems, add loadPaged() call instead
# Old: ... setPageItems(prev => ...) \n\n    saveAlbums(cfg) ...
# New: ... saveAlbums(cfg); loadPaged(); ...

old_sort_drop = """    // 即时重排当前页数据，不等 API 返回
    const orderMap = new Map(filtered.map((id, i) => [id, i]))
    setPageItems(prev => [...prev].sort((a, b) => (orderMap.get(a.gid) ?? 9999) - (orderMap.get(b.gid) ?? 9999)))

    saveAlbums(cfg)"""

new_sort_drop = """    // 仅持久化，由 loadPaged 重新获取排序后的列表
    saveAlbums(cfg)
    loadPaged()"""

c = c.replace(old_sort_drop, new_sort_drop)

open(path, "w", encoding="utf-8").write(c)
print("Fixed doSortDrop + removed debug logs")