"""
Apply @dnd-kit sortable to LocalGallery.jsx:
1. Add SortableGalleryCard component
2. Wrap grid with DndContext/SortableContext in sort mode
3. Implement handleDragEnd
4. Remove doSortDrop from useGalleryDrag in sort mode
"""
import re

path = "src/frontend/manga-ui/src/pages/LocalGallery.jsx"
c = open(path, encoding="utf-8").read()

# === 1. Add SortableGalleryCard component (after GalleryCard closing brace, before GalleryRow) ===
sortable_component = """
  // @dnd-kit 可排序画廊卡片包装器
  const SortableGalleryCard = ({ g, isSel }) => {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: g.gid })
    const style = {
      transform: CSS.Transform.toString(transform),
      transition,
      opacity: isDragging ? 0.5 : 1,
      zIndex: isDragging ? 10 : undefined,
    }
    return (
      <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
        <GalleryCard g={g} isSel={isSel} />
      </div>
    )
  }

"""
# Insert before "const GalleryRow"
c = c.replace("\n\n  const GalleryRow", sortable_component + "\n  const GalleryRow")

# === 2. Add handleDragEnd ===
# Insert after doSortDrop definition (before "// 拖拽 hook")
handle_drag_end = """
  // @dnd-kit 排序拖拽结束回调
  const handleDragEnd = useCallback((event) => {
    const { active, over } = event
    setActiveDragId(null)
    if (!over || active.id === over.id) return

    const oldIndex = paged.findIndex(g => g.gid === active.id)
    const newIndex = paged.findIndex(g => g.gid === over.id)
    if (oldIndex === -1 || newIndex === -1) return

    const newOrder = arrayMove(paged, oldIndex, newIndex)

    // 1) 即时本地更新
    setPageItems(newOrder)

    // 2) 后台静默持久化
    const albumKey = activeGroup.slice(6)
    const album = { ...albumConfig[albumKey] }
    if (!album) return
    const cfg = { ...albumConfig, [albumKey]: { ...album, order: newOrder.map(g => g.gid) } }
    albumConfigRef.current = cfg
    try { localStorage.setItem('local-albums', JSON.stringify(cfg)) } catch { }
    saveAlbumConfig(cfg).catch(e => { setToast('保存排序失败: ' + e.message) })

    setToast('排序已更新')
    setTimeout(() => setToast(null), 1500)
  }, [paged, activeGroup, albumConfig])

"""
c = c.replace("\n  // 拖拽 hook", handle_drag_end + "\n  // 拖拽 hook")

# === 3. Update useGalleryDrag call to disable sort mode (dnd-kit handles it now) ===
c = c.replace(
    "  const { dragGidRef, handleDragMouseDown } = useGalleryDrag({\n    isSortMode: isAlbumSortMode,\n    disabled: batchMode,\n    onDropToAlbum: doAlbumDrop,\n    onDropToSort: doSortDrop,",
    "  const { dragGidRef, handleDragMouseDown } = useGalleryDrag({\n    isSortMode: false, // dnd-kit 接管排序\n    disabled: batchMode || isAlbumSortMode,\n    onDropToAlbum: doAlbumDrop,\n    onDropToSort: doSortDrop,"
)

# === 4. Update grid rendering to use DndContext in sort mode ===
old_grid = """        {viewMode === 'grid' ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
            {paged.map(g => <GalleryCard key={g.gid} g={g} isSel={selected.has(g.gid)} />)}
          </div>
        ) : ("""

new_grid = """        {viewMode === 'grid' ? (
          isAlbumSortMode ? (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={(e) => setActiveDragId(e.active.id)} onDragEnd={handleDragEnd}>
              <SortableContext items={paged.map(g => g.gid)} strategy={verticalListSortingStrategy}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
                  {paged.map(g => <SortableGalleryCard key={g.gid} g={g} isSel={selected.has(g.gid)} />)}
                </div>
              </SortableContext>
              <DragOverlay>
                {activeDragId ? <GalleryCard g={paged.find(g => g.gid === activeDragId} isSel={selected.has(activeDragId)} /> : null}
              </DragOverlay>
            </DndContext>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
              {paged.map(g => <GalleryCard key={g.gid} g={g} isSel={selected.has(g.gid)} />)}
            </div>
          )
        ) : ("""

c = c.replace(old_grid, new_grid)

open(path, "w", encoding="utf-8").write(c)
print("Applied @dnd-kit sortable integration")