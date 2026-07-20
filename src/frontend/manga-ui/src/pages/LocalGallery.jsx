import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { Link, useSearchParams, useNavigate } from 'react-router-dom'
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragOverlay } from '@dnd-kit/core'
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { fetchLocalGalleryMetas, fetchLocalGalleriesPaged, fetchLocalGalleriesRandom, fetchLocalGalleryGids, fetchLocalGalleryDetail, deleteLocalGallery, translateEHTags, suggestEHTags, redownloadLocalGallery, batchRedownloadLocalGalleries, fetchAlbumConfig, saveAlbumConfig, renameAlbum, importLocalGallery, batchImportGalleries, fetchGalleryMetaTags, updateGalleryMetaTags, browseDirectory } from '../api'
import useGalleryDrag from '../hooks/useGalleryDrag'
import GalleryDetail from '../components/GalleryDetail'
import AlbumSidebar from '../components/AlbumSidebar'
import AlbumEditModal from '../components/AlbumEditModal'
import GalleryCard from '../components/GalleryCard'
import GalleryRow from '../components/GalleryRow'
import SortableGalleryCard from '../components/SortableGalleryCard'
import ScrollToTop from '../components/ScrollToTop'
import { IconGlobe, IconImport, IconBatch, IconRandom, IconTrash, IconRedownload, IconGrid, IconList, IconChevronLeft, IconChevronRight, IconSearch, IconFolder, IconEdit, IconEye, IconBook, IconClose, IconAlbum, IconDownload, IconGripDots } from '../components/Icons'
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
  const [detail, setDetail] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [error, setError] = useState(null)
  const [deleteConfirm, setDeleteConfirm] = useState(null)
  const [batchDeleteConfirm, setBatchDeleteConfirm] = useState(false)
  const [batchRedownloadConfirm, setBatchRedownloadConfirm] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [batchMode, setBatchMode] = useState(false)
  const [selected, setSelected] = useState(new Set())
  const [tagTranslations, setTagTranslations] = useState({})
  const [nsTranslations, setNsTranslations] = useState({})
  const [searchTagTransMap, setSearchTagTransMap] = useState({})
  const [toasts, setToasts] = useState([])
  const toastIdRef = useRef(0)
  const setToast = (msg, duration = 2000) => {
    if (!msg) return
    const id = ++toastIdRef.current
    setToasts(prev => [...prev.slice(-2), { id, msg, key: id }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), duration)
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

  // 搜索自动补全
  const [searchSuggestions, setSearchSuggestions] = useState([])
  const [showSearchSuggestions, setShowSearchSuggestions] = useState(false)
  const [cursorPos, setCursorPos] = useState(0)
  const searchInputRef = useRef(null)
  const suggestTimerRef = useRef(null)

  // 导入/批量导入
  const [importModal, setImportModal] = useState(false)
  const [importForm, setImportForm] = useState({ sourceDir: '', title: '', category: 'doujinshi', language: '', artists: '', groups: '', otherTags: '', copyFiles: true })
  const [importing, setImporting] = useState(false)
  const [batchImportModal, setBatchImportModal] = useState(false)
  const [batchImportForm, setBatchImportForm] = useState({ parentDir: '', copyFiles: true })
  const [batchImporting, setBatchImporting] = useState(false)
  const [batchImportResult, setBatchImportResult] = useState(null)
  const [importDirBrowser, setImportDirBrowser] = useState({ show: false, path: '', items: [], stack: [] })

  // 编辑标签
  const [editTagsModal, setEditTagsModal] = useState(null)
  const [editTagsForm, setEditTagsForm] = useState({ title: '', category: '', language: '', tags: {} })
  const [editTagsSaving, setEditTagsSaving] = useState(false)

  // 专辑配置
  const [albumConfig, setAlbumConfig] = useState({})
  const [albumsLoaded, setAlbumsLoaded] = useState(false)
  const albumConfigRef = useRef(albumConfig)
  useEffect(() => { albumConfigRef.current = albumConfig }, [albumConfig])

  // 侧边栏/专辑
  const [albumSearch, setAlbumSearch] = useState('')
  const [albumSort, setAlbumSort] = useState('default')
  const [editingAlbumKey, setEditingAlbumKey] = useState(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [sidebarPinned, setSidebarPinned] = useState(false)
  const [albumModal, setAlbumModal] = useState(null)

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

  // ── 专辑配置加载 ──
  useEffect(() => {
    (async () => {
      const data = await fetchAlbumConfig()
      if (data && Object.keys(data).length > 0) { setAlbumConfig(data) } else {
        try {
          const raw = JSON.parse(localStorage.getItem('local-albums') || '{}')
          const cfg = {}
          for (const [key, val] of Object.entries(raw)) {
            if (Array.isArray(val)) cfg[key] = { name: key, gids: val }
            else if (val && typeof val === 'object' && Array.isArray(val.gids)) cfg[key] = val
          }
          if (Object.keys(cfg).length > 0) setAlbumConfig(cfg)
        } catch { }
      }
      setAlbumsLoaded(true)
    })()
  }, [])

  const saveAlbums = useCallback(async (cfg) => {
    setAlbumConfig(cfg)
    try { localStorage.setItem('local-albums', JSON.stringify(cfg)) } catch { }
    try { await saveAlbumConfig(cfg) } catch (e) { setToast('保存专辑失败: ' + e.message) }
  }, [])

  const getAlbumName = (key) => albumConfig[key]?.name || key

  const gidToAlbum = useMemo(() => {
    const map = {}
    Object.entries(albumConfig).forEach(([key, val]) => {
      if (val.gids && val.gids.length > 0) {
        val.gids.forEach(gid => { map[gid] = { key, name: val.name || key, color: val.color || 'var(--accent)' } })
      }
    })
    return map
  }, [albumConfig])

  // ── 元数据流 ──
  useEffect(() => { loadMetas() }, [])
  const loadMetas = async () => {
    setMetaLoading(true)
    try { setGalleryMetas(await fetchLocalGalleryMetas()) } catch (e) { setError(e.message) }
    setMetaLoading(false)
  }

  // ── 展示流 ──
  const loadPaged = useCallback(async (targetPage) => {
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
      const result = await fetchLocalGalleriesPaged({ group: activeGroup, search, sort: sortBy, page: p, pageSize, albumGids: activeGroup.startsWith('album:') ? albumGids : allAlbumGids, albumOrder })
      setPageItems(result.items || [])
      setPageTotal(result.total || 0)
      setPageTotalPages(result.totalPages || 1)
    } catch (e) { setError(e.message) }
    setPageLoading(false)
  }, [activeGroup, search, sortBy, pageSize, page])

  const RANDOM_CACHE_KEY = 'local-random-cache'
  const loadRandom = useCallback(async (forceRefresh = false) => {
    if (!forceRefresh) {
      try {
        const cached = JSON.parse(sessionStorage.getItem(RANDOM_CACHE_KEY))
        if (cached?.items?.length > 0) { setPageItems(cached.items); setPageTotal(cached.total || cached.items.length); setPageTotalPages(1); setPageLoading(false); return }
      } catch { }
    }
    setPageItems([]); setPageLoading(true)
    try {
      const result = await fetchLocalGalleriesRandom(20)
      setPageItems(result.items || []); setPageTotal(result.total || 0); setPageTotalPages(result.totalPages || 1)
      try { sessionStorage.setItem(RANDOM_CACHE_KEY, JSON.stringify({ items: result.items, total: result.total, timestamp: Date.now() })) } catch { }
      updateParams({ group: null, q: null, sort: null, p: null, size: null, random: 'true' })
    } catch (e) { setError(e.message) }
    setPageLoading(false)
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

  // 搜索标签翻译
  const translateTriggerRef = useRef(0)
  useEffect(() => {
    if (galleryMetas.length === 0) return
    if (translateTriggerRef.current === galleryMetas.length) return
    translateTriggerRef.current = galleryMetas.length
    const tagSet = new Set()
    galleryMetas.forEach(g => {
      (g.artists || []).forEach(t => tagSet.add(`artist:${t}`))
      ;(g.groups || []).forEach(t => tagSet.add(`group:${t}`))
      if (g.language) tagSet.add(`language:${g.language}`)
      if (g.category) tagSet.add(`category:${g.category}`)
    })
    if (tagSet.size === 0) return
    const tagList = Array.from(tagSet)
    const translateBatches = async () => {
      const transMap = {}
      for (let i = 0; i < tagList.length; i += 200) {
        try { const r = await translateEHTags(tagList.slice(i, i + 200)); (r.data || []).forEach(item => { if (item.cn) transMap[item.key] = item.cn }) } catch { }
      }
      setSearchTagTransMap(transMap)
    }
    translateBatches()
  }, [galleryMetas.length])

  // 自动匹配
  const autoMatchGuardRef = useRef(false)
  useEffect(() => {
    if (!albumsLoaded || galleryMetas.length === 0 || Object.keys(albumConfig).length === 0 || autoMatchGuardRef.current) return
    autoMatchGuardRef.current = true
    const albumGids = new Set(Object.values(albumConfig).flatMap(v => v.gids || []))
    let changed = false; const cfg = { ...albumConfig }
    galleryMetas.forEach(g => {
      if (albumGids.has(g.gid)) return
      const simpleTags = [...(g.artists || []), ...(g.groups || [])]
      const namespaceTags = g.allTags || []
      const inferred = []; for (const t of simpleTags) { if (!t.includes(':')) inferred.push(`artist:${t}`, `group:${t}`) }
      const allCandidates = [...new Set([...namespaceTags, ...simpleTags, ...inferred])]
      for (const tag of allCandidates) {
        if (cfg[tag]) { const gids = cfg[tag].gids || []; if (!gids.includes(g.gid)) { cfg[tag] = { ...cfg[tag], gids: [...gids, g.gid] }; if (cfg[tag].order) cfg[tag].order = [...cfg[tag].order, g.gid]; changed = true } break }
      }
      const anyTags = new Set([...namespaceTags, ...simpleTags, ...inferred])
      for (const [k, v] of Object.entries(cfg)) {
        if (v.keyTag && anyTags.has(v.keyTag)) { const gids = v.gids || []; if (!gids.includes(g.gid)) { cfg[k] = { ...v, gids: [...gids, g.gid] }; if (v.order) cfg[k].order = [...v.order, g.gid]; changed = true } break }
      }
    })
    if (changed) saveAlbums(cfg)
    setTimeout(() => { autoMatchGuardRef.current = false }, 1000)
  }, [galleryMetas, albumConfig, albumsLoaded])

  // ── 分组计算 ──
  const groups = useMemo(() => {
    const map = new Map()
    const allNames = new Set()
    galleryMetas.forEach(g => { (g.artists || []).forEach(a => allNames.add(a)); (g.groups || []).forEach(gr => allNames.add(gr)) })
    Object.entries(albumConfig).forEach(([key, val]) => {
      const gids = val.gids || []; if (gids.length === 0 && !allNames.has(key)) return
      map.set(`album:${key}`, { type: 'album', key: `album:${key}`, name: val.name || key, count: gids.length, editable: true, createdAt: val.createdAt || val.updatedAt, updatedAt: val.updatedAt })
    })
    const albumGids = new Set(Object.values(albumConfig).flatMap(v => v.gids || []))
    galleryMetas.forEach(g => {
      if (albumGids.has(g.gid)) return
      const a = g.artists || []; const gr = g.groups || []
      if (a.length === 1 && gr.length === 0) { const k = `artist:${a[0]}`; if (!map.has(k)) map.set(k, { type: 'artist', name: a[0], count: 0 }); map.get(k).count++ }
      else if (gr.length === 1 && a.length === 0) { const k = `group:${gr[0]}`; if (!map.has(k)) map.set(k, { type: 'group', name: gr[0], count: 0 }); map.get(k).count++ }
      else if (a.length === 1 && gr.length === 1) { const k = `artist:${a[0]}`; if (!map.has(k)) map.set(k, { type: 'artist', name: a[0], count: 0 }); map.get(k).count++ }
      else if (a.length + gr.length > 1) { if (!map.has('multi')) map.set('multi', { type: 'multi', name: '多作者', count: 0 }); map.get('multi').count++ }
      else { if (!map.has('unknown')) map.set('unknown', { type: 'unknown', name: '未分类', count: 0 }); map.get('unknown').count++ }
    })
    const lower = albumSearch.trim().toLowerCase()
    const filtered = Array.from(map.entries()).filter(([, v]) => v.type === 'album' || v.count > 0).filter(([, v]) => !lower || (v.name || '').toLowerCase().includes(lower))
    const sort = (items) => {
      const albums = items.filter(([, v]) => v.type === 'album'); const auto = items.filter(([, v]) => v.type !== 'album')
      albums.sort((a, b) => {
        switch (albumSort) {
          case 'name-asc': return (a[1].name || '').localeCompare(b[1].name || '')
          case 'name-desc': return (b[1].name || '').localeCompare(a[1].name || '')
          case 'count-asc': return (a[1].count || 0) - (b[1].count || 0)
          case 'count-desc': return (b[1].count || 0) - (a[1].count || 0)
          case 'time-asc': return (a[1].createdAt || a[1].updatedAt || '').localeCompare(b[1].createdAt || b[1].updatedAt || '')
          case 'time-desc': return (b[1].createdAt || b[1].updatedAt || '').localeCompare(a[1].createdAt || a[1].updatedAt || '')
          default: return (a[1].createdAt || a[1].updatedAt || '').localeCompare(b[1].createdAt || b[1].updatedAt || '')
        }
      })
      auto.sort((a, b) => b[1].count - a[1].count)
      return [...albums, ...auto]
    }
    return sort(filtered).map(([key, val]) => ({ key, ...val }))
  }, [galleryMetas, albumConfig, albumSearch, albumSort])

  // ── 搜索标签池 ──
  const searchTagPoolRef = useRef([])
  const searchTagPool = useMemo(() => {
    if (searchTagPoolRef.current.length > 0 && galleryMetas.length === searchTagPoolRef.current._count) return searchTagPoolRef.current
    const pool = []; const seen = new Set()
    const add = (p, l) => { const k = `${p}:${l}`; if (!seen.has(k)) { seen.add(k); pool.push({ key: k, label: l, prefix: p, syntax: `${p}:${l}` }) } }
    galleryMetas.forEach(g => { (g.artists || []).forEach(t => add('artist', t)); (g.groups || []).forEach(t => add('group', t)); if (g.category) add('category', g.category); if (g.language) add('language', g.language) })
    Object.entries(albumConfig).forEach(([, val]) => { const n = val.name || ''; if (n && !seen.has(n)) { seen.add(n); pool.push({ key: n, label: n, prefix: 'album', syntax: n }) } })
    pool._count = galleryMetas.length
    searchTagPoolRef.current = pool.sort((a, b) => a.label.localeCompare(b.label))
    return searchTagPoolRef.current
  }, [galleryMetas.length, albumConfig])

  const handleSearchInput = (e) => {
    if (e.nativeEvent.isComposing) return
    const val = e.target.value; setSearch(val)
    const pos = e.target.selectionStart || 0; setCursorPos(pos)
    const lastSpace = val.lastIndexOf(' ', pos - 1)
    const word = val.substring(lastSpace + 1, pos).trim().toLowerCase()
    if (suggestTimerRef.current) clearTimeout(suggestTimerRef.current)
    if (word.length >= 1) {
      suggestTimerRef.current = setTimeout(async () => {
        const local = searchTagPool.filter(t => t.label.toLowerCase().includes(word)).slice(0, 8)
        if (local.length >= 3) { setSearchSuggestions(local); setShowSearchSuggestions(true); return }
        try {
          const eh = await suggestEHTags(word, 10); const merged = [...local]; const seenL = new Set(local.map(t => t.syntax.toLowerCase()))
          for (const r of eh) {
            const s = r.ehSyntax || ''; if (seenL.has(s.toLowerCase())) continue
            const pre = s.split(':')[0]?.toLowerCase(); if (!['artist', 'group', 'language', 'parody', 'category', 'female', 'male', 'misc'].includes(pre)) continue
            seenL.add(s.toLowerCase()); merged.push({ key: s, label: `${r.cn || r.tag} (${s})`, prefix: pre, syntax: s })
          }
          setSearchSuggestions(merged.slice(0, 8)); setShowSearchSuggestions(merged.length > 0)
        } catch { setSearchSuggestions(local); setShowSearchSuggestions(local.length > 0) }
      }, 200)
    } else { setShowSearchSuggestions(false) }
  }

  const applySearchTag = (tag) => {
    const val = search; const pos = cursorPos
    const ls = val.lastIndexOf(' ', pos - 1)
    const nv = (val.substring(0, ls + 1) + tag.syntax + ' ' + val.substring(pos)).replace(/\s+/g, ' ').trim()
    updateParams({ q: nv || null, p: null }); setShowSearchSuggestions(false); searchInputRef.current?.focus()
  }

  const totalPages = pageTotalPages; const safePage = Math.min(page, totalPages); const paged = pageItems
  const isAlbumSortMode = activeGroup.startsWith('album:') && sortBy === 'custom'

  // ── 事件回调（useCallback 稳定引用） ──
  const handleCardClick = useCallback((g) => {
    if (batchMode) { setSelected(prev => { const s = new Set(prev); s.has(g.gid) ? s.delete(g.gid) : s.add(g.gid); return s }) }
    else { setHoveredGid(prev => prev === g.gid ? null : g.gid) }
  }, [batchMode])

  const handleOpenDetail = useCallback(async (gid) => {
    setHoveredGid(null); setDetailLoading(true)
    try { const d = await fetchLocalGalleryDetail(gid); setDetail(d); if (d?.tagGroups?.length) { const all = []; d.tagGroups.forEach(g => { all.push(`n:${g.namespace}`); g.tags.forEach(t => all.push(`${g.namespace}:${t}`)) }); translateEHTags(all).then(r => { const tM = {}, nM = {}; (r.data || []).forEach(item => { if (item.key?.startsWith('n:')) nM[item.key.substring(2)] = item.cn; else if (item.cn) tM[item.key] = item.cn }); setTagTranslations(tM); setNsTranslations(nM) }).catch(() => {}) } } catch (e) { setError(e.message) }
    setDetailLoading(false)
  }, [])

  const handleOpenReader = useCallback(async (gid) => {
    setHoveredGid(null)
    const allGids = Object.values(albumConfig).flatMap(v => v.gids || [])
    let ag = null, ao = null
    if (activeGroup.startsWith('album:')) { const al = albumConfig[activeGroup.slice(6)]; if (al) { ag = al.gids || []; ao = sortBy === 'custom' ? (al.order || al.gids) : null } }
    sessionStorage.setItem('reader-local-context', JSON.stringify({ group: activeGroup, search, sort: sortBy, gids: paged.map(g2 => g2.gid), total: pageTotal }))
    sessionStorage.setItem('reader-local-return-url', window.location.search)
    navigate(`/reader-local/${gid}`)
    try { const fg = await fetchLocalGalleryGids({ group: activeGroup === 'all' ? null : activeGroup, search: search || null, sort: sortBy || null, albumGids: activeGroup.startsWith('album:') ? ag : allGids.length > 0 ? allGids : null, albumOrder: ao }); if (fg?.length) sessionStorage.setItem('reader-local-full-gids', JSON.stringify(fg)) } catch { }
  }, [activeGroup, search, sortBy, pageTotal, paged, albumConfig, navigate])

  const handleDelete = async (gid) => { setDeleting(true); try { await deleteLocalGallery(gid); setDeleteConfirm(null); setDetail(null); loadMetas(); loadPaged() } catch (e) { setError(e.message) } setDeleting(false) }
  const handleBatchDelete = async () => { setDeleting(true); try { for (const gid of selected) await deleteLocalGallery(gid); setSelected(new Set()); setBatchMode(false); setBatchDeleteConfirm(false); loadMetas(); loadPaged() } catch (e) { setError(e.message) } setDeleting(false) }
  const handleBatchRedownload = async () => { setDeleting(true); try { const r = await batchRedownloadLocalGalleries(Array.from(selected)); setBatchRedownloadConfirm(false); setSelected(new Set()); setBatchMode(false); loadMetas(); loadPaged(); setToast(r ? `批量重新下载: ${r.success} 成功${r.skipped > 0 ? `, ${r.skipped} 跳过` : ''}${r.failed > 0 ? `, ${r.failed} 失败` : ''}` : '批量重新下载任务已启动') } catch (e) { setToast('批量重新下载失败: ' + e.message) } setDeleting(false) }

  const ALBUM_PALETTE = ['#c06060', '#c08050', '#b0a050', '#60a060', '#70a050', '#5070a0', '#8050a0', '#c06080', '#907050', '#607080', '#50a0a0', '#70a0a0']

  const doAlbumDrop = useCallback((gid, albumKey) => {
    const cfg = { ...albumConfig }
    Object.keys(cfg).forEach(k => { if (cfg[k]) cfg[k] = { ...cfg[k], gids: cfg[k].gids.filter(id => id !== gid) } })
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

  const { dragGidRef, handleDragMouseDown } = useGalleryDrag({
    isSortMode: false, disabled: batchMode || isAlbumSortMode,
    onDropToAlbum: doAlbumDrop, onDropToSort: () => {},
    onShortClick: (gid) => setHoveredGid(prev => prev === gid ? null : gid),
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
    const icon = grp.type === 'artist' ? '👤' : grp.type === 'group' ? '👥' : grp.type === 'multi' ? '👥👤' : '📦'
    return (
      <span key={grp.key} style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
        <button className="btn-sm" onClick={() => updateParams({ group: grp.key === 'all' ? null : grp.key, p: null })}
          style={{ borderColor: isActive ? 'var(--accent-border)' : 'var(--border-input)', color: isActive ? 'var(--accent)' : 'var(--text-secondary)', background: isActive ? 'var(--accent-bg)' : 'transparent' }}>
          {icon} {grp.name} ({grp.count})
        </button>
        {!grp.editable && <button className="btn-sm" onClick={() => convertGroupToAlbum(grp)} style={{ padding: '3px 5px', borderColor: 'var(--accent-border)', color: 'var(--accent)', marginLeft: 1, fontSize: 'var(--text-3xs)' }} title="转为专辑">+</button>}
      </span>
    )
  }

  const convertGroupToAlbum = (grp) => {
    const ag = new Set(Object.values(albumConfig).flatMap(v => v.gids || []))
    const gids = galleryMetas.filter(g => {
      if (ag.has(g.gid)) return false
      const a = g.artists || []; const gr = g.groups || []
      if (grp.key === 'multi') return a.length + gr.length > 1
      if (grp.key === 'unknown') return a.length === 0 && gr.length === 0
      if (grp.key.startsWith('artist:')) { const n = grp.key.slice(7); return (a.length === 1 && a[0] === n) }
      if (grp.key.startsWith('group:')) { const n = grp.key.slice(6); return (gr.length === 1 && gr[0] === n && a.length === 0) }
      return false
    }).map(g => g.gid)
    if (gids.length === 0) return
    const cfg = { ...albumConfig }
    const eg = [...(cfg[grp.key]?.gids || []), ...(cfg[grp.name]?.gids || [])]
    const color = cfg[grp.key]?.color || cfg[grp.name]?.color || generateAlbumColor()
    cfg[grp.key] = { name: grp.name, color, gids: [...eg, ...gids] }; delete cfg[grp.name]
    saveAlbums(cfg); setToast(`已转换 "${grp.name}" (${gids.length} 部) 为专辑`)
  }

  const generateAlbumColor = useCallback(() => {
    const used = new Set(Object.values(albumConfig).map(v => v.color).filter(Boolean))
    for (const c of ALBUM_PALETTE) if (!used.has(c)) return c
    return '#' + Math.floor(Math.random() * 0xFFFFFF).toString(16).padStart(6, '0')
  }, [albumConfig])

  const handleCreateAlbum = (name) => {
    const cfg = { ...albumConfig }; cfg[name] = { name, color: generateAlbumColor(), gids: cfg[name]?.gids || [] }
    saveAlbums(cfg); updateParams({ group: `album:${name}`, p: null, sort: 'custom' })
  }

  const handleAlbumUpdated = useCallback((key, { name, color }) => {
    setAlbumConfig(prev => { if (!prev[key]) return prev; return { ...prev, [key]: { ...prev[key], name: name ?? prev[key].name, color: color ?? prev[key].color } } })
    setToast('专辑已更新')
  }, [])

  const handleDeleteAlbum = (key) => { const cfg = { ...albumConfig }; delete cfg[key]; saveAlbums(cfg) }
  const handleSelectGroup = (key) => { updateParams({ group: key === 'all' ? null : key, p: null, sort: key.startsWith('album:') ? 'custom' : null }) }

  // ═══════════════════════════════════════════
  // 渲染
  // ═══════════════════════════════════════════
  return (
    <div className="container" style={{ display: 'flex', gap: 0, padding: 0, height: '100vh', overflow: 'hidden' }}>
      {/* 侧边栏 */}
      <AlbumSidebar
        sidebarOpen={sidebarOpen} groups={groups} activeGroup={activeGroup}
        albumConfig={albumConfig} dragGid={dragGid}
        albumSearch={albumSearch} albumSort={albumSort}
        onSelectGroup={handleSelectGroup} onCreateAlbum={handleCreateAlbum}
        onEditAlbum={setEditingAlbumKey} onDeleteAlbum={handleDeleteAlbum}
        onConvertToAlbum={convertGroupToAlbum}
        onAlbumSearchChange={setAlbumSearch} onAlbumSortChange={setAlbumSort}
        onMouseEnter={sidebarEnter} onMouseLeave={sidebarLeave}
        onDragOver={sidebarDragOver} pinned={sidebarPinned}
        onTogglePin={() => setSidebarPinned(p => !p)} onClose={() => setSidebarOpen(false)}
      />

      {/* 主内容区 */}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
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
          </div>

          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexShrink: 0 }}>
            <select value={sortBy} onChange={e => updateParams({ sort: e.target.value === 'modified-desc' ? null : e.target.value, p: null })} style={{ height: 28, fontSize: 'var(--text-xs)' }}>
              {activeGroup.startsWith('album:') && <option value="custom">🔢 自定义顺序</option>}
              {SORT_OPTIONS.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
            </select>
            {isAlbumSortMode && <button className="btn-sm" onClick={() => { const ak = activeGroup.slice(6); const o = paged.map(g => g.gid); const cfg = { ...albumConfig }; if (cfg[ak]) cfg[ak] = { ...cfg[ak], order: o }; saveAlbums(cfg); setToast('顺序已保存') }}>💾</button>}
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
        return <div className="modal-overlay" onClick={() => setAlbumModal(null)}><div className="modal" style={{ maxWidth: 440 }} onClick={e => e.stopPropagation()}><h3>📁 添加到专辑</h3><p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{albumModal.title}</p>
          {matched.length > 0 && <div style={{ marginTop: 'var(--space-3)' }}><div style={{ fontSize: 'var(--text-2xs)', color: 'var(--warning)' }}>🔗 匹配的专辑</div><div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>{matched.map(({ key, name, count }) => <button key={key} className="btn-sm" onClick={() => { const cfg = { ...albumConfig }; if (!cfg[key]) cfg[key] = { name: key, gids: [] }; cfg[key].gids = [...cfg[key].gids.filter(id => id !== albumModal.gid), albumModal.gid]; saveAlbums(cfg); setAlbumModal(null); setToast(`已添加到 "${name}"`) }} style={{ borderColor: 'var(--accent-border)', color: 'var(--warning)' }}>📁 {name} ({count})</button>)}</div></div>}
          {Object.keys(albumConfig).length > 0 && <div style={{ marginTop: 'var(--space-3)' }}><div style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-muted)' }}>选择已有专辑</div><div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>{Object.entries(albumConfig).map(([key, val]) => { const isM = matched.some(m => m.key === key); return <button key={key} className="btn-sm" disabled={isM} onClick={() => { const cfg = { ...albumConfig }; cfg[key].gids = [...(cfg[key].gids || []).filter(id => id !== albumModal.gid), albumModal.gid]; saveAlbums(cfg); setAlbumModal(null); setToast(`已添加到 "${val.name || key}"`) }} style={isM ? { opacity: 0.4 } : {}}>📁 {val.name || key} ({(val.gids || []).length})</button> })}</div></div>}
          {kt.length > 0 && <div style={{ marginTop: 'var(--space-3)' }}><div style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-secondary)' }}>🏷 用关键标签创建专辑</div><div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>{kt.map((t, i) => <button key={i} className="btn-sm" onClick={() => { const cfg = { ...albumConfig }; cfg[t.tag] = { name: t.tag, gids: [...(cfg[t.tag]?.gids || []), albumModal.gid] }; saveAlbums(cfg); setAlbumModal(null); setToast(`已创建专辑 "${t.tag}"`) }}>{t.ns === 'artist' ? '👤' : '👥'} {t.tag}</button>)}</div></div>}
          <div style={{ marginTop: 'var(--space-4)', textAlign: 'right' }}><button className="btn-sm" onClick={() => setAlbumModal(null)}>取消</button></div>
        </div></div>
      })()}

      {editingAlbumKey && <AlbumEditModal albumKey={editingAlbumKey} albumConfig={albumConfig} onClose={() => setEditingAlbumKey(null)} onUpdated={handleAlbumUpdated} />}

      {/* 编辑标签 */}
      {editTagsModal && (
        <div className="modal-overlay" onClick={() => setEditTagsModal(null)}><div className="modal" onClick={e => e.stopPropagation()}>
          <h3>🏷 编辑标签</h3><p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>GID: {editTagsModal.gid} — {editTagsModal.title}</p>
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
            <button className="btn-sm" onClick={async () => { setEditTagsSaving(true); try { const ct = {}; Object.entries(editTagsForm.tags).forEach(([k, v]) => { if (v && v.length > 0) ct[k] = v }); await updateGalleryMetaTags(editTagsModal.gid, { tags: ct, title: editTagsForm.title, category: editTagsForm.category, language: editTagsForm.language || null }); setEditTagsModal(null); loadMetas(); loadPaged(); setToast('标签已更新') } catch (e) { setToast('更新失败: ' + e.message) }; setEditTagsSaving(false) }} disabled={editTagsSaving} style={{ color: 'var(--warning)' }}>💾 保存</button>
          </div>
        </div></div>
      )}

      {/* 导入外部作品 */}
      {importModal && (
        <div className="modal-overlay" onClick={() => setImportModal(false)}><div className="modal" onClick={e => e.stopPropagation()}>
          <h3>📥 导入外部作品</h3>
          <div style={{ marginTop: 'var(--space-3)' }}>
            <div style={{ display: 'flex', gap: 'var(--space-2)' }}><input type="text" value={importForm.sourceDir} onChange={e => setImportForm(f => ({ ...f, sourceDir: e.target.value }))} style={{ flex: 1 }} placeholder="源文件夹路径" /><button className="btn-sm" onClick={async () => { try { const d = await browseDirectory(importForm.sourceDir || ''); setImportDirBrowser({ show: true, path: importForm.sourceDir || '', items: d, stack: [importForm.sourceDir || ''] }) } catch (e) { setToast('无法浏览: ' + e.message) } }}>📁 浏览</button></div>
          </div>
          {importDirBrowser.show && (
            <div style={{ marginTop: 'var(--space-2)', maxHeight: 180, overflowY: 'auto', background: 'var(--surface-card)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)', padding: 'var(--space-1)' }}>
              <div style={{ display: 'flex', gap: 4, marginBottom: 4 }}><button className="btn-sm" onClick={async () => { const p = importDirBrowser.path.split(/[\\/]/).filter(Boolean).slice(0, -1).join('\\') + '\\'; const d = await browseDirectory(p); setImportDirBrowser(pr => ({ ...pr, path: p, items: d, stack: [...pr.stack, p] })) }}>⬆ 上级</button><span style={{ fontSize: 'var(--text-3xs)', color: 'var(--text-muted)', padding: '3px 6px' }}>{importDirBrowser.path}</span></div>
              {importDirBrowser.items.map((d, i) => (
                <div key={i} style={{ padding: '3px 8px', cursor: d.isDir ? 'pointer' : 'default', fontSize: 'var(--text-xs)', color: d.isDir ? 'var(--accent-teal)' : 'var(--text-muted)', borderRadius: 'var(--radius-xs)', display: 'flex', alignItems: 'center', gap: 6 }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'var(--hover-bg)' }} onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
                  onClick={async () => { if (d.isDir) { const data = await browseDirectory(d.path); setImportDirBrowser(p => ({ ...p, path: d.path, items: data, stack: [...p.stack, d.path] })) } }}>
                  {d.isDir ? '📁' : '📄'} {d.name}
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
              <div style={{ color: 'var(--success)' }}>✅ 成功 {batchImportResult.success} / ❌ 失败 {batchImportResult.failed}</div>
              {batchImportResult.results.map((r, i) => <div key={i} style={{ color: r.success ? 'var(--success)' : 'var(--error)' }}>{r.success ? `✅ ${r.title} (${r.fileCount}页)` : `❌ ${r.folder}: ${r.error}`}</div>)}
            </div>
          )}
          <div className="modal-actions" style={{ justifyContent: 'flex-end' }}>
            <button className="btn-sm" onClick={() => { setBatchImportModal(false); setBatchImportResult(null); setImportDirBrowser({ show: false, path: '', items: [], stack: [] }) }}>关闭</button>
            <button className="btn-sm" onClick={async () => { if (!batchImportForm.parentDir.trim()) { setToast('请选择父目录'); return }; setBatchImporting(true); try { const r = await batchImportGalleries(batchImportForm.parentDir.trim(), batchImportForm.copyFiles); setBatchImportResult(r); loadMetas(); loadPaged() } catch (e) { setToast('批量导入失败: ' + e.message) }; setBatchImporting(false) }} disabled={batchImporting} style={{ color: 'var(--warning)' }}>{batchImporting ? '导入中...' : '🚀 开始'}</button>
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