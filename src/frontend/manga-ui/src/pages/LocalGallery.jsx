import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { Link, useSearchParams, useNavigate } from 'react-router-dom'
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragOverlay } from '@dnd-kit/core'
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { fetchLocalGalleryMetas, fetchLocalGalleriesPaged, fetchLocalGalleriesRandom, fetchLocalGalleryGids, browseDirectory, saveAlbumConfig, fetchGalleryMetaTags, updateGalleryMetaTags, importLocalGallery, batchImportGalleries } from '../api'
import useGalleryDrag from '../hooks/useGalleryDrag'
import useGallerySearch from '../hooks/useGallerySearch'
import useGalleryOperations from '../hooks/useGalleryOperations'
import useAlbumConfig from '../hooks/useAlbumConfig'
import GalleryDetail from '../components/GalleryDetail'
import AlbumSidebar from '../components/AlbumSidebar'
import AlbumEditModal from '../components/AlbumEditModal'
import GalleryCard from '../components/GalleryCard'
import GalleryRow from '../components/GalleryRow'
import SortableGalleryCard from '../components/SortableGalleryCard'
import ScrollToTop from '../components/ScrollToTop'
import { IconGlobe, IconImport, IconBatch, IconRandom, IconTrash, IconRedownload, IconGrid, IconList, IconChevronLeft, IconChevronRight, IconSearch, IconFolder, IconEdit, IconEye, IconBook, IconClose, IconAlbum, IconDownload, IconGripDots } from '../components/Icons'
import { User, Users, FolderOpen, Save, Hash, CheckCircle, XCircle, Rocket } from 'lucide-react'
import { CATEGORY_COLORS } from '../components/GalleryCard'

const PAGE_OPTIONS = [20, 40, 60]
const SORT_OPTIONS = [
  { key: 'modified-desc', label: '最近修改' }, { key: 'modified-asc', label: '最早修改' },
  { key: 'title-asc', label: '标题 A-Z' }, { key: 'title-desc', label: '标题 Z-A' },
  { key: 'pages-desc', label: '页数最多' }, { key: 'pages-asc', label: '页数最少' },
  { key: 'size-desc', label: '大小最大' }, { key: 'size-asc', label: '大小最小' },
]

