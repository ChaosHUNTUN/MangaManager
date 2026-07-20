"""Add debug console.log to key functions in LocalGallery.jsx"""
c = open("src/frontend/manga-ui/src/pages/LocalGallery.jsx", encoding="utf-8").read()

# 1. loadMetas
c = c.replace(
    "const loadMetas = async () => {\n    setMetaLoading(true)",
    'const loadMetas = async () => {\n    console.log("[DEBUG] loadMetas called");\n    setMetaLoading(true)'
)

# 2. loadPaged
c = c.replace(
    "const loadPaged = useCallback(async (targetPage) => {\n    setPageItems([])",
    'const loadPaged = useCallback(async (targetPage) => {\n    console.log("[DEBUG] loadPaged called");\n    setPageItems([])'
)

# 3. saveAlbums
c = c.replace(
    "const saveAlbums = useCallback(async (cfg) => {\n    setAlbumConfig(cfg)",
    'const saveAlbums = useCallback(async (cfg) => {\n    console.log("[DEBUG] saveAlbums called");\n    setAlbumConfig(cfg)'
)

# 4. doSortDrop
c = c.replace(
    "const doSortDrop = useCallback((gid, targetGid) => {",
    'const doSortDrop = useCallback((gid, targetGid) => {\n    console.log("[DEBUG] doSortDrop called, gid=", gid, "target=", targetGid);'
)

# 5. Main filter/param change useEffect
c = c.replace(
    "useEffect(() => {\n    if (!albumsLoaded) return\n    if (randomMode) {",
    'useEffect(() => {\n    console.log("[DEBUG] main filter useEffect fired, deps:", {activeGroup,search,sortBy,pageSize,page,albumsLoaded,randomMode});\n    if (!albumsLoaded) return\n    if (randomMode) {'
)

open("src/frontend/manga-ui/src/pages/LocalGallery.jsx", "w", encoding="utf-8").write(c)
print("Debug logs added: loadMetas, loadPaged, saveAlbums, doSortDrop, main useEffect")