export default function LocalGallery() {
  const navigate = useNavigate()

  // ── 状态 ──
  const [galleryMetas, setGalleryMetas] = useState([])
  const [metaLoading, setMetaLoading] = useState(true)
  const [pageItems, setPageItems] = useState([])
  const [pageTotal, setPageTotal] = useState(0)
  const [pageTotalPages, setPageTotalPages] = useState(1)
  const [pageLoading, setPageLoading] = useState(true)
  const [error, setError] = useState(null)
  const [toasts, setToasts] = useState([])
  const toastIdRef = useRef(0)
  const toastTimersRef = useRef(new Set())
  useEffect(() => () => { toastTimersRef.current.forEach(id => clearTimeout(id)); toastTimersRef.current.clear() }, [])
  const setToast = (msg, duration = 2000) => {
    if (!msg) return
    const id = ++toastIdRef.current
    setToasts(prev => [...prev.slice(-2), { id, msg, key: id }])
    const tm = setTimeout(() => { toastTimersRef.current.delete(tm); setToasts(prev => prev.filter(t => t.id !== id)) }, duration)
    toastTimersRef.current.add(tm)
  }

  // ── URL 参数 ──
  const [searchParams, setSearchParams] = useSearchParams()
  const search = searchParams.get('q') || ''
  const sortBy = searchParams.get('sort') || 'modified-desc'
  const pageSize = parseInt(searchParams.get('size') || '20', 10)
  const page = parseInt(searchParams.get('p') || '1', 10)
  const viewMode = searchParams.get('view') || 'grid'
  const activeGroup = searchParams.get('group') || 'all'
  const randomMode = searchParams.get('random') === 'true'

  const updateParams = useCallback((updates) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev)
      if (!('random' in updates)) next.delete('random')
      Object.entries(updates).forEach(([k, v]) => {
        if (v === null || v === undefined || v === '' || v === 'all' || v === 'modified-desc' || v === 'grid' || v === 20 || v === 1) {
          next.delete(k)
        } else { next.set(k, String(v)) }
      })
      return next
    }, { replace: true })
  }, [setSearchParams])

  const setSearch = useCallback((v) => updateParams({ q: v || null }), [updateParams])
  const setPage = useCallback((v) => updateParams({ p: v === 1 ? null : v }), [updateParams])
  const setViewMode = useCallback((v) => updateParams({ view: v === 'grid' ? null : v }), [updateParams])

  // ── REMAINING COMPONENT STATE ──
  const searchInputRef = useRef(null)
  const [cursorPos, setCursorPos] = useState(0)
  const [showSearchSuggestions, setShowSearchSuggestions] = useState(false)

  // 专辑配置（Hook 封装）
  const { albumConfig, albumConfigRef, albumsLoaded, saveAlbums,
    albumSearch, setAlbumSearch, albumSort, setAlbumSort, albumModal, setAlbumModal,
    groups, gidToAlbum, getAlbumName,
    generateAlbumColor, convertGroupToAlbum,
    handleCreateAlbum, handleAlbumUpdated, handleDeleteAlbum,
  } = useAlbumConfig({ galleryMetas })

  const [editingAlbumKey, setEditingAlbumKey] = useState(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [sidebarPinned, setSidebarPinned] = useState(false)

  // 拖拽状态
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )
  const [activeDragId, setActiveDragId] = useState(null)
  const [dragGid, setDragGid] = useState(null)
  const [hoveredGid, setHoveredGid] = useState(null)
  const galleryScrollRef = useRef(null)

  const sidebarTimeoutRef = useRef(null)

  // 专辑配置加载、保存、分组、自动匹配 → useAlbumConfig Hook

  // ── 元数据流 ──
  const loadMetas = useCallback(async () => {
    setMetaLoading(true)
    try { setGalleryMetas(await fetchLocalGalleryMetas()) } catch (e) { setError(e.message) }
    setMetaLoading(false)
  }, [])
  useEffect(() => { loadMetas() }, [loadMetas])

  // ── 展示流（带竞态防护） ──
  const pagedAbortRef = useRef(null)
  const loadPaged = useCallback(async (targetPage) => {
    if (pagedAbortRef.current) pagedAbortRef.current.abort()
    const ctrl = new AbortController(); pagedAbortRef.current = ctrl
    setPageItems([]); setPageLoading(true)
    try {
      const p = targetPage ?? page
      const cfg = albumConfigRef.current
      const allAlbumGids = Object.values(cfg).flatMap(v => v.gids || [])
      let albumGids = null, albumOrder = null
      if (activeGroup.startsWith('album:')) {
        const album = cfg[activeGroup.slice(6)]
        if (album) { albumGids = album.gids || []; albumOrder = sortBy === 'custom' ? (album.order || album.gids) : null }
      }
      const result = await fetchLocalGalleriesPaged({ group: activeGroup, search, sort: sortBy, page: p, pageSize, albumGids: activeGroup.startsWith('album:') ? albumGids : allAlbumGids, albumOrder, signal: ctrl.signal })
      if (!ctrl.signal.aborted) {
        setPageItems(result.items || [])
        setPageTotal(result.total || 0)
        setPageTotalPages(result.totalPages || 1)
      }
    } catch (e) { if (e.name !== 'AbortError') setError(e.message) }
    if (!ctrl.signal.aborted) setPageLoading(false)
  }, [activeGroup, search, sortBy, pageSize, page])

  const RANDOM_CACHE_KEY = 'local-random-cache'
  const loadRandom = useCallback(async (forceRefresh = false) => {
    if (!forceRefresh) {
      try {
        const cached = JSON.parse(sessionStorage.getItem(RANDOM_CACHE_KEY))
        if (cached?.items?.length > 0) { setPageItems(cached.items); setPageTotal(cached.total || cached.items.length); setPageTotalPages(1); setPageLoading(false); return }
      } catch { }
    }
    if (pagedAbortRef.current) pagedAbortRef.current.abort()
    const ctrl = new AbortController(); pagedAbortRef.current = ctrl
    setPageItems([]); setPageLoading(true)
    try {
      const result = await fetchLocalGalleriesRandom(20, ctrl.signal)
      if (!ctrl.signal.aborted) {
        setPageItems(result.items || []); setPageTotal(result.total || 0); setPageTotalPages(result.totalPages || 1)
        try { sessionStorage.setItem(RANDOM_CACHE_KEY, JSON.stringify({ items: result.items, total: result.total, timestamp: Date.now() })) } catch { }
        updateParams({ group: null, q: null, sort: null, p: null, size: null, random: 'true' })
      }
    } catch (e) { if (e.name !== 'AbortError') setError(e.message) }
    if (!ctrl.signal.aborted) setPageLoading(false)
  }, [updateParams])

  useEffect(() => {
    if (!albumsLoaded) return
    if (randomMode) { loadRandom(); return }
    loadPaged(page)
  }, [activeGroup, search, sortBy, pageSize, page, albumsLoaded, randomMode])

  useEffect(() => {
    const handler = () => { loadMetas(); loadPaged() }
    window.addEventListener('local-gallery-auto-match', handler)
    return () => window.removeEventListener('local-gallery-auto-match', handler)
  }, [loadPaged])

  // 自动匹配 + 分组计算 → useAlbumConfig Hook

  // ── 搜索标签池 & 自动补全（Hook 封装） ──
  const { searchTagPool, searchTagTransMap, searchSuggestions, setSearchSuggestions, handleSearchInput, applySearchTag } = useGallerySearch({ galleryMetas, albumConfig, search, setSearch, cursorPos, setCursorPos, setToast })

  const totalPages = pageTotalPages; const safePage = Math.min(page, totalPages)
  const paged = pageItems; const isAlbumSortMode = activeGroup.startsWith('album:') && sortBy === 'custom'

  // ── 增删改操作（Hook 封装） ──
  const ops = useGalleryOperations({ galleryMetas, albumConfig, paged, pageTotal, activeGroup, search, sortBy, randomMode, loadMetas, loadPaged, setError, setToast })
  const { deleting, deleteConfirm, setDeleteConfirm, handleDelete,
    batchMode, setBatchMode, selected, setSelected,
    batchDeleteConfirm, setBatchDeleteConfirm, handleBatchDelete,
    batchRedownloadConfirm, setBatchRedownloadConfirm, handleBatchRedownload,
    detail, detailLoading, setDetail, tagTranslations, nsTranslations, handleOpenDetail,
    handleOpenReader,
    importModal, setImportModal, importForm, setImportForm, importing, importDirBrowser, setImportDirBrowser, handleBrowseImport, handleImport,
    batchImportModal, setBatchImportModal, batchImportForm, setBatchImportForm, batchImporting, batchImportResult, setBatchImportResult, handleBatchImport,
    editTagsModal, setEditTagsModal, editTagsForm, setEditTagsForm, editTagsSaving, loadEditTags, saveEditTags } = ops

  // ── 卡片交互（组件的轻量逻辑） ──
  const handleCardClick = useCallback((g) => {
    if (batchMode) { setSelected(prev => { const s = new Set(prev); s.has(g.gid) ? s.delete(g.gid) : s.add(g.gid); return s }) }
    else { setHoveredGid(prev => prev === g.gid ? null : g.gid) }
  }, [batchMode])

  const ALBUM_PALETTE = ['#c06060', '#c08050', '#b0a050', '#60a060', '#70a050', '#5070a0', '#8050a0', '#c06080', '#907050', '#607080', '#50a0a0', '#70a0a0']

  const doAlbumDrop = useCallback((gid, albumKey) => {
    const cfg = { ...albumConfig }
    Object.keys(cfg).forEach(k => { if (cfg[k]) { cfg[k] = { ...cfg[k], gids: cfg[k].gids.filter(id => id !== gid), order: cfg[k].order ? cfg[k].order.filter(id => id !== gid) : undefined } } })
    if (!cfg[albumKey]) {
      const used = new Set(Object.values(cfg).map(v => v.color).filter(Boolean))
      let color = null; for (const c of ALBUM_PALETTE) { if (!used.has(c)) { color = c; break } }
      if (!color) color = '#' + Math.floor(Math.random() * 0xFFFFFF).toString(16).padStart(6, '0')
      cfg[albumKey] = { name: albumKey, color, gids: [], order: [] }
    }
    cfg[albumKey] = { ...cfg[albumKey], gids: [...cfg[albumKey].gids.filter(id => id !== gid), gid] }
    if (cfg[albumKey].order) cfg[albumKey].order = [...cfg[albumKey].order.filter(id => id !== gid), gid]
    saveAlbums(cfg); setToast(`已移动到 "${cfg[albumKey]?.name || albumKey}"`)
  }, [albumConfig, saveAlbums])

  const handleDragEnd = useCallback((event) => {
    const { active, over } = event; setActiveDragId(null)
    if (!over || active.id === over.id) return
    const oi = paged.findIndex(g => g.gid === active.id); const ni = paged.findIndex(g => g.gid === over.id)
    if (oi === -1 || ni === -1) return
    const no = arrayMove(paged, oi, ni); setPageItems(no)
    const ak = activeGroup.slice(6); const al = { ...albumConfig[ak] }; if (!al) return
    const cfg = { ...albumConfig, [ak]: { ...al, order: no.map(g => g.gid) } }
    albumConfigRef.current = cfg
    try { localStorage.setItem('local-albums', JSON.stringify(cfg)) } catch { }
    saveAlbumConfig(cfg).catch(e => { setToast('保存排序失败: ' + e.message) })
    setToast('排序已更新')
  }, [paged, activeGroup, albumConfig])

  const isInAlbum = activeGroup.startsWith('album:')

  const { dragGidRef, handleDragMouseDown } = useGalleryDrag({
    isSortMode: false, disabled: batchMode || isInAlbum,
    onDropToAlbum: doAlbumDrop, onDropToSort: () => {},
    onDragStart: (gid) => setDragGid(gid), onDragEnd: () => setDragGid(null),
    onToast: (msg) => setToast(msg)
  })

  const sidebarEnter = () => { if (sidebarTimeoutRef.current) clearTimeout(sidebarTimeoutRef.current); setSidebarOpen(true) }
  const sidebarLeave = () => { sidebarTimeoutRef.current = setTimeout(() => setSidebarOpen(false), 400) }
  const sidebarDragOver = (e) => { e.preventDefault(); sidebarEnter() }

  // ── 分页 ──
  const renderPagination = () => {
    if (totalPages <= 1) return null
    const pages = []; const s = Math.max(1, safePage - 2); const e = Math.min(totalPages, safePage + 2)
    for (let i = s; i <= e; i++) pages.push(i)
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 'var(--space-1)', marginTop: 'var(--space-5)' }}>
        <button className="btn-sm" disabled={safePage <= 1} onClick={() => setPage(safePage - 1)}>«</button>
        {s > 1 && <><button className="btn-sm" onClick={() => setPage(1)}>1</button><span style={{ color: 'var(--text-muted)' }}>…</span></>}
        {pages.map(p => <button key={p} className="btn-sm" onClick={() => setPage(p)} style={p === safePage ? { borderColor: 'var(--accent-border)', color: 'var(--accent)', background: 'var(--accent-bg)' } : {}}>{p}</button>)}
        {e < totalPages && <><span style={{ color: 'var(--text-muted)' }}>…</span><button className="btn-sm" onClick={() => setPage(totalPages)}>{totalPages}</button></>}
        <button className="btn-sm" disabled={safePage >= totalPages} onClick={() => setPage(safePage + 1)}>»</button>
      </div>
    )
  }

  const renderGroupTag = (grp) => {
    const isActive = activeGroup === grp.key
    const icon = grp.type === 'artist' ? <User size={13} /> : grp.type === 'group' ? <Users size={13} /> : grp.type === 'multi' ? <Users size={13} /> : <FolderOpen size={13} />
    return (
      <span key={grp.key} style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
        <button className="btn-sm" onClick={() => updateParams({ group: grp.key === 'all' ? null : grp.key, p: null })}
          style={{ borderColor: isActive ? 'var(--accent-border)' : 'var(--border-input)', color: isActive ? 'var(--accent)' : 'var(--text-secondary)', background: isActive ? 'var(--accent-bg)' : 'transparent' }}>
          {icon} {grp.name} ({grp.count})
        </button>
      </span>
    )
  }

  // 包装 Hook 函数 + 组件特有逻辑（toast/URL 参数）
  const handleConvertGroupToAlbum = (grp) => {
    const result = convertGroupToAlbum(grp)
    if (result) setToast(`已转换 "${result.name}" (${result.count} 部) 为专辑`)
  }
  const handleCreateAlbumWithNav = (name) => {
    handleCreateAlbum(name); updateParams({ group: `album:${name}`, p: null, sort: 'custom' })
  }
  const handleSelectGroup = (key) => { updateParams({ group: key === 'all' ? null : key, p: null, sort: key.startsWith('album:') ? 'custom' : null }) }

  // ═══════════════════════════════════════════
  // 渲染
  // ═══════════════════════════════════════════
  return (
    <div className="container" style={{ display: 'flex', gap: 0, padding: 0, height: '100dvh', overflow: 'hidden' }}>
      {/* 侧边栏 */}
      <AlbumSidebar
        sidebarOpen={sidebarOpen} groups={groups} activeGroup={activeGroup}
        albumConfig={albumConfig} dragGid={dragGid}
        albumSearch={albumSearch} albumSort={albumSort}
        onSelectGroup={handleSelectGroup} onCreateAlbum={handleCreateAlbumWithNav}
        onEditAlbum={setEditingAlbumKey} onDeleteAlbum={handleDeleteAlbum}

        onAlbumSearchChange={setAlbumSearch} onAlbumSortChange={setAlbumSort}
        onConvertToAlbum={handleConvertGroupToAlbum}
        onMouseEnter={sidebarEnter} onMouseLeave={sidebarLeave}
        onDragOver={sidebarDragOver} pinned={sidebarPinned}
        onTogglePin={() => setSidebarPinned(p => !p)} onClose={() => setSidebarOpen(false)}
      />

      {/* 主内容区 */}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', height: '100dvh', overflow: 'hidden' }}>
        {/* ── 紧凑顶栏 ── */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 'var(--space-3)',
          padding: '0 var(--space-4)', height: 'var(--header-height)',
          background: 'var(--surface)', borderBottom: '1px solid var(--divider)',
          flexShrink: 0,
        }}>
          {/* 左侧：Logo + 标题 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexShrink: 0 }}>
            <Link to="/ehentai" className="btn-sm" style={{ textDecoration: 'none', borderColor: 'var(--accent-teal-bg)', color: 'var(--accent-teal)', fontWeight: 'var(--weight-semibold)' }}><IconGlobe size={14} /> 在线</Link>
            <span style={{ fontSize: 'var(--text-md)', fontWeight: 'var(--weight-semibold)', color: 'var(--text-primary)', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 'var(--space-1)' }}><IconFolder size={15} /> 本地画廊</span>
            <span className="badge badge-teal">{pageTotal}</span>
          </div>

          {/* 中间：搜索框 */}
          <div style={{ flex: 1, minWidth: 0, maxWidth: 480, position: 'relative', margin: '0 auto' }}>
            <input ref={searchInputRef} type="text" placeholder="搜索标题 / GID / artist:xxx …"
              value={search} onChange={handleSearchInput}
              onKeyDown={e => { if (e.key === 'Escape') setShowSearchSuggestions(false) }}
              onFocus={() => { if (search && searchSuggestions.length > 0) setShowSearchSuggestions(true) }}
              onBlur={() => setTimeout(() => setShowSearchSuggestions(false), 150)}
              style={{ width: '100%', height: 32, padding: '0 var(--space-3)', fontSize: 'var(--text-sm)' }} />
            {showSearchSuggestions && searchSuggestions.length > 0 && (
              <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100, background: 'var(--surface-high)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', boxShadow: '0 12px 32px rgba(0,0,0,0.5)', maxHeight: 240, overflowY: 'auto', marginTop: 4 }}>
                <div style={{ padding: '4px 10px', fontSize: 'var(--text-3xs)', color: 'var(--text-dim)', borderBottom: '1px solid var(--divider)' }}>点击补全 · {searchSuggestions.length} 条</div>
                {searchSuggestions.map((t, i) => (
                  <div key={i} onMouseDown={e => { e.preventDefault(); applySearchTag(t) }} style={{ padding: '5px 10px', cursor: 'pointer', fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 6 }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'var(--hover-bg)' }} onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}>
                    <span className="badge badge-muted" style={{ fontSize: 'var(--text-3xs)' }}>{t.prefix}</span>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.label}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 右侧：操作按钮组 */}
          <div style={{ display: 'flex', gap: 'var(--space-1)', flexShrink: 0 }}>
            {batchMode ? <>
              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--error)', whiteSpace: 'nowrap', alignSelf: 'center' }}>已选 {selected.size}</span>
              <button className="btn-sm" onClick={() => { const all = paged.map(g => g.gid); setSelected(selected.size === all.length ? new Set() : new Set(all)) }}>{selected.size === paged.length ? '取消全选' : '全选'}</button>
              <button className="btn-sm" onClick={() => { setSelected(new Set()); setBatchMode(false) }} style={{ color: 'var(--text-muted)' }}>退出</button>
              {activeGroup.startsWith('album:') && <button className="btn-sm" disabled={selected.size === 0} onClick={() => { const ak = activeGroup.slice(6); const cfg = { ...albumConfig }; if (cfg[ak]) cfg[ak] = { ...cfg[ak], gids: cfg[ak].gids.filter(id => !selected.has(id)) }; saveAlbums(cfg); setSelected(new Set()); setBatchMode(false); setToast(`已从专辑移除 ${selected.size} 部`) }} style={{ borderColor: 'var(--accent-teal-bg)', color: 'var(--accent-teal)' }}>移出专辑</button>}
              <button className="btn-sm" disabled={selected.size === 0} onClick={() => setBatchRedownloadConfirm(true)} style={{ color: 'var(--warning)' }}>重新下载</button>
              <button className="btn-sm" disabled={selected.size === 0} onClick={() => setBatchDeleteConfirm(true)} style={{ color: 'var(--error)' }}>删除</button>
            </> : <>
              <button className="btn-sm" onClick={() => setImportModal(true)} style={{ color: 'var(--accent-teal)' }}><IconImport size={14} /> 导入</button>
              <button className="btn-sm" onClick={() => setBatchImportModal(true)} style={{ color: 'var(--warning)' }}><IconBatch size={14} /> 批量导入</button>
              <button className="btn-sm" onClick={() => loadRandom(true)}><IconRandom size={14} /></button>
              <button className="btn-sm" onClick={() => setBatchMode(true)} style={{ color: 'var(--error)' }}><IconTrash size={14} /> 批量</button>
            </>}
          </div>
        </div>

        {/* ── 工具栏 ── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', padding: 'var(--space-2) var(--space-4)', borderBottom: '1px solid var(--divider)', flexShrink: 0, overflowX: 'auto', height: 'var(--toolbar-height)' }}>
          {/* 分组标签 */}
          <div style={{ display: 'flex', gap: 'var(--space-1)', flexShrink: 0 }}>
            <button className="btn-sm" onClick={() => updateParams({ group: null, p: null })}
              style={{ borderColor: activeGroup === 'all' ? 'var(--accent-border)' : 'var(--border-input)', color: activeGroup === 'all' ? 'var(--accent)' : 'var(--text-secondary)', background: activeGroup === 'all' ? 'var(--accent-bg)' : 'transparent' }}>全部</button>
            {groups.filter(g => g.type !== 'album').slice(0, 8).map(grp => renderGroupTag(grp))}
            {(() => {
              const activeAuto = groups.find(g => g.key === activeGroup && g.type !== 'album')
              if (!activeAuto || activeAuto.type === 'multi' || activeAuto.type === 'unknown') return null
              return (
                <button className="btn-sm" onClick={() => handleConvertGroupToAlbum(activeAuto)}
                  title="转为专辑"
                  style={{ color: 'var(--accent-teal)', borderColor: 'var(--accent-teal-bg)', whiteSpace: 'nowrap' }}>
                  <FolderOpen size={13} /> 转为专辑
                </button>
              )
            })()}
          </div>

          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexShrink: 0 }}>
            <select value={sortBy} onChange={e => updateParams({ sort: e.target.value === 'modified-desc' ? null : e.target.value, p: null })} style={{ height: 28, fontSize: 'var(--text-xs)' }}>
              {activeGroup.startsWith('album:') && <option value="custom">{'🔢 '}自定义顺序</option>}
              {SORT_OPTIONS.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
            </select>
            {isAlbumSortMode && <button className="btn-sm" onClick={() => { const ak = activeGroup.slice(6); const o = paged.map(g => g.gid); const cfg = { ...albumConfig }; if (cfg[ak]) cfg[ak] = { ...cfg[ak], order: o }; saveAlbums(cfg); setToast('顺序已保存') }}><Save size={13} /></button>}
            <div style={{ display: 'flex', gap: 0 }}>
              <button className="btn-sm" onClick={() => setViewMode('grid')} style={{ borderColor: viewMode === 'grid' ? 'var(--border-active)' : 'var(--border-input)', color: viewMode === 'grid' ? 'var(--text-primary)' : 'var(--text-secondary)' }}>▦</button>
              <button className="btn-sm" onClick={() => setViewMode('list')} style={{ borderColor: viewMode === 'list' ? 'var(--border-active)' : 'var(--border-input)', color: viewMode === 'list' ? 'var(--text-primary)' : 'var(--text-secondary)' }}>☰</button>
            </div>
            <select value={pageSize} onChange={e => updateParams({ size: Number(e.target.value) === 20 ? null : Number(e.target.value), p: null })} style={{ height: 28, fontSize: 'var(--text-xs)' }}>
              {PAGE_OPTIONS.map(n => <option key={n} value={n}>{n}/页</option>)}
            </select>
          </div>
        </div>

        {/* ── 画廊内容区 ── */}
        <div ref={galleryScrollRef} style={{ flex: 1, overflowY: 'auto', padding: 'var(--space-4)', position: 'relative' }}>
          {error && <div className="status-msg error">{error}</div>}

          {(metaLoading || pageLoading) && (
            <div className="grid">
              {Array.from({ length: pageSize }).map((_, i) => (
                <div key={i} className="gallery-card" style={{ background: 'var(--surface-card)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
                  <div style={{ width: '100%', paddingBottom: '138%', background: 'linear-gradient(90deg, var(--surface-card) 0%, var(--surface-hover) 50%, var(--surface-card) 100%)', backgroundSize: '200% 100%', animation: 'skeleton-shimmer 1.5s infinite' }} />
                  <div style={{ padding: 8 }}>
                    <div style={{ height: 12, borderRadius: 'var(--radius-xs)', background: 'var(--surface-hover)', width: '80%', marginBottom: 4 }} />
                    <div style={{ height: 8, borderRadius: 'var(--radius-xs)', background: 'var(--surface-hover)', width: '50%' }} />
                  </div>
                </div>
              ))}
            </div>
          )}

          {!metaLoading && !pageLoading && paged.length === 0 && !error && (
            <div className="empty"><p>暂无本地画廊</p><p style={{ fontSize: 'var(--text-xs)' }}>在 E-Hentai 页面下载后会自动出现在这里</p></div>
          )}

          {/* 画廊网格/列表 */}
          {viewMode === 'grid' ? (
            isAlbumSortMode ? (
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={(e) => setActiveDragId(e.active.id)} onDragEnd={handleDragEnd}>
                <SortableContext items={paged.map(g => g.gid)} strategy={verticalListSortingStrategy}>
                  <div className="grid">
                    {paged.map(g => (
                      <SortableGalleryCard key={g.gid} g={g} isSel={selected.has(g.gid)}
                        isHovered={hoveredGid === g.gid} dragGid={dragGid}
                        albumInfo={gidToAlbum[g.gid]}
                        ribbonText={gidToAlbum[g.gid]?.name}
                        batchMode={batchMode}
                        onCardClick={() => handleCardClick(g)}
                        onDragMouseDown={handleDragMouseDown}
                        onOpenDetail={handleOpenDetail}
                        onOpenReader={handleOpenReader} />
                    ))}
                  </div>
                </SortableContext>
                <DragOverlay>
                  {activeDragId ? (() => { const g = paged.find(x => x.gid === activeDragId); return g ? <GalleryCard g={g} isSel={false} isHovered={false} dragGid={null} albumInfo={null} ribbonText={null} batchMode={false} onCardClick={() => {}} onDragMouseDown={() => {}} onOpenDetail={() => {}} onOpenReader={() => {}} /> : null })() : null}
                </DragOverlay>
              </DndContext>
            ) : (
              <div className="grid">
                {paged.map(g => (
                  <GalleryCard key={g.gid} g={g} isSel={selected.has(g.gid)}
                    isHovered={hoveredGid === g.gid} dragGid={dragGid}
                    albumInfo={gidToAlbum[g.gid]}
                    ribbonText={gidToAlbum[g.gid]?.name}
                    batchMode={batchMode}
                    onCardClick={() => handleCardClick(g)}
                    onDragMouseDown={handleDragMouseDown}
                    onOpenDetail={handleOpenDetail}
                    onOpenReader={handleOpenReader} />
                ))}
              </div>
            )
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
              {paged.map(g => (
                <GalleryRow key={g.gid} g={g} isSel={selected.has(g.gid)}
                  dragGid={dragGid} albumInfo={gidToAlbum[g.gid]}
                  ribbonText={gidToAlbum[g.gid]?.name} batchMode={batchMode}
                  onCardClick={() => handleCardClick(g)}
                  onDragMouseDown={handleDragMouseDown}
                  onOpenDetail={handleOpenDetail}
                  onOpenReader={handleOpenReader} />
              ))}
            </div>
          )}

          {!pageLoading && paged.length === 0 && pageTotal > 0 && <div className="empty"><p>没有匹配的画廊</p></div>}
          {renderPagination()}
          <ScrollToTop containerRef={galleryScrollRef} threshold={600} />
        </div>
      </div>

      {/* ── 弹窗/模态框 ── */}
      {detailLoading && <div className="modal-overlay"><div className="modal"><div className="loading">加载详情...</div></div></div>}
      {detail && !detailLoading && (
        <GalleryDetail detail={detail} tagTranslations={tagTranslations} nsTranslations={nsTranslations}
          filtered={paged} albumConfig={albumConfig} galleries={galleryMetas}
          onOpenReader={handleOpenReader} onClose={() => setDetail(null)}
          onEditTags={async (gid) => { const tags = await fetchGalleryMetaTags(gid); setEditTagsForm({ title: detail.title, category: detail.category || 'other', language: detail.language || '', tags: tags || {} }); setEditTagsModal({ gid, title: detail.title }) }}
          onAddToAlbum={(info) => setAlbumModal(info)} />
      )}

      {deleteConfirm && <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setDeleteConfirm(null) }}><div className="modal" style={{ maxWidth: 380 }}><h3>确认删除</h3><p style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-xs)', wordBreak: 'break-all' }}>{deleteConfirm.title}</p><p style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-muted)' }}>此操作不可撤销。</p><div className="modal-actions" style={{ justifyContent: 'flex-end' }}><button className="btn-sm" onClick={() => setDeleteConfirm(null)}>取消</button><button className="btn-sm" onClick={() => handleDelete(deleteConfirm.gid)} disabled={deleting} style={{ color: 'var(--error)', borderColor: 'var(--error)' }}>{deleting ? '删除中...' : '确认删除'}</button></div></div></div>}

      {batchDeleteConfirm && <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setBatchDeleteConfirm(false) }}><div className="modal" style={{ maxWidth: 380 }}><h3>批量删除</h3><p style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-xs)' }}>永久删除选中 <strong style={{ color: 'var(--error)' }}>{selected.size}</strong> 部画廊</p><div className="modal-actions" style={{ justifyContent: 'flex-end' }}><button className="btn-sm" onClick={() => setBatchDeleteConfirm(false)}>取消</button><button className="btn-sm" onClick={handleBatchDelete} disabled={deleting} style={{ color: 'var(--error)', borderColor: 'var(--error)' }}>{deleting ? '删除中...' : `确认删除 ${selected.size} 部`}</button></div></div></div>}

      {batchRedownloadConfirm && <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setBatchRedownloadConfirm(false) }}><div className="modal" style={{ maxWidth: 380 }}><h3>批量重新下载</h3><p style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-xs)' }}>重新下载 <strong style={{ color: 'var(--warning)' }}>{selected.size}</strong> 部画廊</p><div className="modal-actions" style={{ justifyContent: 'flex-end' }}><button className="btn-sm" onClick={() => setBatchRedownloadConfirm(false)}>取消</button><button className="btn-sm" onClick={handleBatchRedownload} disabled={deleting} style={{ color: 'var(--warning)' }}>确认</button></div></div></div>}

      {albumModal && (() => {
        const matched = albumModal.matchedAlbums || []; const gTags = albumModal.tags || []; const kt = gTags.filter(t => t.ns === 'artist' || t.ns === 'group')
        return <div className="modal-overlay" onClick={() => setAlbumModal(null)}><div className="modal" style={{ maxWidth: 440 }} onClick={e => e.stopPropagation()}><h3><FolderOpen size={14} /> 添加到专辑</h3><p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{albumModal.title}</p>
          {matched.length > 0 && <div style={{ marginTop: 'var(--space-3)' }}><div style={{ fontSize: 'var(--text-2xs)', color: 'var(--warning)' }}>匹配的专辑</div><div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>{matched.map(({ key, name, count }) => <button key={key} className="btn-sm" onClick={() => { const cfg = { ...albumConfig }; if (!cfg[key]) cfg[key] = { name: key, gids: [] }; cfg[key].gids = [...cfg[key].gids.filter(id => id !== albumModal.gid), albumModal.gid]; saveAlbums(cfg); setAlbumModal(null); setToast(`已添加到 "${name}"`) }} style={{ borderColor: 'var(--accent-border)', color: 'var(--warning)' }}><FolderOpen size={12} /> {name} ({count})</button>)}</div></div>}
          {Object.keys(albumConfig).length > 0 && <div style={{ marginTop: 'var(--space-3)' }}><div style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-muted)' }}>选择已有专辑</div><div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>{Object.entries(albumConfig).map(([key, val]) => { const isM = matched.some(m => m.key === key); return <button key={key} className="btn-sm" disabled={isM} onClick={() => { const cfg = { ...albumConfig }; cfg[key].gids = [...(cfg[key].gids || []).filter(id => id !== albumModal.gid), albumModal.gid]; saveAlbums(cfg); setAlbumModal(null); setToast(`已添加到 "${val.name || key}"`) }} style={isM ? { opacity: 0.4 } : {}}><FolderOpen size={12} /> {val.name || key} ({(val.gids || []).length})</button> })}</div></div>}
          {kt.length > 0 && <div style={{ marginTop: 'var(--space-3)' }}><div style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-secondary)' }}>用关键标签创建专辑</div><div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>{kt.map((t, i) => <button key={i} className="btn-sm" onClick={() => { const cfg = { ...albumConfig }; cfg[t.tag] = { name: t.tag, gids: [...(cfg[t.tag]?.gids || []), albumModal.gid] }; saveAlbums(cfg); setAlbumModal(null); setToast(`已创建专辑 "${t.tag}"`) }}>{t.ns === 'artist' ? <User size={12} /> : <Users size={12} />} {t.tag}</button>)}</div></div>}
          <div style={{ marginTop: 'var(--space-4)', textAlign: 'right' }}><button className="btn-sm" onClick={() => setAlbumModal(null)}>取消</button></div>
        </div></div>
      })()}

      {editingAlbumKey && <AlbumEditModal albumKey={editingAlbumKey} albumConfig={albumConfig} onClose={() => setEditingAlbumKey(null)} onUpdated={handleAlbumUpdated} />}

      {/* 编辑标签 */}
      {editTagsModal && (
        <div className="modal-overlay" onClick={() => setEditTagsModal(null)}><div className="modal" onClick={e => e.stopPropagation()}>
          <h3>编辑标签</h3><p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>GID: {editTagsModal.gid} — {editTagsModal.title}</p>
          <div style={{ marginTop: 'var(--space-3)' }}><input type="text" value={editTagsForm.title} onChange={e => setEditTagsForm(f => ({ ...f, title: e.target.value }))} style={{ width: '100%' }} placeholder="标题" /></div>
          <div style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 'var(--space-2)' }}>
            <select value={editTagsForm.category} onChange={e => setEditTagsForm(f => ({ ...f, category: e.target.value }))} style={{ flex: 1 }}>
              {Object.keys(CATEGORY_COLORS).map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <input type="text" value={editTagsForm.language} onChange={e => setEditTagsForm(f => ({ ...f, language: e.target.value }))} style={{ flex: 1 }} placeholder="语言" />
          </div>
          <div style={{ marginTop: 'var(--space-3)' }}>
            {['artist', 'group', 'language', 'parody', 'female', 'male', 'other'].map(ns => {
              const vals = editTagsForm.tags[ns] || []
              return <div key={ns} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 4 }}>
                <span style={{ width: 60, fontSize: 'var(--text-2xs)', color: 'var(--accent)', textAlign: 'right', flexShrink: 0 }}>{ns}</span>
                <input type="text" value={vals.join(', ')} onChange={e => { const nv = e.target.value.split(',').map(s => s.trim()).filter(Boolean); setEditTagsForm(f => ({ ...f, tags: { ...f.tags, [ns]: nv.length > 0 ? nv : undefined } })) }} style={{ flex: 1, fontSize: 'var(--text-xs)' }} placeholder="逗号分隔" />
              </div>
            })}
          </div>
          <div className="modal-actions" style={{ justifyContent: 'flex-end' }}>
            <button className="btn-sm" onClick={() => setEditTagsModal(null)}>取消</button>
            <button className="btn-sm" onClick={async () => { setEditTagsSaving(true); try { const ct = {}; Object.entries(editTagsForm.tags).forEach(([k, v]) => { if (v && v.length > 0) ct[k] = v }); await updateGalleryMetaTags(editTagsModal.gid, { tags: ct, title: editTagsForm.title, category: editTagsForm.category, language: editTagsForm.language || null }); setEditTagsModal(null); loadMetas(); loadPaged(); setToast('标签已更新') } catch (e) { setToast('更新失败: ' + e.message) }; setEditTagsSaving(false) }} disabled={editTagsSaving} style={{ color: 'var(--warning)' }}><Save size={13} /> 保存</button>
          </div>
        </div></div>
      )}

      {/* 导入外部作品 */}
      {importModal && (
        <div className="modal-overlay" onClick={() => setImportModal(false)}><div className="modal" onClick={e => e.stopPropagation()}>
          <h3>导入外部作品</h3>
          <div style={{ marginTop: 'var(--space-3)' }}>
            <div style={{ display: 'flex', gap: 'var(--space-2)' }}><input type="text" value={importForm.sourceDir} onChange={e => setImportForm(f => ({ ...f, sourceDir: e.target.value }))} style={{ flex: 1 }} placeholder="源文件夹路径" /><button className="btn-sm" onClick={async () => { try { const d = await browseDirectory(importForm.sourceDir || ''); setImportDirBrowser({ show: true, path: importForm.sourceDir || '', items: d, stack: [importForm.sourceDir || ''] }) } catch (e) { setToast('无法浏览: ' + e.message) } }}><FolderOpen size={12} /> 浏览</button></div>
          </div>
          {importDirBrowser.show && (
            <div style={{ marginTop: 'var(--space-2)', maxHeight: 180, overflowY: 'auto', background: 'var(--surface-card)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)', padding: 'var(--space-1)' }}>
              <div style={{ display: 'flex', gap: 4, marginBottom: 4 }}><button className="btn-sm" onClick={async () => { const p = importDirBrowser.path.split(/[\\/]/).filter(Boolean).slice(0, -1).join('\\') + '\\'; const d = await browseDirectory(p); setImportDirBrowser(pr => ({ ...pr, path: p, items: d, stack: [...pr.stack, p] })) }}>⬆ 上级</button><span style={{ fontSize: 'var(--text-3xs)', color: 'var(--text-muted)', padding: '3px 6px' }}>{importDirBrowser.path}</span></div>
              {importDirBrowser.items.map((d, i) => (
                <div key={i} style={{ padding: '3px 8px', cursor: d.isDir ? 'pointer' : 'default', fontSize: 'var(--text-xs)', color: d.isDir ? 'var(--accent-teal)' : 'var(--text-muted)', borderRadius: 'var(--radius-xs)', display: 'flex', alignItems: 'center', gap: 6 }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'var(--hover-bg)' }} onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
                  onClick={async () => { if (d.isDir) { const data = await browseDirectory(d.path); setImportDirBrowser(p => ({ ...p, path: d.path, items: data, stack: [...p.stack, d.path] })) } }}>
                  {d.isDir ? <FolderOpen size={12} /> : <span style={{ fontSize:'var(--text-2xs)' }}>📄</span>} {d.name}
                  <button className="btn-sm" onClick={() => { const dir = d.isDir ? d.path : importDirBrowser.path; const dn = d.isDir ? d.name : (importDirBrowser.path.split(/[\\/]/).filter(Boolean).pop() || ''); setImportForm(f => ({ ...f, sourceDir: dir, title: f.title || dn })); setImportDirBrowser({ show: false, path: '', items: [], stack: [] }) }} style={{ marginLeft: 'auto', fontSize: 'var(--text-3xs)', padding: '1px 4px' }}>选此</button>
                </div>
              ))}
            </div>
          )}
          <div style={{ marginTop: 'var(--space-2)' }}><input type="text" value={importForm.title} onChange={e => setImportForm(f => ({ ...f, title: e.target.value }))} style={{ width: '100%' }} placeholder="标题 *" /></div>
          <div style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 'var(--space-2)' }}>
            <select value={importForm.category} onChange={e => setImportForm(f => ({ ...f, category: e.target.value }))} style={{ flex: 1 }}>{Object.keys(CATEGORY_COLORS).map(c => <option key={c} value={c}>{c}</option>)}</select>
            <input type="text" value={importForm.language} onChange={e => setImportForm(f => ({ ...f, language: e.target.value }))} style={{ flex: 1 }} placeholder="语言" />
          </div>
          <div style={{ marginTop: 'var(--space-2)' }}><input type="text" value={importForm.artists} onChange={e => setImportForm(f => ({ ...f, artists: e.target.value }))} style={{ width: '100%' }} placeholder="作者/画师（逗号分隔）" /></div>
          <div style={{ marginTop: 'var(--space-2)' }}><input type="text" value={importForm.groups} onChange={e => setImportForm(f => ({ ...f, groups: e.target.value }))} style={{ width: '100%' }} placeholder="社团（逗号分隔）" /></div>
          <div style={{ marginTop: 'var(--space-2)' }}><input type="text" value={importForm.otherTags} onChange={e => setImportForm(f => ({ ...f, otherTags: e.target.value }))} style={{ width: '100%' }} placeholder="其他标签（逗号分隔）" /></div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 'var(--space-3)', fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', cursor: 'pointer' }}><input type="checkbox" checked={importForm.copyFiles} onChange={e => setImportForm(f => ({ ...f, copyFiles: e.target.checked }))} />复制文件到画廊目录</label>
          <div className="modal-actions" style={{ justifyContent: 'flex-end' }}>
            <button className="btn-sm" onClick={() => setImportModal(false)}>取消</button>
            <button className="btn-sm" onClick={async () => { if (!importForm.sourceDir || !importForm.title.trim()) { setToast('请填写源文件夹和标题'); return }; setImporting(true); try { await importLocalGallery({ sourceDir: importForm.sourceDir, title: importForm.title.trim(), category: importForm.category, language: importForm.language || null, artists: importForm.artists ? importForm.artists.split(',').map(s => s.trim()).filter(Boolean) : null, groups: importForm.groups ? importForm.groups.split(',').map(s => s.trim()).filter(Boolean) : null, otherTags: importForm.otherTags ? importForm.otherTags.split(',').map(s => s.trim()).filter(Boolean) : null, copyFiles: importForm.copyFiles }); setImportModal(false); setImportForm({ sourceDir: '', title: '', category: 'doujinshi', language: '', artists: '', groups: '', otherTags: '', copyFiles: true }); loadMetas(); loadPaged(); setToast('导入成功') } catch (e) { setToast('导入失败: ' + e.message) }; setImporting(false) }} disabled={importing} style={{ color: 'var(--accent-teal)' }}>{importing ? '导入中...' : '导入'}</button>
          </div>
        </div></div>
      )}

      {/* 批量导入 */}
      {batchImportModal && (
        <div className="modal-overlay" onClick={() => setBatchImportModal(false)}><div className="modal" onClick={e => e.stopPropagation()}>
          <h3>📦 批量导入</h3><p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>父目录下每个包含图片的子文件夹作为一个作品导入</p>
          <div style={{ marginTop: 'var(--space-3)' }}>
            <div style={{ display: 'flex', gap: 'var(--space-2)' }}><input type="text" value={batchImportForm.parentDir} onChange={e => setBatchImportForm(f => ({ ...f, parentDir: e.target.value }))} style={{ flex: 1 }} placeholder="父目录路径" /><button className="btn-sm" onClick={async () => { try { const d = await browseDirectory(batchImportForm.parentDir || ''); setImportDirBrowser({ show: true, path: batchImportForm.parentDir || '', items: d, stack: [batchImportForm.parentDir || ''] }) } catch (e) { setToast('无法浏览: ' + e.message) } }}>📁 浏览</button></div>
          </div>
          {importDirBrowser.show && (
            <div style={{ marginTop: 'var(--space-2)', maxHeight: 180, overflowY: 'auto', background: 'var(--surface-card)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)', padding: 'var(--space-1)' }}>
              <div style={{ display: 'flex', gap: 4, marginBottom: 4 }}><button className="btn-sm" onClick={async () => { const p = importDirBrowser.path.split(/[\\/]/).filter(Boolean).slice(0, -1).join('\\') + '\\'; const d = await browseDirectory(p); setImportDirBrowser(pr => ({ ...pr, path: p, items: d, stack: [...pr.stack, p] })) }}>⬆ 上级</button><span style={{ fontSize: 'var(--text-3xs)', color: 'var(--text-muted)', padding: '3px 6px' }}>{importDirBrowser.path}</span></div>
              {importDirBrowser.items.map((d, i) => (
                <div key={i} style={{ padding: '3px 8px', cursor: d.isDir ? 'pointer' : 'default', fontSize: 'var(--text-xs)', color: d.isDir ? 'var(--accent-teal)' : 'var(--text-muted)', borderRadius: 'var(--radius-xs)', display: 'flex', alignItems: 'center', gap: 6 }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'var(--hover-bg)' }} onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
                  onClick={async () => { if (d.isDir) { const data = await browseDirectory(d.path); setImportDirBrowser(p => ({ ...p, path: d.path, items: data, stack: [...p.stack, d.path] })) } }}>
                  {d.isDir ? '📁' : '📄'} {d.name}
                  {d.isDir && <button className="btn-sm" onClick={() => { setBatchImportForm(f => ({ ...f, parentDir: d.path })); setImportDirBrowser({ show: false, path: '', items: [], stack: [] }) }} style={{ marginLeft: 'auto', fontSize: 'var(--text-3xs)', padding: '1px 4px' }}>选此</button>}
                </div>
              ))}
            </div>
          )}
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 'var(--space-3)', fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', cursor: 'pointer' }}><input type="checkbox" checked={batchImportForm.copyFiles} onChange={e => setBatchImportForm(f => ({ ...f, copyFiles: e.target.checked }))} />复制文件到画廊目录</label>
          {batchImportResult && (
            <div style={{ marginTop: 'var(--space-3)', maxHeight: 180, overflowY: 'auto', fontSize: 'var(--text-xs)' }}>
              <div style={{ color: 'var(--success)' }}><CheckCircle size={12} /> 成功 {batchImportResult.success} / <XCircle size={12} style={{color:'var(--error)'}} /> 失败 {batchImportResult.failed}</div>
              {batchImportResult.results.map((r, i) => <div key={i} style={{ color: r.success ? 'var(--success)' : 'var(--error)' }}>{r.success ? <><CheckCircle size={12} /> {r.title} ({r.fileCount}页)</> : <><XCircle size={12} /> {r.folder}: {r.error}</>}</div>)}
            </div>
          )}
          <div className="modal-actions" style={{ justifyContent: 'flex-end' }}>
            <button className="btn-sm" onClick={() => { setBatchImportModal(false); setBatchImportResult(null); setImportDirBrowser({ show: false, path: '', items: [], stack: [] }) }}>关闭</button>
            <button className="btn-sm" onClick={async () => { if (!batchImportForm.parentDir.trim()) { setToast('请选择父目录'); return }; setBatchImporting(true); try { const r = await batchImportGalleries(batchImportForm.parentDir.trim(), batchImportForm.copyFiles); setBatchImportResult(r); loadMetas(); loadPaged() } catch (e) { setToast('批量导入失败: ' + e.message) }; setBatchImporting(false) }} disabled={batchImporting} style={{ color: 'var(--warning)' }}>{batchImporting ? '导入中...' : <><Rocket size={12} /> 开始</>}</button>
          </div>
        </div></div>
      )}

      {/* Toast — 左下角堆叠 */}
      {toasts.length > 0 && (
        <div style={{ position: 'fixed', bottom: 20, left: 20, zIndex: 300, display: 'flex', flexDirection: 'column', gap: 6, pointerEvents: 'none' }}>
          {toasts.map((t, i) => (
            <div key={t.key} style={{ padding: '8px 16px', borderRadius: 'var(--radius-sm)', background: 'var(--glass-bg)', backdropFilter: 'blur(12px)', border: '1px solid var(--glass-border)', color: 'var(--text-primary)', fontSize: 'var(--text-sm)', fontWeight: 'var(--weight-medium)', boxShadow: 'inset 0 1px 0 var(--glass-highlight)', opacity: 1 - i * 0.3, transform: `translateY(${i * 3}px)` }}>{t.msg}</div>
          ))}
        </div>
      )}
    </div>
  )
}