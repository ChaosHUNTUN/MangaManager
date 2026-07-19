import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { Link, useSearchParams, useNavigate } from 'react-router-dom'
import { fetchLocalGalleryMetas, fetchLocalGalleriesPaged, fetchLocalGalleriesRandom, fetchLocalGalleryGids, fetchLocalGalleryDetail, getLocalCoverUrl, deleteLocalGallery, translateEHTags, suggestEHTags, redownloadLocalGallery, batchRedownloadLocalGalleries, fetchAlbumConfig, saveAlbumConfig, renameAlbum, importLocalGallery, batchImportGalleries, fetchGalleryMetaTags, updateGalleryMetaTags, browseDirectory } from '../api'
import useGalleryDrag from '../hooks/useGalleryDrag'
import GalleryDetail from '../components/GalleryDetail'
import AlbumSidebar from '../components/AlbumSidebar'
import AlbumEditModal from '../components/AlbumEditModal'

const CATEGORY_COLORS = {
  doujinshi: '#F44336', manga: '#FF9800', 'artist cg': '#FBC02D',
  'game cg': '#4CAF50', western: '#8BC34A', 'non-h': '#2196F3',
  imageset: '#9C27B0', cosplay: '#E91E63', 'asian porn': '#795548',
  misc: '#607D8B', private: '#607D8B', other: '#607D8B'
}
const getCategoryColor = (cat) => CATEGORY_COLORS[(cat || '').toLowerCase()] || '#607D8B'
const formatSize = (b) => b > 1e9 ? (b / 1e9).toFixed(1) + ' GB' : b > 1e6 ? (b / 1e6).toFixed(0) + ' MB' : b + ' B'
const PAGE_OPTIONS = [20, 40, 60]
const SORT_OPTIONS = [
  { key: 'modified-desc', label: '最近修改' }, { key: 'modified-asc', label: '最早修改' },
  { key: 'title-asc', label: '标题 A-Z' }, { key: 'title-desc', label: '标题 Z-A' },
  { key: 'pages-desc', label: '页数最多' }, { key: 'pages-asc', label: '页数最少' },
  { key: 'size-desc', label: '大小最大' }, { key: 'size-asc', label: '大小最小' },
]

export default function LocalGallery() {
  const navigate = useNavigate()

  // === 元数据流：轻量全量数据，用于侧边栏分组/标签池/搜索补全 ===
  const [galleryMetas, setGalleryMetas] = useState([])    // LocalGalleryMeta[]
  const [metaLoading, setMetaLoading] = useState(true)

  // === 展示流：服务端分页摘要，用于画廊卡片 ===
  const [pageItems, setPageItems] = useState([])           // LocalGallerySummary[]
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
// 搜索用标签翻译缓存：{ "artist:wada" -> "和田" }
const [searchTagTransMap, setSearchTagTransMap] = useState({})
const [toasts, setToasts] = useState([])
const toastIdRef = useRef(0)
const setToast = (msg, duration = 2000) => {
  if (!msg) return // 兼容 setToast(null) 清空
  const id = ++toastIdRef.current
  setToasts(prev => [...prev.slice(-3), { id, msg, key: id }]) // 最多保留3条
  setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), duration)
}

  // 筛选状态全部映射到 URL 参数（React Router 7 useSearchParams）
  const [searchParams, setSearchParams] = useSearchParams()
  const search = searchParams.get('q') || ''
  const sortBy = searchParams.get('sort') || 'modified-desc'
  const pageSize = parseInt(searchParams.get('size') || '20', 10)
  const page = parseInt(searchParams.get('p') || '1', 10)
  const viewMode = searchParams.get('view') || 'grid'
  const activeGroup = searchParams.get('group') || 'all'
  const randomMode = searchParams.get('random') === 'true'

  // 更新 URL 参数的辅助函数（保留其他参数；非随机操作自动清除 random 标记）
  const updateParams = useCallback((updates) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev)
      // 如果不是 loadRandom 显式设置 random，则退出随机模式
      if (!('random' in updates)) {
        next.delete('random')
      }
      Object.entries(updates).forEach(([k, v]) => {
        if (v === null || v === undefined || v === '' || v === 'all' || v === 'modified-desc' || v === 'grid' || v === 20 || v === 1) {
          next.delete(k)
        } else {
          next.set(k, String(v))
        }
      })
      return next
    }, { replace: true })
  }, [setSearchParams])

  const setSearch = useCallback((v) => updateParams({ q: v || null }), [updateParams])
  const setSortBy = useCallback((v) => updateParams({ sort: v === 'modified-desc' ? null : v }), [updateParams])
  const setPageSize = useCallback((v) => updateParams({ size: v === 20 ? null : v }), [updateParams])
  const setPage = useCallback((v) => updateParams({ p: v === 1 ? null : v }), [updateParams])
  const setViewMode = useCallback((v) => updateParams({ view: v === 'grid' ? null : v }), [updateParams])
  const setActiveGroup = useCallback((v) => updateParams({ group: v === 'all' ? null : v }), [updateParams])

  // 搜索自动补全
  const [searchSuggestions, setSearchSuggestions] = useState([])
  const [showSearchSuggestions, setShowSearchSuggestions] = useState(false)
  const [cursorPos, setCursorPos] = useState(0)
  const searchInputRef = useRef(null)
  const suggestTimerRef = useRef(null)

  // 导入外部作品对话框
  const [importModal, setImportModal] = useState(false)
  const [importForm, setImportForm] = useState({
    sourceDir: '', title: '', category: 'doujinshi', language: '',
    artists: '', groups: '', otherTags: '', copyFiles: true
  })
  const [importing, setImporting] = useState(false)
  const [importDirBrowser, setImportDirBrowser] = useState({ show: false, path: '', items: [], stack: [] })

  // 批量导入
  const [batchImportModal, setBatchImportModal] = useState(false)
  const [batchImportForm, setBatchImportForm] = useState({ parentDir: '', copyFiles: true })
  const [batchImporting, setBatchImporting] = useState(false)
  const [batchImportResult, setBatchImportResult] = useState(null)

  // 编辑标签对话框
  const [editTagsModal, setEditTagsModal] = useState(null) // { gid, title, tags }
  const [editTagsForm, setEditTagsForm] = useState({ title: '', category: '', language: '', tags: {} })
  const [editTagsSaving, setEditTagsSaving] = useState(false)

  // 自定义专辑配置 { key: { name: "显示名", gids: [1,2,3] } }
  const [albumConfig, setAlbumConfig] = useState({})
  const [albumsLoaded, setAlbumsLoaded] = useState(false)

  // 专辑侧边栏：搜索 + 排序
  const [albumSearch, setAlbumSearch] = useState('')       // 专辑搜索关键词
  const [albumSort, setAlbumSort] = useState('default')     // default | name-asc | name-desc | count-asc | count-desc | time-asc | time-desc

  // 专辑编辑弹窗
  const [editingAlbumKey, setEditingAlbumKey] = useState(null)

  // 从数据库加载，回退到 localStorage
  useEffect(() => {
    (async () => {
      const data = await fetchAlbumConfig()
      if (data && Object.keys(data).length > 0) {
        setAlbumConfig(data)
      } else {
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
    setAlbumConfig(cfg)  // 即时更新视觉
    try { localStorage.setItem('local-albums', JSON.stringify(cfg)) } catch { }
    try {
      await saveAlbumConfig(cfg)
    } catch (e) {
      setToast('保存专辑失败: ' + e.message)
      setTimeout(() => setToast(null), 3000)
    }
  }, [])

  // 辅助函数
  const getAlbumGids = (key) => albumConfig[key]?.gids || []
  const getAlbumName = (key) => albumConfig[key]?.name || key
  const getAlbumColor = (key) => albumConfig[key]?.color || '#7c3aed'
  const getAllAlbumGids = useCallback(() => {
    const all = new Set()
    Object.values(albumConfig).forEach(v => v.gids?.forEach(id => all.add(id)))
    return all
  }, [albumConfig])

  // gid -> { key, name, color } 映射（用于飘带标记）
  const gidToAlbum = useMemo(() => {
    const map = {}
    Object.entries(albumConfig).forEach(([key, val]) => {
      if (val.gids && val.gids.length > 0) {
        val.gids.forEach(gid => {
          map[gid] = { key, name: val.name || key, color: val.color || '#7c3aed' }
        })
      }
    })
    return map
  }, [albumConfig])

  // 侧边栏
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [albumModal, setAlbumModal] = useState(null)
  const [dragGid, setDragGid] = useState(null)

  // 点击触发的 hover 层
  const [hoveredGid, setHoveredGid] = useState(null)

  // 鼠标位置跟踪（侧边栏自动展开）
  const sidebarTimeoutRef = useRef(null)
  // 侧边栏悬停展开

  // === 元数据流：一次性加载轻量全量数据 ===
  useEffect(() => { loadMetas() }, [])

  const loadMetas = async () => {
    setMetaLoading(true)
    try { setGalleryMetas(await fetchLocalGalleryMetas()) } catch (e) { setError(e.message) }
    setMetaLoading(false)
  }

  // === 展示流：筛选/排序/分页变化时重新加载当前页摘要 ===
  const loadPaged = useCallback(async (targetPage) => {
    setPageItems([])       // 立即清空旧数据，触发骨架屏
    setPageLoading(true)
    try {
      const p = targetPage ?? page
      // 收集所有自定义专辑的 gid 合集（用于 unknown/multi/artist/group 分组排除已分配作品）
      const allAlbumGids = Object.values(albumConfig).flatMap(v => v.gids || [])
      let albumGids = null, albumOrder = null
      if (activeGroup.startsWith('album:')) {
        const albumKey = activeGroup.slice(6)
        const album = albumConfig[albumKey]
        if (album) {
          albumGids = album.gids || []
          albumOrder = sortBy === 'custom' ? (album.order || album.gids) : null
        }
      }
      const result = await fetchLocalGalleriesPaged({
        group: activeGroup, search, sort: sortBy,
        page: p, pageSize,
        albumGids: activeGroup.startsWith('album:') ? albumGids : allAlbumGids,
        albumOrder
      })
      setPageItems(result.items || [])
      setPageTotal(result.total || 0)
      setPageTotalPages(result.totalPages || 1)
    } catch (e) { setError(e.message) }
    setPageLoading(false)
  }, [activeGroup, search, sortBy, pageSize, page, albumConfig])

  const RANDOM_CACHE_KEY = 'local-random-cache'

  // 随机抽取（无视筛选条件）
  // forceRefresh=true: 重新从服务端随机抽取并更新缓存（用户点击按钮时）
  // forceRefresh=false: 优先使用缓存，无缓存时才请求服务端（退出阅读器恢复时）
  const loadRandom = useCallback(async (forceRefresh = false) => {
    // 非强制刷新时，优先还原缓存的随机结果（退出阅读器回到随机模式）
    if (!forceRefresh) {
      try {
        const cached = JSON.parse(sessionStorage.getItem(RANDOM_CACHE_KEY))
        if (cached?.items?.length > 0) {
          setPageItems(cached.items)
          setPageTotal(cached.total || cached.items.length)
          setPageTotalPages(1)
          setPageLoading(false)
          return
        }
      } catch { /* 缓存损坏则回退到服务端请求 */ }
    }

    setPageItems([])
    setPageLoading(true)
    try {
      const result = await fetchLocalGalleriesRandom(20)
      setPageItems(result.items || [])
      setPageTotal(result.total || 0)
      setPageTotalPages(result.totalPages || 1)
      // 缓存到 sessionStorage，退出阅读器后可恢复
      try {
        sessionStorage.setItem(RANDOM_CACHE_KEY, JSON.stringify({
          items: result.items, total: result.total, timestamp: Date.now()
        }))
      } catch { }
      // 清空筛选条件但保留 random 标记
      updateParams({ group: null, q: null, sort: null, p: null, size: null, random: 'true' })
    } catch (e) { setError(e.message) }
    setPageLoading(false)
  }, [updateParams])

  // 筛选条件或翻页变化 → 重新加载（随机模式单独处理）
  useEffect(() => {
    if (!albumsLoaded) return
    if (randomMode) {
      loadRandom()
      return
    }
    loadPaged(page)
  }, [activeGroup, search, sortBy, pageSize, page, albumsLoaded, randomMode])

  // 下载后自动刷新元数据 + 当前页
  useEffect(() => {
    const handler = () => {
      loadMetas()
      loadPaged()
    }
    window.addEventListener('local-gallery-auto-match', handler)
    return () => window.removeEventListener('local-gallery-auto-match', handler)
  }, [loadPaged])

  // 构建搜索用标签翻译缓存：从 galleryMetas 收集标签（防 StrictMode 双重调用）
  const translateTriggerRef = useRef(0)
  useEffect(() => {
    if (galleryMetas.length === 0) return
    const len = galleryMetas.length
    if (translateTriggerRef.current === len) return  // 相同长度已翻译过，跳过
    translateTriggerRef.current = len
    const tagSet = new Set()
    galleryMetas.forEach(g => {
      (g.artists || []).forEach(t => tagSet.add(`artist:${t}`))
      ;(g.groups || []).forEach(t => tagSet.add(`group:${t}`))
      if (g.language) tagSet.add(`language:${g.language}`)
      if (g.category) tagSet.add(`category:${g.category}`)
    })
    if (tagSet.size === 0) return
    const tagList = Array.from(tagSet)
    // 分批翻译，每批最多 200 个
    const batchSize = 200
    const translateBatches = async () => {
      const transMap = {}
      for (let i = 0; i < tagList.length; i += batchSize) {
        const batch = tagList.slice(i, i + batchSize)
        try {
          const r = await translateEHTags(batch)
          ;(r.data || []).forEach(item => {
            if (item.cn) transMap[item.key] = item.cn
          })
        } catch { /* 翻译失败不影响搜索功能 */ }
      }
      setSearchTagTransMap(transMap)
    }
    translateBatches()
  }, [galleryMetas.length])

  // 辅助：从画廊数据提取可匹配的标签（含 allTags）
  const getGalleryTags = useCallback((g) => {
    const artists = g.artists || []
    const groups = g.groups || []
    const allTags = g.allTags || []
    return { artists, groups, allTags, all: [...artists, ...groups, ...allTags] }
  }, [])


  // 当 albumConfig 和 galleryMetas 都加载完成后，自动将未分类作品匹配到自定义专辑
  useEffect(() => {
    if (!albumsLoaded || galleryMetas.length === 0) return
    if (Object.keys(albumConfig).length === 0) return

    const albumGids = new Set(Object.values(albumConfig).flatMap(v => v.gids || []))
    let changed = false
    const cfg = { ...albumConfig }

    galleryMetas.forEach(g => {
      if (albumGids.has(g.gid)) return
      const simpleTags = [...(g.artists || []), ...(g.groups || [])]
      const namespaceTags = g.allTags || []
      // 优先用 namespace:tag 精确匹配，再回退 simpleTags 兼容旧专辑
      const allCandidateTags = [...new Set([...namespaceTags, ...simpleTags])]
      for (const tag of allCandidateTags) {
        if (cfg[tag]) {
          const gids = cfg[tag].gids || []
          if (!gids.includes(g.gid)) {
            cfg[tag] = { ...cfg[tag], gids: [...gids, g.gid] }
            if (cfg[tag].order) {
              cfg[tag].order = [...cfg[tag].order, g.gid]
            }
            changed = true
            break
          }
        }
      }
      // 额外检测 KeyTag：专辑的 KeyTag 字段匹配 allTags 中的某项
      if (!changed) {
        for (const [albumKey, albumVal] of Object.entries(cfg)) {
          const kt = albumVal.keyTag
          if (kt && namespaceTags.includes(kt)) {
            const gids = albumVal.gids || []
            if (!gids.includes(g.gid)) {
              cfg[albumKey] = { ...albumVal, gids: [...gids, g.gid] }
              if (albumVal.order) {
                cfg[albumKey].order = [...albumVal.order, g.gid]
              }
              changed = true
              break
            }
          }
        }
      }
    })

    if (changed) {
      saveAlbums(cfg)
      console.log('[auto-match] 已将新作品自动匹配到专辑')
    }
  }, [galleryMetas, albumConfig, albumsLoaded])


  // 计算分组（自动分组 + 自定义专辑），基于 galleryMetas
  const groups = useMemo(() => {
    const map = new Map()
    const allArtistGroupNames = new Set()
    galleryMetas.forEach(g => {
      (g.artists || []).forEach(a => allArtistGroupNames.add(a))
      ;(g.groups || []).forEach(gr => allArtistGroupNames.add(gr))
    })
    // 自定义专辑
    Object.entries(albumConfig).forEach(([key, val]) => {
      const gids = val.gids || []
      if (gids.length === 0 && !allArtistGroupNames.has(key)) return
      map.set(`album:${key}`, { type: 'album', key: `album:${key}`, name: val.name || key, count: gids.length, editable: true, createdAt: val.createdAt || val.updatedAt, updatedAt: val.updatedAt })
    })
    // 未匹配到专辑的自动分组
    const albumGids = new Set(Object.values(albumConfig).flatMap(v => v.gids || []))
    galleryMetas.forEach(g => {
      if (albumGids.has(g.gid)) return
      const artists = g.artists || []
      const grps = g.groups || []
      if (artists.length === 1 && grps.length === 0) {
        const key = `artist:${artists[0]}`
        if (!map.has(key)) map.set(key, { type: 'artist', name: artists[0], count: 0 })
        map.get(key).count++
      } else if (grps.length === 1 && artists.length === 0) {
        const key = `group:${grps[0]}`
        if (!map.has(key)) map.set(key, { type: 'group', name: grps[0], count: 0 })
        map.get(key).count++
      } else if (artists.length === 1 && grps.length === 1) {
        const key = `artist:${artists[0]}`
        if (!map.has(key)) map.set(key, { type: 'artist', name: artists[0], count: 0 })
        map.get(key).count++
      } else if (artists.length + grps.length > 1) {
        if (!map.has('multi')) map.set('multi', { type: 'multi', name: '多作者', count: 0 })
        map.get('multi').count++
      } else {
        if (!map.has('unknown')) map.set('unknown', { type: 'unknown', name: '未分类', count: 0 })
        map.get('unknown').count++
      }
    })
    const searchLower = albumSearch.trim().toLowerCase()
    const filtered = Array.from(map.entries())
      .filter(([, v]) => v.type === 'album' || v.count > 0)
      .filter(([, v]) => !searchLower || (v.name || '').toLowerCase().includes(searchLower))
    const sortAlbums = (items) => {
      const albums = items.filter(([, v]) => v.type === 'album')
      const autoGroups = items.filter(([, v]) => v.type !== 'album')
      albums.sort((a, b) => {
        switch (albumSort) {
          case 'name-asc': return (a[1].name || '').localeCompare(b[1].name || '')
          case 'name-desc': return (b[1].name || '').localeCompare(a[1].name || '')
          case 'count-asc': return (a[1].count || 0) - (b[1].count || 0)
          case 'count-desc': return (b[1].count || 0) - (a[1].count || 0)
          case 'time-asc': {
            const ta = a[1].createdAt || a[1].updatedAt || ''
            const tb = b[1].createdAt || b[1].updatedAt || ''
            return ta.localeCompare(tb)
          }
          case 'time-desc': {
            const ta = a[1].createdAt || a[1].updatedAt || ''
            const tb = b[1].createdAt || b[1].updatedAt || ''
            return tb.localeCompare(ta)
          }
          default: {
            const ta = a[1].createdAt || a[1].updatedAt || ''
            const tb = b[1].createdAt || b[1].updatedAt || ''
            return ta.localeCompare(tb)
          }
        }
      })
      autoGroups.sort((a, b) => b[1].count - a[1].count)
      return [...albums, ...autoGroups]
    }
    return sortAlbums(filtered).map(([key, val]) => ({ key, ...val }))
  }, [galleryMetas, albumConfig, albumSearch, albumSort])

  // 搜索自动补全的标签池（用 ref 缓存，仅在 metas 数量变化时重建）
  const searchTagPoolRef = useRef([])
  const searchTagPool = useMemo(() => {
    if (searchTagPoolRef.current.length > 0 && galleryMetas.length === searchTagPoolRef.current._count) {
      return searchTagPoolRef.current
    }
    const pool = []
    const seen = new Set()
    const add = (prefix, label) => {
      const key = `${prefix}:${label}`
      if (!seen.has(key)) { seen.add(key); pool.push({ key, label, prefix, syntax: `${prefix}:${label}` }) }
    }
    galleryMetas.forEach(g => {
      (g.artists || []).forEach(t => add('artist', t))
      ;(g.groups || []).forEach(t => add('group', t))
      if (g.category) add('category', g.category)
      if (g.language) add('language', g.language)
    })
    Object.entries(albumConfig).forEach(([, val]) => {
      const name = val.name || ''
      if (name && !seen.has(name)) { seen.add(name); pool.push({ key: name, label: name, prefix: 'album', syntax: name }) }
    })
    pool._count = galleryMetas.length
    searchTagPoolRef.current = pool.sort((a, b) => a.label.localeCompare(b.label))
    return searchTagPoolRef.current
  }, [galleryMetas.length, albumConfig])

  // 搜索输入处理（含自动补全）
  const handleSearchInput = (e) => {
    // IME 拼音组合期间跳过 URL 更新，避免拼音字母被写入 URL 导致异常累增
    // 使用原生事件的 isComposing 属性，兼容性最好
    if (e.nativeEvent.isComposing) return
    const val = e.target.value
    setSearch(val)
    const pos = e.target.selectionStart || 0
    setCursorPos(pos)

    // 获取光标前的当前词（最后一个空格之后的内容）
    const lastSpace = val.lastIndexOf(' ', pos - 1)
    const currentWord = val.substring(lastSpace + 1, pos).trim().toLowerCase()

    if (suggestTimerRef.current) clearTimeout(suggestTimerRef.current)
    if (currentWord.length >= 1) {
      suggestTimerRef.current = setTimeout(async () => {
        // 先从本地标签池搜索
        const localFiltered = searchTagPool
          .filter(t => t.label.toLowerCase().includes(currentWord))
          .slice(0, 8)
        if (localFiltered.length >= 3) {
          // 本地结果足够，直接显示
          setSearchSuggestions(localFiltered)
          setShowSearchSuggestions(true)
          return
        }
        // 本地结果不足，尝试从后端标签翻译数据库搜索（支持中文输入）
        try {
          const ehResults = await suggestEHTags(currentWord, 10)
          const merged = [...localFiltered]
          const seenLabels = new Set(localFiltered.map(t => t.syntax.toLowerCase()))
          for (const r of ehResults) {
            const syntax = r.ehSyntax || ''
            if (seenLabels.has(syntax.toLowerCase())) continue
            // 只保留 namespace 在本地画廊中实际存在的标签类型
            const prefix = syntax.split(':')[0]?.toLowerCase()
            if (!['artist', 'group', 'language', 'parody', 'category', 'female', 'male', 'misc'].includes(prefix)) continue
            seenLabels.add(syntax.toLowerCase())
            merged.push({
              key: syntax,
              label: `${r.cn || r.tag} (${syntax})`,
              prefix,
              syntax
            })
          }
          setSearchSuggestions(merged.slice(0, 8))
          setShowSearchSuggestions(merged.length > 0)
        } catch {
          // API 失败时仍然显示本地结果
          setSearchSuggestions(localFiltered)
          setShowSearchSuggestions(localFiltered.length > 0)
        }
      }, 200)
    } else {
      setShowSearchSuggestions(false)
    }
  }

  const applySearchTag = (tag) => {
    const val = search
    const pos = cursorPos
    const lastSpace = val.lastIndexOf(' ', pos - 1)
    const before = val.substring(0, lastSpace + 1)
    const after = val.substring(pos)
    const newVal = (before + tag.syntax + ' ' + after).replace(/\s+/g, ' ').trim()
    updateParams({ q: newVal || null, p: null })
    setShowSearchSuggestions(false)
    searchInputRef.current?.focus()
  }

  const handleSearchKey = (e) => {
    if (e.key === 'Escape') setShowSearchSuggestions(false)
  }

  // 分页数据来自服务端 pageItems / pageTotal / pageTotalPages
  // 注意：pageItems 本身就是当前页的摘要列表（含中文搜索翻译匹配，由后端 ApplyFilters 处理 tag:value 语法匹配；
  // 中文标签名搜索由 searchTagTransMap 辅助前端补全后通过 search 参数传递）

  const totalPages = pageTotalPages
  const safePage = Math.min(page, totalPages)
  const paged = pageItems

  const handleDelete = async (gid) => { setDeleting(true); try { await deleteLocalGallery(gid); setDeleteConfirm(null); setDetail(null); loadMetas(); loadPaged() } catch (e) { setError(e.message) } setDeleting(false) }
  const handleBatchDelete = async () => { setDeleting(true); try { for (const gid of selected) await deleteLocalGallery(gid); setSelected(new Set()); setBatchMode(false); setBatchDeleteConfirm(false); loadMetas(); loadPaged() } catch (e) { setError(e.message) } setDeleting(false) }
  const handleRedownload = async (gid, title, token) => { try { await redownloadLocalGallery(gid, title, token); setToast('重新下载任务已启动'); setTimeout(() => setToast(null), 1500); setDetail(null) } catch (e) { setToast('重新下载失败: ' + e.message); setTimeout(() => setToast(null), 1500) } }
  const handleBatchRedownload = async () => { setDeleting(true); try { const r = await batchRedownloadLocalGalleries(Array.from(selected)); setBatchRedownloadConfirm(false); setSelected(new Set()); setBatchMode(false); loadMetas(); loadPaged(); setToast(r ? `批量重新下载: ${r.success} 成功${r.skipped > 0 ? `, ${r.skipped} 跳过` : ''}${r.failed > 0 ? `, ${r.failed} 失败` : ''}` : '批量重新下载任务已启动'); setTimeout(() => setToast(null), 2000) } catch (e) { setToast('批量重新下载失败: ' + e.message); setTimeout(() => setToast(null), 1500) } setDeleting(false) }

  const openDetail = async (gid) => {
    setDetailLoading(true)
    try { const d = await fetchLocalGalleryDetail(gid); setDetail(d); if (d?.tagGroups?.length) { const allTags = []; d.tagGroups.forEach(g => { allTags.push(`n:${g.namespace}`); g.tags.forEach(t => allTags.push(`${g.namespace}:${t}`)) }); translateEHTags(allTags).then(r => { const tMap = {}, nsMap = {}; (r.data || []).forEach(item => { if (item.key?.startsWith('n:')) nsMap[item.key.substring(2)] = item.cn; else if (item.cn) tMap[item.key] = item.cn }); setTagTranslations(tMap); setNsTranslations(nsMap) }).catch(() => {}) } } catch (e) { setError(e.message) }
    setDetailLoading(false)
  }

  // 打开阅读器：先写当前页 gids 立即跳转，后台加载完整 gid 列表并更新 sessionStorage
  const handleOpenReader = useCallback(async (gid) => {
    // 1) 立即保存当前页 gids 到 sessionStorage（阅读器快速启动）
    const allAlbumGids = Object.values(albumConfig).flatMap(v => v.gids || [])
    let albumGids = null, albumOrder = null
    if (activeGroup.startsWith('album:')) {
      const album = albumConfig[activeGroup.slice(6)]
      if (album) {
        albumGids = album.gids || []
        albumOrder = sortBy === 'custom' ? (album.order || album.gids) : null
      }
    }
    sessionStorage.setItem('reader-local-context', JSON.stringify({
      group: activeGroup, search, sort: sortBy,
      gids: paged.map(g2 => g2.gid),
      total: pageTotal
    }))
    sessionStorage.setItem('reader-local-return-url', window.location.search)

    // 2) 立即跳转到阅读器
    navigate(`/reader-local/${gid}`)

    // 3) 后台异步加载完整 gid 列表，加载完更新 sessionStorage
    try {
      const fullGids = await fetchLocalGalleryGids({
        group: activeGroup === 'all' ? null : activeGroup,
        search: search || null,
        sort: sortBy || null,
        albumGids: activeGroup.startsWith('album:') ? albumGids : allAlbumGids.length > 0 ? allAlbumGids : null,
        albumOrder
      })
      if (fullGids && fullGids.length > 0) {
        console.log(`[LocalGallery] 完整 gid 列表已缓存: ${fullGids.length} 部 (前5: ${fullGids.slice(0,5).join(',')}...)`, fullGids)
        sessionStorage.setItem('reader-local-full-gids', JSON.stringify(fullGids))
      }
    } catch { /* 静默失败，阅读器使用当前页 gids */ }
  }, [activeGroup, search, sortBy, pageTotal, paged, albumConfig, navigate])

  // 判断当前是否在专辑自定义排序模式
  const isAlbumSortMode = activeGroup.startsWith('album:') && sortBy === 'custom'

  // 专辑 drop 逻辑
  const doAlbumDrop = useCallback((gid, albumKey) => {
    const cfg = { ...albumConfig }
    Object.keys(cfg).forEach(k => { if (cfg[k]) cfg[k] = { ...cfg[k], gids: cfg[k].gids.filter(id => id !== gid) } })
    if (!cfg[albumKey]) {
      const used = new Set(Object.values(cfg).map(v => v.color).filter(Boolean))
      let color = null
      for (const c of ALBUM_PALETTE) { if (!used.has(c)) { color = c; break } }
      if (!color) color = '#' + Math.floor(Math.random() * 0xFFFFFF).toString(16).padStart(6, '0')
      cfg[albumKey] = { name: albumKey, color, gids: [], order: [] }
    }
    const existing = cfg[albumKey].gids.filter(id => id !== gid)
    cfg[albumKey] = { ...cfg[albumKey], gids: [...existing, gid] }
    if (cfg[albumKey].order) {
      cfg[albumKey].order = [...cfg[albumKey].order.filter(id => id !== gid), gid]
    }
    saveAlbums(cfg)
    setToast(`已移动到 "${cfg[albumKey]?.name || albumKey}"`)
    setTimeout(() => setToast(null), 1500)
  }, [albumConfig, saveAlbums])

  // 专辑内排序拖拽：即时重排 pageItems + 后端持久化
  const doSortDrop = useCallback((gid, targetGid) => {
    const albumKey = activeGroup.slice(6)
    const cfg = { ...albumConfig }
    const album = cfg[albumKey]
    if (!album) return
    const currentOrder = album.order && album.order.length > 0 ? album.order : album.gids
    const filtered = currentOrder.filter(id => id !== gid)
    const targetIdx = filtered.indexOf(targetGid)
    if (targetIdx === -1) filtered.push(gid)
    else filtered.splice(targetIdx, 0, gid)
    cfg[albumKey] = { ...album, order: filtered }

    // 即时重排当前页数据，不等 API 返回
    const orderMap = new Map(filtered.map((id, i) => [id, i]))
    setPageItems(prev => [...prev].sort((a, b) => (orderMap.get(a.gid) ?? 9999) - (orderMap.get(b.gid) ?? 9999)))

    saveAlbums(cfg)
    setToast('排序已更新')
    setTimeout(() => setToast(null), 1500)
  }, [activeGroup, albumConfig, saveAlbums])

  // 拖拽 hook
  const { dragGidRef, handleDragMouseDown } = useGalleryDrag({
    isSortMode: isAlbumSortMode,
    disabled: batchMode,
    onDropToAlbum: doAlbumDrop,
    onDropToSort: doSortDrop,
    onShortClick: (gid) => setHoveredGid(prev => prev === gid ? null : gid),
    onToast: (msg, duration = 2000) => setToast(msg)
  })

  // 同步 dragGid 状态（用于 UI 反馈）
  useEffect(() => {
    const check = () => setDragGid(dragGidRef.current)
    const id = setInterval(check, 100)
    return () => clearInterval(id)
  }, [dragGidRef])

  // 侧边栏鼠标悬停自动展开（也响应 dragover）
  const sidebarEnter = () => {
    if (sidebarTimeoutRef.current) clearTimeout(sidebarTimeoutRef.current)
    setSidebarOpen(true)
  }
  const sidebarLeave = () => {
    sidebarTimeoutRef.current = setTimeout(() => setSidebarOpen(false), 600)
  }
  const sidebarDragOver = (e) => {
    e.preventDefault()
    sidebarEnter()
  }

  const renderPagination = () => {
    if (totalPages <= 1) return null
    const pages = []; const start = Math.max(1, safePage - 2); const end = Math.min(totalPages, safePage + 2)
    for (let i = start; i <= end; i++) pages.push(i)
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 6, marginTop: 20 }}>
        <button className="btn-sm" disabled={safePage <= 1} onClick={() => setPage(safePage - 1)}>« 上一页</button>
        {start > 1 && <><button className="btn-sm" onClick={() => setPage(1)}>1</button><span style={{ color: '#555' }}>...</span></>}
        {pages.map(p => <button key={p} className="btn-sm" style={p === safePage ? { borderColor: '#a78bfa', color: '#a78bfa', background: '#7c3aed20' } : {}} onClick={() => setPage(p)}>{p}</button>)}
        {end < totalPages && <><span style={{ color: '#555' }}>...</span><button className="btn-sm" onClick={() => setPage(totalPages)}>{totalPages}</button></>}
        <button className="btn-sm" disabled={safePage >= totalPages} onClick={() => setPage(safePage + 1)}>下一页 »</button>
      </div>
    )
  }

  const GalleryCard = ({ g, isSel }) => {
    const showOverlay = hoveredGid === g.gid
    const isSortMode = activeGroup.startsWith('album:') && sortBy === 'custom'
    const albumInfo = gidToAlbum[g.gid]
    const ribbonText = albumInfo ? (albumInfo.name.length > 5 ? albumInfo.name.slice(0, 5) + '…' : albumInfo.name) : null
    return (
    <div className="gallery-card"
      data-sort-gid={isSortMode ? g.gid : undefined}
      onClick={() => {
        if (batchMode) setSelected(prev => { const s = new Set(prev); s.has(g.gid) ? s.delete(g.gid) : s.add(g.gid); return s })
        else setHoveredGid(prev => prev === g.gid ? null : g.gid)
      }}
      style={{ background: '#14142a', borderRadius: 10, overflow: 'hidden', cursor: 'pointer', border: `2px solid ${isSel ? '#ef4444' : showOverlay ? '#a78bfa' : '#2a2a4a'}`, transition: 'border-color 0.2s, transform 0.2s', position: 'relative', opacity: dragGid === g.gid ? 0.6 : 1, transform: showOverlay ? 'translateY(-2px)' : 'none' }}>
      {batchMode && <div style={{ position: 'absolute', top: 8, right: 8, zIndex: 10, width: 22, height: 22, borderRadius: 4, background: isSel ? '#ef4444' : 'rgba(0,0,0,0.6)', border: `2px solid ${isSel ? '#ef4444' : '#666'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '0.7rem', fontWeight: 700 }}>{isSel ? '✓' : ''}</div>}
      {/* 专辑飘带标记 */}
      {albumInfo && !batchMode && (
        <div title={albumInfo.name} style={{
          position: 'absolute', top: 6, right: -24, zIndex: 9,
          transform: 'rotate(45deg)',
          background: albumInfo.color,
          color: '#fff', fontSize: '0.58rem', fontWeight: 600,
          padding: '2px 0', width: 84, textAlign: 'center',
          lineHeight: 1.3, letterSpacing: '0.02em',
          boxShadow: '0 1px 3px rgba(0,0,0,0.4)',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          pointerEvents: 'none'
        }}>
          {ribbonText}
        </div>
      )}
      <div style={{ position: 'relative', width: '100%', paddingBottom: '140%', background: '#1a1a2e' }}>
        {/* 封面用 onMouseDown 触发自定义拖拽 */}
        <img src={getLocalCoverUrl(g.gid)} alt={g.title}
          draggable={false}
          onMouseDown={!batchMode ? e => handleDragMouseDown(g.gid, e) : undefined}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', cursor: batchMode ? 'default' : 'grab' }}
          loading="lazy" onError={e => { e.target.style.display = 'none' }} />
        {/* 点击触发的 hover 层 — 覆盖在图片上，阻止拖拽穿透到图片 */}
        {!batchMode && showOverlay && (
          <div onMouseDown={e => e.stopPropagation()} style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', background: 'rgba(0,0,0,0.3)', zIndex: 5 }}>
            <div onClick={e => { e.stopPropagation(); setHoveredGid(null); openDetail(g.gid) }}
              style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(124,58,237,0.3)', cursor: 'pointer' }}>
              <span style={{ color: '#fff', fontSize: '0.85rem', fontWeight: 700, background: 'rgba(0,0,0,0.55)', padding: '4px 14px', borderRadius: 6 }}>📋 详情</span>
            </div>
            <div onClick={e => { e.stopPropagation(); setHoveredGid(null); handleOpenReader(g.gid) }}
              style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(16,185,129,0.3)', cursor: 'pointer' }}>
              <span style={{ color: '#fff', fontSize: '0.85rem', fontWeight: 700, background: 'rgba(0,0,0,0.55)', padding: '4px 14px', borderRadius: 6 }}>📖 阅读</span>
            </div>
          </div>
        )}
      </div>
      <div style={{ padding: '10px 12px' }}>
        {/* 标题行：拖拽手柄 + 标题文字 */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 4 }}>
          {!batchMode && (
            <span onMouseDown={e => { e.stopPropagation(); handleDragMouseDown(g.gid, e) }}
              style={{ flexShrink: 0, color: '#555', cursor: 'grab', fontSize: '0.7rem', lineHeight: 1.3, userSelect: 'none', paddingTop: 1 }}
              title={isAlbumSortMode ? '拖拽到目标位置以排序' : '拖拽到专辑标签以分配'}>⋮⋮</span>
          )}
          <div onClick={e => { if (!batchMode) e.stopPropagation() }}
            title={g.title}
            style={{ fontSize: '0.85rem', lineHeight: 1.4, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', color: '#ccc', fontWeight: 500, userSelect: 'none' }}>
            {g.title}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }}>
          <span style={{ fontSize: '0.7rem', color: '#888' }}>{g.fileCount} 页 · {formatSize(g.totalSize)}</span>
          {g.rating > 0 && <span style={{ fontSize: '0.65rem', color: '#f59e0b' }}>★ {g.rating.toFixed(1)}</span>}
        </div>
      </div>
    </div>
  )}

  const GalleryRow = ({ g, isSel }) => {
    const isSortMode = activeGroup.startsWith('album:') && sortBy === 'custom'
    const albumInfo = gidToAlbum[g.gid]
    const ribbonText = albumInfo ? (albumInfo.name.length > 5 ? albumInfo.name.slice(0, 5) + '…' : albumInfo.name) : null
    return (
    <div
      data-sort-gid={isSortMode ? g.gid : undefined}
      onClick={() => { if (batchMode) setSelected(prev => { const s = new Set(prev); s.has(g.gid) ? s.delete(g.gid) : s.add(g.gid); return s }); else openDetail(g.gid) }}
      style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 12px', background: '#14142a', borderRadius: 8, border: `1px solid ${isSel ? '#ef4444' : '#1e1e3a'}`, cursor: 'pointer', transition: 'border-color 0.2s', opacity: dragGid === g.gid ? 0.6 : 1, position: 'relative', overflow: 'hidden' }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = '#a78bfa' }} onMouseLeave={e => { e.currentTarget.style.borderColor = isSel ? '#ef4444' : '#1e1e3a' }}>
      {/* 专辑飘带标记 */}
      {albumInfo && !batchMode && (
        <div title={albumInfo.name} style={{
          position: 'absolute', top: 2, right: -18, zIndex: 9,
          transform: 'rotate(45deg)',
          background: albumInfo.color,
          color: '#fff', fontSize: '0.55rem', fontWeight: 600,
          padding: '1px 0', width: 64, textAlign: 'center',
          lineHeight: 1.3, letterSpacing: '0.02em',
          boxShadow: '0 1px 2px rgba(0,0,0,0.3)',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          pointerEvents: 'none'
        }}>
          {ribbonText}
        </div>
      )}
      {batchMode && <div style={{ width: 20, height: 20, borderRadius: 4, background: isSel ? '#ef4444' : 'rgba(0,0,0,0.4)', border: `2px solid ${isSel ? '#ef4444' : '#555'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '0.65rem', flexShrink: 0 }}>{isSel ? '✓' : ''}</div>}
      <img src={getLocalCoverUrl(g.gid)} alt=""
        draggable={false}
        onMouseDown={!batchMode ? e => handleDragMouseDown(g.gid, e) : undefined}
        style={{ width: 60, height: 80, objectFit: 'cover', borderRadius: 4, flexShrink: 0, background: '#1a1a2e', cursor: batchMode ? 'default' : 'grab' }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {!batchMode && (
            <span onMouseDown={e => { e.stopPropagation(); handleDragMouseDown(g.gid, e) }}
              style={{ flexShrink: 0, color: '#555', cursor: 'grab', fontSize: '0.75rem', userSelect: 'none' }}
              title={isSortMode ? '拖拽到目标位置以排序' : '拖拽到专辑标签以分配'}>⋮⋮</span>
          )}
          <div onClick={e => { if (!batchMode) e.stopPropagation() }}
            title={g.title}
            style={{ fontSize: '0.85rem', color: '#ccc', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', userSelect: 'none' }}>
            {g.title}
          </div>
        </div>
        <div style={{ fontSize: '0.72rem', color: '#666', marginTop: 2 }}>{g.fileCount} 页 · {formatSize(g.totalSize)}{g.category && <span style={{ marginLeft: 8, padding: '1px 6px', borderRadius: 4, fontSize: '0.65rem', background: getCategoryColor(g.category), color: '#fff' }}>{g.category}</span>}{g.language && <span style={{ marginLeft: 6, fontSize: '0.65rem', color: '#888' }}>{g.language}</span>}</div>
      </div>
      <div style={{ fontSize: '0.68rem', color: '#555', whiteSpace: 'nowrap', textAlign: 'right' }}><div>{new Date(g.lastModified).toLocaleDateString()}</div>{g.rating > 0 && <div style={{ color: '#f59e0b' }}>★ {g.rating.toFixed(1)}</div>}</div>
    </div>
  )}

  // 自动分组标签（分组筛选）
  const renderGroupTag = (grp) => {
    const isActive = activeGroup === grp.key
    const icon = grp.type === 'artist' ? '👤' : grp.type === 'group' ? '👥' : grp.type === 'multi' ? '👥👤' : '📦'

    return (
      <span key={grp.key} style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        <button className="btn-sm" onClick={() => updateParams({ group: grp.key === 'all' ? null : grp.key, p: null })}
          style={{
            borderColor: isActive ? '#a78bfa' : '#333',
            color: isActive ? '#a78bfa' : '#888',
            background: isActive ? '#7c3aed10' : 'transparent',
            whiteSpace: 'nowrap', transition: 'all 0.2s',
            outline: 'none'
          }}>
          {icon} {grp.name} ({grp.count})
        </button>
        {!grp.editable && (
          <button className="btn-sm" onClick={() => convertGroupToAlbum(grp)} style={{ padding: '2px 5px', fontSize: '0.6rem', borderColor: '#8b5cf6', color: '#c4b5fd', background: 'transparent' }} title="转为自定义专辑">+</button>
        )}
      </span>
    )
  }

  // 将自动分组转为自定义专辑（基于 galleryMetas 全量数据）
  const convertGroupToAlbum = (grp) => {
    const albumGids = new Set(Object.values(albumConfig).flatMap(v => v.gids || []))
    const gids = galleryMetas.filter(g => {
      if (albumGids.has(g.gid)) return false
      const a = g.artists || []; const gr = g.groups || []
      if (grp.key === 'multi') return a.length + gr.length > 1
      if (grp.key === 'unknown') return a.length === 0 && gr.length === 0
      if (grp.key.startsWith('artist:')) {
        const n = grp.key.slice(7)
        if (a.length === 1 && a[0] === n && gr.length === 0) return true
        if (a.length === 1 && a[0] === n && gr.length === 1) return true
        return false
      }
      if (grp.key.startsWith('group:')) {
        const n = grp.key.slice(6)
        return gr.length === 1 && gr[0] === n && a.length === 0
      }
      return false
    }).map(g => g.gid)
    if (gids.length === 0) return
    const cfg = { ...albumConfig }
    // 使用 grp.key（含命名空间前缀，如 "artist:mankai kaika"）作为专辑 key
    // 兼容迁移：如果旧 key(grp.name) 已有数据，合并后删除旧条目
    const existingGids = [...(cfg[grp.key]?.gids || []), ...(cfg[grp.name]?.gids || [])]
    const color = cfg[grp.key]?.color || cfg[grp.name]?.color || generateAlbumColor()
    cfg[grp.key] = { name: grp.name, color, gids: [...existingGids, ...gids] }
    delete cfg[grp.name]
    saveAlbums(cfg)
    setToast(`已转换 "${grp.name}" (${gids.length} 部) 为专辑`)
    setTimeout(() => setToast(null), 1500)
  }

  // 客户端颜色生成（与后端 AlbumColorGenerator.Palette 保持一致）
  const ALBUM_PALETTE = [
    '#ef4444', '#f97316', '#f59e0b', '#eab308', '#84cc16', '#22c55e',
    '#10b981', '#14b8a6', '#06b6d4', '#0ea5e9', '#3b82f6', '#6366f1',
    '#8b5cf6', '#a855f7', '#d946ef', '#ec4899', '#f43f5e', '#fb923c',
    '#facc15', '#a3e635', '#34d399', '#2dd4bf', '#38bdf8', '#818cf8'
  ]
  const generateAlbumColor = useCallback(() => {
    const used = new Set(Object.values(albumConfig).map(v => v.color).filter(Boolean))
    for (const c of ALBUM_PALETTE) if (!used.has(c)) return c
    return '#' + Math.floor(Math.random() * 0xFFFFFF).toString(16).padStart(6, '0')
  }, [albumConfig])

  const handleCreateAlbum = (name) => {
    const cfg = { ...albumConfig }
    const color = generateAlbumColor()
    cfg[name] = { name, color, gids: cfg[name]?.gids || [] }
    saveAlbums(cfg)
    updateParams({ group: `album:${name}`, p: null, sort: 'custom' })
  }

  const handleRenameAlbum = useCallback(async (key, newName) => {
    // 乐观更新本地状态（保留兼容，专辑名称编辑已移至弹窗）
    setAlbumConfig(prev => {
      if (!prev[key]) return prev
      return { ...prev, [key]: { ...prev[key], name: newName } }
    })
    try {
      await renameAlbum(key, newName)
    } catch (e) {
      setToast('重命名失败: ' + (e.message || '未知错误'))
      setTimeout(() => setToast(null), 2000)
      const original = albumConfig[key]?.name
      if (original) {
        setAlbumConfig(prev => ({ ...prev, [key]: { ...prev[key], name: original } }))
      }
    }
  }, [albumConfig])

  // 专辑编辑弹窗保存后的回调
  const handleAlbumUpdated = useCallback((key, { name, color }) => {
    setAlbumConfig(prev => {
      if (!prev[key]) return prev
      return { ...prev, [key]: { ...prev[key], name: name ?? prev[key].name, color: color ?? prev[key].color } }
    })
    setToast('专辑已更新')
    setTimeout(() => setToast(null), 1500)
  }, [])

  const handleDeleteAlbum = (key) => {
    const cfg = { ...albumConfig }
    delete cfg[key]
    saveAlbums(cfg)
  }

  const handleSelectGroup = (key) => {
    // 合并为一次 URL 更新，避免多个 setSearchParams 互相覆盖
    const isAlbum = key.startsWith('album:')
    updateParams({
      group: key === 'all' ? null : key,
      p: null,
      sort: isAlbum ? 'custom' : null
    })
  }

  return (
    <div className="container" style={{ paddingTop: 24, display: 'flex', gap: 0 }}>
      {/* 侧边栏 */}
      <AlbumSidebar
        sidebarOpen={sidebarOpen}
        groups={groups}
        activeGroup={activeGroup}
        albumConfig={albumConfig}
        dragGid={dragGid}
        albumSearch={albumSearch}
        albumSort={albumSort}
        onSelectGroup={handleSelectGroup}
        onCreateAlbum={handleCreateAlbum}
        onEditAlbum={setEditingAlbumKey}
        onDeleteAlbum={handleDeleteAlbum}
        onConvertToAlbum={convertGroupToAlbum}
        onAlbumSearchChange={setAlbumSearch}
        onAlbumSortChange={setAlbumSort}
        onMouseEnter={sidebarEnter}
        onMouseLeave={sidebarLeave}
        onDragOver={sidebarDragOver}
        onClose={() => setSidebarOpen(false)}
      />

      {/* 主内容区 */}
      <div style={{ flex: 1, minWidth: 0, marginLeft: sidebarOpen ? 240 : 24, transition: 'margin-left 0.25s ease' }}>
        {/* 导航栏 */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 20px', marginBottom: 16, background: 'linear-gradient(135deg, #16213e, #1a1a2e)', borderRadius: 12, border: '1px solid #2a2a4a', flexWrap: 'wrap', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <Link to="/ehentai" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', borderRadius: 8, background: '#0f0f1a', border: '1px solid #2a2a4a', color: '#a78bfa', textDecoration: 'none', fontSize: '0.82rem', fontWeight: 500 }}
              onMouseEnter={e => { e.target.style.background = '#1a1a3a'; e.target.style.borderColor = '#7c3aed' }} onMouseLeave={e => { e.target.style.background = '#0f0f1a'; e.target.style.borderColor = '#2a2a4a' }}>🌐 在线</Link>
            <div style={{ width: 1, height: 20, background: '#2a2a4a' }} />
            <span style={{ fontSize: '1.1rem', fontWeight: 700, color: '#e0e0e0' }}>📁 本地画廊</span>
            <span style={{ padding: '2px 10px', borderRadius: 10, background: '#10b98120', color: '#6ee7b7', fontSize: '0.72rem', fontWeight: 600, border: '1px solid #10b98130' }}>{pageTotal} 部</span>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {batchMode ? <>
              <span style={{ fontSize: '0.8rem', color: '#fca5a5' }}>已选 {selected.size}/{pageTotal} 部</span>
              <button className="btn-sm" onClick={() => { const all = paged.map(g => g.gid); setSelected(selected.size === all.length ? new Set() : new Set(all)) }}
                style={{ borderColor: selected.size === paged.length ? '#f59e0b' : '#444', color: selected.size === paged.length ? '#fbbf24' : '#aaa' }}>{selected.size === paged.length ? '☐ 取消当前页' : '☑ 全选当前页'}</button>
              <button className="btn-sm" onClick={() => { setSelected(new Set()); setBatchMode(false) }} style={{ borderColor: '#444', color: '#888' }}>取消</button>
              {activeGroup.startsWith('album:') && (
                <button className="btn-sm" onClick={() => { if (selected.size > 0) { const albumKey = activeGroup.slice(6); const cfg = { ...albumConfig }; if (cfg[albumKey]) cfg[albumKey] = { ...cfg[albumKey], gids: cfg[albumKey].gids.filter(id => !selected.has(id)) }; saveAlbums(cfg); setSelected(new Set()); setBatchMode(false); setToast(`已从 "${getAlbumName(albumKey)}" 移除 ${selected.size} 部`); setTimeout(() => setToast(null), 1500) } }}
                  disabled={selected.size === 0} style={{ borderColor: '#8b5cf6', color: '#c4b5fd' }}>📤 移出专辑</button>
              )}
              <button className="btn-sm" onClick={() => { if (selected.size > 0) setBatchRedownloadConfirm(true) }} disabled={selected.size === 0} style={{ borderColor: '#f59e0b', color: '#fbbf24' }}>🔄 重新下载选中</button>
              <button className="btn-sm" onClick={() => { if (selected.size > 0) setBatchDeleteConfirm(true) }} disabled={selected.size === 0} style={{ borderColor: '#ef4444', color: '#fca5a5' }}>🗑 删除选中</button>
            </> : <>
              <button className="btn-sm" onClick={() => setImportModal(true)} style={{ borderColor: '#10b981', color: '#6ee7b7' }}>📥 导入</button>
              <button className="btn-sm" onClick={() => setBatchImportModal(true)} style={{ borderColor: '#f59e0b', color: '#fbbf24' }}>📦 批量导入</button>
              <button className="btn-sm" onClick={() => loadRandom(true)} style={{ borderColor: '#d946ef', color: '#e879f9' }}>🎲 随机</button>
              <button className="btn-sm" onClick={() => setBatchMode(true)} style={{ borderColor: '#ef4444', color: '#fca5a5' }}>批量删除</button>
            </>}
          </div>
        </div>

        {/* 工具栏 */}
        <div style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 200, position: 'relative' }}>
              <input ref={searchInputRef} type="text" placeholder="🔍 搜索标题、GID 或标签（如 artist:xxx）..."
                value={search} onChange={handleSearchInput} onKeyDown={handleSearchKey}
                onFocus={() => { if (search && searchSuggestions.length > 0) setShowSearchSuggestions(true) }}
                onBlur={() => setTimeout(() => setShowSearchSuggestions(false), 200)}
                style={{ width: '100%', padding: '8px 14px', borderRadius: 8, border: '1px solid #2a2a4a', background: '#1e1e36', color: '#e0e0e0', fontSize: '0.85rem', outline: 'none', boxSizing: 'border-box' }} />
              {showSearchSuggestions && searchSuggestions.length > 0 && (
                <div style={{
                  position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100,
                  background: '#1a1a2e', border: '1px solid #7c3aed40', borderRadius: '0 0 8px 8px',
                  boxShadow: '0 8px 24px rgba(0,0,0,0.5)', maxHeight: 260, overflowY: 'auto'
                }}>
                  <div style={{ padding: '6px 12px', fontSize: '0.65rem', color: '#666', borderBottom: '1px solid #2a2a4a' }}>
                    💡 点击补全标签 · 共 {searchSuggestions.length} 条
                  </div>
                  {searchSuggestions.map((t, i) => (
                    <div key={i}
                      onMouseDown={e => { e.preventDefault(); applySearchTag(t) }}
                      style={{
                        padding: '7px 14px', cursor: 'pointer', fontSize: '0.8rem',
                        color: '#ccc', display: 'flex', alignItems: 'center', gap: 8,
                        borderBottom: '1px solid #2a2a4a20'
                      }}
                      onMouseEnter={e => { e.currentTarget.style.background = '#7c3aed10' }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}>
                      <span style={{
                        padding: '1px 6px', borderRadius: 3, fontSize: '0.62rem', fontWeight: 600,
                        background: t.prefix === 'artist' ? '#7c3aed20' : t.prefix === 'group' ? '#f59e0b20' : t.prefix === 'album' ? '#10b98120' : '#2a2a4a',
                        color: t.prefix === 'artist' ? '#a78bfa' : t.prefix === 'group' ? '#fbbf24' : t.prefix === 'album' ? '#6ee7b7' : '#888',
                        flexShrink: 0
                      }}>{t.prefix}</span>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.label}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          {groups.length > 0 && (
            <div style={{ display: 'flex', gap: 4, marginBottom: 8, overflowX: 'auto', paddingBottom: 4, flexWrap: 'wrap' }}>
              <button className="btn-sm" onClick={() => updateParams({ group: null, p: null })}
                style={{ borderColor: activeGroup === 'all' ? '#a78bfa' : '#333', color: activeGroup === 'all' ? '#a78bfa' : '#888', background: activeGroup === 'all' ? '#7c3aed10' : 'transparent', whiteSpace: 'nowrap' }}>📦 全部 ({pageTotal})</button>
              {groups.filter(g => g.type !== 'album').map(grp => renderGroupTag(grp))}
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <select value={sortBy} onChange={e => updateParams({ sort: e.target.value === 'modified-desc' ? null : e.target.value, p: null })}
              style={{ padding: '5px 10px', borderRadius: 6, border: '1px solid #333', background: '#1e1e36', color: '#ccc', fontSize: '0.75rem', outline: 'none' }}>
              {activeGroup.startsWith('album:') && <option value="custom">🔢 自定义顺序</option>}
              {SORT_OPTIONS.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
            </select>
            {activeGroup.startsWith('album:') && sortBy === 'custom' && (
              <button className="btn-sm" onClick={() => {
                const albumKey = activeGroup.slice(6)
                const order = paged.map(g => g.gid)
                const cfg = { ...albumConfig }
                if (cfg[albumKey]) cfg[albumKey] = { ...cfg[albumKey], order }
                saveAlbums(cfg)
                setToast('自定义顺序已保存')
                setTimeout(() => setToast(null), 1500)
              }} style={{ borderColor: '#10b981', color: '#6ee7b7', whiteSpace: 'nowrap' }}>💾 保存顺序</button>
            )}
            <div style={{ display: 'flex', gap: 2 }}>
              <button className="btn-sm" onClick={() => setViewMode('grid')} style={{ borderColor: viewMode === 'grid' ? '#a78bfa' : '#333', color: viewMode === 'grid' ? '#a78bfa' : '#888', padding: '5px 10px' }}>▦ 网格</button>
              <button className="btn-sm" onClick={() => setViewMode('list')} style={{ borderColor: viewMode === 'list' ? '#a78bfa' : '#333', color: viewMode === 'list' ? '#a78bfa' : '#888', padding: '5px 10px' }}>☰ 列表</button>
            </div>
            <select value={pageSize} onChange={e => updateParams({ size: Number(e.target.value) === 20 ? null : Number(e.target.value), p: null })}
              style={{ padding: '5px 10px', borderRadius: 6, border: '1px solid #333', background: '#1e1e36', color: '#ccc', fontSize: '0.75rem', outline: 'none', marginLeft: 'auto' }}>
              {PAGE_OPTIONS.map(n => <option key={n} value={n}>每页 {n} 部</option>)}
            </select>
          </div>
        </div>

        {error && <div className="status-msg error" style={{ marginBottom: 12 }}>⚠ {error}</div>}
        {(metaLoading || pageLoading) && (
          <div className="grid">
            {Array.from({ length: pageSize }).map((_, i) => (
              <div key={i} className="gallery-card" style={{ background: '#1a1a2e', borderRadius: 10, overflow: 'hidden', animation: 'skeleton-pulse 1.5s infinite' }}>
                <div style={{ width: '100%', paddingBottom: '140%', background: 'linear-gradient(90deg, #1a1a2e 0%, #252545 50%, #1a1a2e 100%)', backgroundSize: '200% 100%', animation: 'skeleton-shimmer 1.5s infinite' }} />
                <div style={{ padding: '10px 12px' }}>
                  <div style={{ height: 14, borderRadius: 4, background: '#252545', width: '80%', marginBottom: 6 }} />
                  <div style={{ height: 10, borderRadius: 3, background: '#1e1e3a', width: '50%' }} />
                </div>
              </div>
            ))}
          </div>
        )}
        {!metaLoading && !pageLoading && paged.length === 0 && !error && <div className="empty"><p>暂无本地画廊</p><p style={{ fontSize: '0.8rem', color: '#666' }}>在 E-Hentai 页面下载后会自动出现在这里</p></div>}

        {viewMode === 'grid' ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
            {paged.map(g => <GalleryCard key={g.gid} g={g} isSel={selected.has(g.gid)} />)}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {paged.map(g => <GalleryRow key={g.gid} g={g} isSel={selected.has(g.gid)} />)}
          </div>
        )}
        {!pageLoading && paged.length === 0 && pageTotal > 0 && <div className="empty" style={{ padding: 30 }}><p>没有匹配的画廊</p></div>}
        {renderPagination()}

        {/* 详情弹窗 */}
        {detailLoading && <div className="modal-overlay"><div className="modal"><div className="loading">加载详情...</div></div></div>}
        {detail && !detailLoading && (
          <GalleryDetail
            detail={detail}
            tagTranslations={tagTranslations}
            nsTranslations={nsTranslations}
            filtered={paged}
            albumConfig={albumConfig}
            galleries={galleryMetas}
            onOpenReader={handleOpenReader}
            onClose={() => setDetail(null)}
            onEditTags={async (gid) => {
              const tags = await fetchGalleryMetaTags(gid)
              setEditTagsForm({ title: detail.title, category: detail.category || 'other', language: detail.language || '', tags: tags || {} })
              setEditTagsModal({ gid, title: detail.title })
            }}
            onAddToAlbum={(info) => setAlbumModal(info)}
          />
        )}

        {/* 删除确认 */}
        {deleteConfirm && <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setDeleteConfirm(null) }}><div className="modal" style={{ maxWidth: 400 }}><h3 style={{ color: '#f87171', marginBottom: 12 }}>确认删除</h3><p style={{ fontSize: '0.9rem', color: '#ccc', marginBottom: 8, wordBreak: 'break-all' }}>{deleteConfirm.title}</p><p style={{ fontSize: '0.78rem', color: '#888', marginBottom: 16 }}>此操作不可撤销。</p><div className="modal-actions" style={{ justifyContent: 'flex-end' }}><button className="btn-sm" onClick={() => setDeleteConfirm(null)} style={{ borderColor: '#444', color: '#888' }}>取消</button><button className="btn-sm" onClick={() => handleDelete(deleteConfirm.gid)} disabled={deleting} style={{ borderColor: '#ef4444', color: '#fca5a5', background: '#7f1d1d20' }}>{deleting ? '删除中...' : '确认删除'}</button></div></div></div>}

        {/* 批量删除 */}
        {batchDeleteConfirm && <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setBatchDeleteConfirm(false) }}><div className="modal" style={{ maxWidth: 400 }}><h3 style={{ color: '#f87171', marginBottom: 12 }}>批量删除确认</h3><p style={{ fontSize: '0.9rem', color: '#ccc', marginBottom: 8 }}>将永久删除选中的 <strong style={{ color: '#fca5a5' }}>{selected.size}</strong> 部画廊。</p><p style={{ fontSize: '0.78rem', color: '#888', marginBottom: 16 }}>此操作不可撤销。</p><div className="modal-actions" style={{ justifyContent: 'flex-end' }}><button className="btn-sm" onClick={() => setBatchDeleteConfirm(false)} style={{ borderColor: '#444', color: '#888' }}>取消</button><button className="btn-sm" onClick={handleBatchDelete} disabled={deleting} style={{ borderColor: '#ef4444', color: '#fca5a5', background: '#7f1d1d20' }}>{deleting ? '删除中...' : `确认删除 ${selected.size} 部`}</button></div></div></div>}

        {/* 批量重新下载 */}
        {batchRedownloadConfirm && <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setBatchRedownloadConfirm(false) }}><div className="modal" style={{ maxWidth: 400 }}><h3 style={{ color: '#fbbf24', marginBottom: 12 }}>批量重新下载确认</h3><p style={{ fontSize: '0.9rem', color: '#ccc', marginBottom: 8 }}>将重新下载选中的 <strong style={{ color: '#fbbf24' }}>{selected.size}</strong> 部画廊。</p><p style={{ fontSize: '0.78rem', color: '#888', marginBottom: 16 }}>需要有效的 .eh 元文件（含 token）。</p><div className="modal-actions" style={{ justifyContent: 'flex-end' }}><button className="btn-sm" onClick={() => setBatchRedownloadConfirm(false)} style={{ borderColor: '#444', color: '#888' }}>取消</button><button className="btn-sm" onClick={handleBatchRedownload} disabled={deleting} style={{ borderColor: '#f59e0b', color: '#fbbf24', background: '#78350f20' }}>{deleting ? '处理中...' : `确认重新下载 ${selected.size} 部`}</button></div></div></div>}

        {/* 添加到专辑 */}
        {albumModal && (() => {
          const matchedAlbums = albumModal.matchedAlbums || []
          // 获取当前作品的标签，用于新建专辑时选择关键标签
          const gTags = albumModal.tags || []
          // 只取 artist 和 group 标签作为可选关键标签
          const keyTagOptions = gTags.filter(t => t.ns === 'artist' || t.ns === 'group')
          return (
          <div className="modal-overlay" onClick={() => setAlbumModal(null)}>
            <div className="modal" style={{ maxWidth: 480 }} onClick={e => e.stopPropagation()}>
              <h3 style={{ marginBottom: 4 }}>📁 添加到专辑</h3>
              <p style={{ fontSize: '0.8rem', color: '#888', marginBottom: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{albumModal.title}</p>

              {/* 匹配的专辑（标签属性匹配） */}
              {matchedAlbums.length > 0 && (
                <div style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: '0.75rem', color: '#fbbf24', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
                    🔗 匹配的专辑（标签属性一致）
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {matchedAlbums.map(({ key, name, count }) => (
                      <button key={key} className="btn-sm" onClick={() => {
                        const cfg = { ...albumConfig }
                        if (!cfg[key]) cfg[key] = { name: key, gids: [], order: [] }
                        const gids = cfg[key].gids || []
                        cfg[key] = { ...cfg[key], gids: [...gids.filter(id => id !== albumModal.gid), albumModal.gid] }
                        if (cfg[key].order) cfg[key].order = [...cfg[key].order.filter(id => id !== albumModal.gid), albumModal.gid]
                        saveAlbums(cfg)
                        setAlbumModal(null)
                        setToast(`已添加到 "${name}"`)
                        setTimeout(() => setToast(null), 1500)
                      }} style={{ borderColor: '#f59e0b', color: '#fbbf24', fontSize: '0.72rem' }}>
                        📁 {name} ({count})
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* 其他已有专辑 */}
              {Object.keys(albumConfig).length > 0 && (
                <div style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: '0.75rem', color: '#666', marginBottom: 6 }}>选择已有专辑：</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {Object.entries(albumConfig).map(([key, val]) => {
                      const gids = val.gids || []
                      const displayName = val.name || key
                      // 跳过已匹配的专辑（已在上方显示）
                      const isMatched = matchedAlbums.some(m => m.key === key)
                      const btnStyle = isMatched
                        ? { borderColor: '#f59e0b30', color: '#fbbf2450', fontSize: '0.72rem', opacity: 0.5 }
                        : { borderColor: '#8b5cf6', color: '#c4b5fd', fontSize: '0.72rem' }
                      return (
                        <button key={key} className="btn-sm" onClick={() => {
                          const cfg = { ...albumConfig }
                          cfg[key] = { ...cfg[key], gids: [...gids.filter(id => id !== albumModal.gid), albumModal.gid] }
                          saveAlbums(cfg)
                          setAlbumModal(null)
                          setToast(`已添加到 "${displayName}"`)
                          setTimeout(() => setToast(null), 1500)
                        }} style={btnStyle}>
                          📁 {displayName} ({gids.length})
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* 用标签创建新专辑（必须选择一个关键标签属性） */}
              {keyTagOptions.length > 0 && (
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: '0.75rem', color: '#aaa', marginBottom: 6 }}>
                    🏷 选择关键标签创建新专辑：
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 10 }}>
                    {keyTagOptions.map((t, i) => (
                      <button key={i} className="btn-sm" onClick={() => {
                        const key = t.tag
                        const cfg = { ...albumConfig }
                        cfg[key] = { name: key, gids: [...(cfg[key]?.gids || []), albumModal.gid], order: [...(cfg[key]?.order || []), albumModal.gid] }
                        saveAlbums(cfg)
                        setAlbumModal(null)
                        setToast(`已创建专辑 "${key}"`)
                        setTimeout(() => setToast(null), 1500)
                      }} style={{ borderColor: '#10b981', color: '#6ee7b7', fontSize: '0.72rem' }}>
                        {t.ns === 'artist' ? '👤' : '👥'} {t.tag}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* 自定义关键标签名称（选择一个标签作为Key，可自定义显示名称） */}
              {keyTagOptions.length > 0 && (
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: '0.75rem', color: '#aaa', marginBottom: 6 }}>✏️ 选择关键标签并自定义专辑名称：</div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <select id="new-album-key-tag" style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #2a2a4a', background: '#0f0f1a', color: '#e0e0e0', fontSize: '0.8rem', outline: 'none', maxWidth: 200 }}>
                      {keyTagOptions.map((t, i) => (
                        <option key={i} value={t.tag}>{t.ns === 'artist' ? '👤' : '👥'} {t.tag}</option>
                      ))}
                    </select>
                    <input id="new-album-display-name" type="text" placeholder="显示名称（可选）..."
                      style={{ flex: 1, padding: '6px 10px', borderRadius: 6, border: '1px solid #2a2a4a', background: '#0f0f1a', color: '#e0e0e0', fontSize: '0.8rem', outline: 'none' }}
                      onKeyDown={e => {
                        if (e.key === 'Enter') {
                          const selectEl = document.getElementById('new-album-key-tag')
                          const key = selectEl?.value?.trim()
                          const displayName = document.getElementById('new-album-display-name')?.value?.trim()
                          if (key) {
                            const cfg = { ...albumConfig }
                            cfg[key] = { name: displayName || key, gids: [...(cfg[key]?.gids || []), albumModal.gid], order: [...(cfg[key]?.order || []), albumModal.gid] }
                            saveAlbums(cfg)
                            setAlbumModal(null)
                            setToast(`已创建专辑 "${displayName || key}"`)
                            setTimeout(() => setToast(null), 1500)
                          }
                        }
                      }} />
                    <button className="btn-sm" onClick={() => {
                      const selectEl = document.getElementById('new-album-key-tag')
                      const key = selectEl?.value?.trim()
                      const displayName = document.getElementById('new-album-display-name')?.value?.trim()
                      if (key) {
                        const cfg = { ...albumConfig }
                        cfg[key] = { name: displayName || key, gids: [...(cfg[key]?.gids || []), albumModal.gid], order: [...(cfg[key]?.order || []), albumModal.gid] }
                        saveAlbums(cfg)
                        setAlbumModal(null)
                        setToast(`已创建专辑 "${displayName || key}"`)
                        setTimeout(() => setToast(null), 1500)
                      }
                    }} style={{ borderColor: '#10b981', color: '#6ee7b7' }}>
                      创建
                    </button>
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
                <button className="btn-sm" onClick={() => setAlbumModal(null)} style={{ borderColor: '#444', color: '#888' }}>取消</button>
              </div>
            </div>
          </div>
          )
        })()}
      </div>

      {/* 导入外部作品对话框 */}
      {importModal && (
        <div className="modal-overlay" onClick={() => setImportModal(false)}>
          <div className="modal" style={{ maxWidth: 520 }} onClick={e => e.stopPropagation()}>
            <h3 style={{ marginBottom: 4 }}>📥 导入外部作品</h3>
            <p style={{ fontSize: '0.78rem', color: '#888', marginBottom: 14 }}>选择包含图片的文件夹，填写元数据后导入到本地画廊</p>

            <div style={{ marginBottom: 10 }}>
              <label style={{ fontSize: '0.75rem', color: '#aaa', display: 'block', marginBottom: 4 }}>源文件夹</label>
              <div style={{ display: 'flex', gap: 6 }}>
                <input type="text" value={importForm.sourceDir} onChange={e => setImportForm(f => ({ ...f, sourceDir: e.target.value }))}
                  style={{ flex: 1, padding: '6px 10px', borderRadius: 6, border: '1px solid #2a2a4a', background: '#0f0f1a', color: '#e0e0e0', fontSize: '0.8rem', outline: 'none' }}
                  placeholder="输入路径或点击浏览选择..." />
                <button className="btn-sm" onClick={async () => {
                  try {
                    const data = await browseDirectory(importForm.sourceDir || '')
                    setImportDirBrowser({ show: true, path: importForm.sourceDir || '', items: data, stack: [importForm.sourceDir || ''] })
                  } catch (e) { setToast('无法浏览目录: ' + e.message); setTimeout(() => setToast(null), 2000) }
                }} style={{ borderColor: '#7c3aed', color: '#a78bfa', whiteSpace: 'nowrap' }}>📁 浏览</button>
              </div>
            </div>

            {/* 目录浏览器 */}
            {importDirBrowser.show && (
              <div style={{ marginBottom: 10, maxHeight: 200, overflowY: 'auto', background: '#0d0d1a', borderRadius: 6, border: '1px solid #2a2a4a', padding: 6 }}>
                <div style={{ display: 'flex', gap: 4, marginBottom: 6, flexWrap: 'wrap' }}>
                  <button className="btn-sm" onClick={async () => {
                    const parent = importDirBrowser.path.split('\\').slice(0, -1).join('\\') || importDirBrowser.path.split('/').slice(0, -1).join('/')
                    const data = await browseDirectory(parent)
                    setImportDirBrowser(p => ({ ...p, path: parent, items: data, stack: [...p.stack, parent] }))
                  }} style={{ borderColor: '#555', color: '#aaa', fontSize: '0.65rem' }}>⬆ 上级</button>
                  <span style={{ fontSize: '0.65rem', color: '#666', padding: '3px 6px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{importDirBrowser.path || '根目录'}</span>
                </div>
                {importDirBrowser.items.map((d, i) => (
                  <div key={i} style={{ padding: '4px 8px', cursor: d.isDir ? 'pointer' : 'default', fontSize: '0.75rem', color: d.isDir ? '#a78bfa' : '#888', borderRadius: 4, display: 'flex', alignItems: 'center', gap: 6 }}
                    onMouseEnter={e => { e.currentTarget.style.background = '#7c3aed10' }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
                    onClick={async () => {
                      if (d.isDir) {
                        const data = await browseDirectory(d.path)
                        setImportDirBrowser(p => ({ ...p, path: d.path, items: data, stack: [...p.stack, d.path] }))
                      }
                    }}>
                    {d.isDir ? '📁' : '📄'} {d.name}
                    <button className="btn-sm" onClick={() => {
                      const dir = d.isDir ? d.path : importDirBrowser.path
                      const dirName = d.isDir ? d.name : (importDirBrowser.path.split(/[\\/]/).filter(Boolean).pop() || '')
                      setImportForm(f => ({ ...f, sourceDir: dir, title: f.title || dirName }))
                      setImportDirBrowser({ show: false, path: '', items: [], stack: [] })
                    }} style={{ marginLeft: 'auto', padding: '1px 6px', fontSize: '0.6rem', borderColor: '#10b981', color: '#6ee7b7' }}>选此目录</button>
                  </div>
                ))}
              </div>
            )}

            <div style={{ marginBottom: 10 }}>
              <label style={{ fontSize: '0.75rem', color: '#aaa', display: 'block', marginBottom: 4 }}>标题 *</label>
              <input type="text" value={importForm.title} onChange={e => setImportForm(f => ({ ...f, title: e.target.value }))}
                style={{ width: '100%', padding: '6px 10px', borderRadius: 6, border: '1px solid #2a2a4a', background: '#0f0f1a', color: '#e0e0e0', fontSize: '0.8rem', outline: 'none', boxSizing: 'border-box' }} />
            </div>

            <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: '0.75rem', color: '#aaa', display: 'block', marginBottom: 4 }}>分类</label>
                <select value={importForm.category} onChange={e => setImportForm(f => ({ ...f, category: e.target.value }))}
                  style={{ width: '100%', padding: '6px 10px', borderRadius: 6, border: '1px solid #2a2a4a', background: '#0f0f1a', color: '#e0e0e0', fontSize: '0.8rem', outline: 'none' }}>
                  {Object.keys(CATEGORY_COLORS).map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: '0.75rem', color: '#aaa', display: 'block', marginBottom: 4 }}>语言</label>
                <input type="text" value={importForm.language} onChange={e => setImportForm(f => ({ ...f, language: e.target.value }))}
                  style={{ width: '100%', padding: '6px 10px', borderRadius: 6, border: '1px solid #2a2a4a', background: '#0f0f1a', color: '#e0e0e0', fontSize: '0.8rem', outline: 'none', boxSizing: 'border-box' }} placeholder="如 Chinese" />
              </div>
            </div>

            <div style={{ marginBottom: 10 }}>
              <label style={{ fontSize: '0.75rem', color: '#aaa', display: 'block', marginBottom: 4 }}>作者/画师（逗号分隔）</label>
              <input type="text" value={importForm.artists} onChange={e => setImportForm(f => ({ ...f, artists: e.target.value }))}
                style={{ width: '100%', padding: '6px 10px', borderRadius: 6, border: '1px solid #2a2a4a', background: '#0f0f1a', color: '#e0e0e0', fontSize: '0.8rem', outline: 'none', boxSizing: 'border-box' }} placeholder="artist1, artist2" />
            </div>
            <div style={{ marginBottom: 10 }}>
              <label style={{ fontSize: '0.75rem', color: '#aaa', display: 'block', marginBottom: 4 }}>社团/组（逗号分隔）</label>
              <input type="text" value={importForm.groups} onChange={e => setImportForm(f => ({ ...f, groups: e.target.value }))}
                style={{ width: '100%', padding: '6px 10px', borderRadius: 6, border: '1px solid #2a2a4a', background: '#0f0f1a', color: '#e0e0e0', fontSize: '0.8rem', outline: 'none', boxSizing: 'border-box' }} placeholder="group1, group2" />
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: '0.75rem', color: '#aaa', display: 'block', marginBottom: 4 }}>其他标签（逗号分隔，将存入 other namespace）</label>
              <input type="text" value={importForm.otherTags} onChange={e => setImportForm(f => ({ ...f, otherTags: e.target.value }))}
                style={{ width: '100%', padding: '6px 10px', borderRadius: 6, border: '1px solid #2a2a4a', background: '#0f0f1a', color: '#e0e0e0', fontSize: '0.8rem', outline: 'none', boxSizing: 'border-box' }} placeholder="tag1, tag2" />
            </div>

            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.75rem', color: '#aaa', marginBottom: 14, cursor: 'pointer' }}>
              <input type="checkbox" checked={importForm.copyFiles} onChange={e => setImportForm(f => ({ ...f, copyFiles: e.target.checked }))} />
              复制文件到画廊目录（取消则创建符号链接）
            </label>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button className="btn-sm" onClick={() => setImportModal(false)} style={{ borderColor: '#444', color: '#888' }}>取消</button>
              <button className="btn-sm" onClick={async () => {
                if (!importForm.sourceDir || !importForm.title.trim()) {
                  setToast('请填写源文件夹和标题'); setTimeout(() => setToast(null), 1500); return
                }
                setImporting(true)
                try {
                  await importLocalGallery({
                    sourceDir: importForm.sourceDir,
                    title: importForm.title.trim(),
                    category: importForm.category,
                    language: importForm.language || null,
                    artists: importForm.artists ? importForm.artists.split(',').map(s => s.trim()).filter(Boolean) : null,
                    groups: importForm.groups ? importForm.groups.split(',').map(s => s.trim()).filter(Boolean) : null,
                    otherTags: importForm.otherTags ? importForm.otherTags.split(',').map(s => s.trim()).filter(Boolean) : null,
                    copyFiles: importForm.copyFiles
                  })
                  setImportModal(false)
                  setImportForm({ sourceDir: '', title: '', category: 'doujinshi', language: '', artists: '', groups: '', otherTags: '', copyFiles: true })
                  loadMetas(); loadPaged()
                  setToast('导入成功')
                } catch (e) { setToast('导入失败: ' + e.message) }
                setImporting(false)
                setTimeout(() => setToast(null), 2000)
              }} disabled={importing} style={{ borderColor: '#10b981', color: '#6ee7b7' }}>{importing ? '导入中...' : '导入'}</button>
            </div>
          </div>
        </div>
      )}

      {/* 批量导入对话框 */}
      {batchImportModal && (
        <div className="modal-overlay" onClick={() => setBatchImportModal(false)}>
          <div className="modal" style={{ maxWidth: 520 }} onClick={e => e.stopPropagation()}>
            <h3 style={{ marginBottom: 4 }}>📦 批量导入</h3>
            <p style={{ fontSize: '0.78rem', color: '#888', marginBottom: 14 }}>选择一个父目录，其下每个包含图片的子文件夹将作为一个作品导入（文件夹名=标题）</p>

            <div style={{ marginBottom: 10 }}>
              <label style={{ fontSize: '0.75rem', color: '#aaa', display: 'block', marginBottom: 4 }}>父目录</label>
              <div style={{ display: 'flex', gap: 6 }}>
                <input type="text" value={batchImportForm.parentDir} onChange={e => setBatchImportForm(f => ({ ...f, parentDir: e.target.value }))}
                  style={{ flex: 1, padding: '6px 10px', borderRadius: 6, border: '1px solid #2a2a4a', background: '#0f0f1a', color: '#e0e0e0', fontSize: '0.8rem', outline: 'none' }}
                  placeholder="输入父目录路径或点击浏览..." />
                <button className="btn-sm" onClick={async () => {
                  try {
                    const data = await browseDirectory(batchImportForm.parentDir || '')
                    setImportDirBrowser({ show: true, path: batchImportForm.parentDir || '', items: data, stack: [batchImportForm.parentDir || ''] })
                  } catch (e) { setToast('无法浏览: ' + e.message); setTimeout(() => setToast(null), 2000) }
                }} style={{ borderColor: '#7c3aed', color: '#a78bfa', whiteSpace: 'nowrap' }}>📁 浏览</button>
              </div>
            </div>

            {importDirBrowser.show && (
              <div style={{ marginBottom: 10, maxHeight: 200, overflowY: 'auto', background: '#0d0d1a', borderRadius: 6, border: '1px solid #2a2a4a', padding: 6 }}>
                <div style={{ display: 'flex', gap: 4, marginBottom: 6, flexWrap: 'wrap' }}>
                  <button className="btn-sm" onClick={async () => {
                    const parts = importDirBrowser.path.split(/[\\/]/).filter(Boolean)
                    const parent = parts.length > 0 ? parts.slice(0, -1).join('\\') + '\\' : ''
                    const data = await browseDirectory(parent)
                    setImportDirBrowser(p => ({ ...p, path: parent, items: data, stack: [...p.stack, parent] }))
                  }} style={{ borderColor: '#555', color: '#aaa', fontSize: '0.65rem' }}>⬆ 上级</button>
                  <span style={{ fontSize: '0.65rem', color: '#666', padding: '3px 6px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{importDirBrowser.path || '根目录'}</span>
                </div>
                {importDirBrowser.items.map((d, i) => (
                  <div key={i} style={{ padding: '4px 8px', cursor: d.isDir ? 'pointer' : 'default', fontSize: '0.75rem', color: d.isDir ? '#a78bfa' : '#888', borderRadius: 4, display: 'flex', alignItems: 'center', gap: 6 }}
                    onMouseEnter={e => { e.currentTarget.style.background = '#7c3aed10' }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
                    onClick={async () => {
                      if (d.isDir) {
                        const data = await browseDirectory(d.path)
                        setImportDirBrowser(p => ({ ...p, path: d.path, items: data, stack: [...p.stack, d.path] }))
                      }
                    }}>
                    {d.isDir ? '📁' : '📄'} {d.name}
                    {d.isDir && (
                      <button className="btn-sm" onClick={() => {
                        setBatchImportForm(f => ({ ...f, parentDir: d.path }))
                        setImportDirBrowser({ show: false, path: '', items: [], stack: [] })
                      }} style={{ marginLeft: 'auto', padding: '1px 6px', fontSize: '0.6rem', borderColor: '#f59e0b', color: '#fbbf24' }}>选此目录</button>
                    )}
                  </div>
                ))}
              </div>
            )}

            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.75rem', color: '#aaa', marginBottom: 14, cursor: 'pointer' }}>
              <input type="checkbox" checked={batchImportForm.copyFiles} onChange={e => setBatchImportForm(f => ({ ...f, copyFiles: e.target.checked }))} />
              复制文件到画廊目录
            </label>

            {batchImportResult && (
              <div style={{ marginBottom: 12, maxHeight: 200, overflowY: 'auto', background: '#0d0d1a', borderRadius: 6, border: '1px solid #2a2a4a', padding: 8, fontSize: '0.75rem' }}>
                <div style={{ color: '#6ee7b7', marginBottom: 6 }}>✅ 成功 {batchImportResult.success} / ❌ 失败 {batchImportResult.failed}</div>
                {batchImportResult.results.map((r, i) => (
                  <div key={i} style={{ color: r.success ? '#6ee7b7' : '#f87171', padding: '2px 0' }}>
                    {r.success ? `✅ ${r.title} (${r.fileCount} 页)` : `❌ ${r.folder}: ${r.error}`}
                  </div>
                ))}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button className="btn-sm" onClick={() => { setBatchImportModal(false); setBatchImportResult(null); setImportDirBrowser({ show: false, path: '', items: [], stack: [] }) }} style={{ borderColor: '#444', color: '#888' }}>关闭</button>
              <button className="btn-sm" onClick={async () => {
                if (!batchImportForm.parentDir.trim()) {
                  setToast('请选择父目录'); setTimeout(() => setToast(null), 1500); return
                }
                setBatchImporting(true); setBatchImportResult(null)
                try {
                  const result = await batchImportGalleries(batchImportForm.parentDir.trim(), batchImportForm.copyFiles)
                  setBatchImportResult(result)
                  loadMetas(); loadPaged()
                } catch (e) { setToast('批量导入失败: ' + e.message); setTimeout(() => setToast(null), 2000) }
                setBatchImporting(false)
              }} disabled={batchImporting} style={{ borderColor: '#f59e0b', color: '#fbbf24' }}>{batchImporting ? '导入中...' : '🚀 开始批量导入'}</button>
            </div>
          </div>
        </div>
      )}

      {/* 专辑编辑弹窗 */}
      {editingAlbumKey && (
        <AlbumEditModal
          albumKey={editingAlbumKey}
          albumConfig={albumConfig}
          onClose={() => setEditingAlbumKey(null)}
          onUpdated={handleAlbumUpdated}
        />
      )}

      {/* 编辑标签对话框 */}
      {editTagsModal && (
        <div className="modal-overlay" onClick={() => setEditTagsModal(null)}>
          <div className="modal" style={{ maxWidth: 520 }} onClick={e => e.stopPropagation()}>
            <h3 style={{ marginBottom: 4 }}>🏷 编辑标签</h3>
            <p style={{ fontSize: '0.78rem', color: '#888', marginBottom: 14 }}>GID: {editTagsModal.gid} — {editTagsModal.title}</p>

            <div style={{ marginBottom: 10 }}>
              <label style={{ fontSize: '0.75rem', color: '#aaa', display: 'block', marginBottom: 4 }}>标题</label>
              <input type="text" value={editTagsForm.title} onChange={e => setEditTagsForm(f => ({ ...f, title: e.target.value }))}
                style={{ width: '100%', padding: '6px 10px', borderRadius: 6, border: '1px solid #2a2a4a', background: '#0f0f1a', color: '#e0e0e0', fontSize: '0.8rem', outline: 'none', boxSizing: 'border-box' }} />
            </div>

            <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: '0.75rem', color: '#aaa', display: 'block', marginBottom: 4 }}>分类</label>
                <select value={editTagsForm.category} onChange={e => setEditTagsForm(f => ({ ...f, category: e.target.value }))}
                  style={{ width: '100%', padding: '6px 10px', borderRadius: 6, border: '1px solid #2a2a4a', background: '#0f0f1a', color: '#e0e0e0', fontSize: '0.8rem', outline: 'none' }}>
                  {Object.keys(CATEGORY_COLORS).map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: '0.75rem', color: '#aaa', display: 'block', marginBottom: 4 }}>语言</label>
                <input type="text" value={editTagsForm.language} onChange={e => setEditTagsForm(f => ({ ...f, language: e.target.value }))}
                  style={{ width: '100%', padding: '6px 10px', borderRadius: 6, border: '1px solid #2a2a4a', background: '#0f0f1a', color: '#e0e0e0', fontSize: '0.8rem', outline: 'none', boxSizing: 'border-box' }} />
              </div>
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: '0.75rem', color: '#aaa', display: 'block', marginBottom: 6 }}>标签（按 namespace 分组）</label>
              {['artist', 'group', 'language', 'parody', 'female', 'male', 'other'].map(ns => {
                const vals = editTagsForm.tags[ns] || []
                return (
                  <div key={ns} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                    <span style={{ width: 70, fontSize: '0.7rem', color: '#a78bfa', flexShrink: 0, textAlign: 'right' }}>{ns}</span>
                    <input type="text"
                      value={vals.join(', ')}
                      onChange={e => {
                        const newVals = e.target.value.split(',').map(s => s.trim()).filter(Boolean)
                        setEditTagsForm(f => ({
                          ...f, tags: { ...f.tags, [ns]: newVals.length > 0 ? newVals : undefined }
                        }))
                      }}
                      style={{ flex: 1, padding: '4px 8px', borderRadius: 4, border: '1px solid #2a2a4a', background: '#0f0f1a', color: '#e0e0e0', fontSize: '0.75rem', outline: 'none' }}
                      placeholder="逗号分隔" />
                  </div>
                )
              })}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button className="btn-sm" onClick={() => setEditTagsModal(null)} style={{ borderColor: '#444', color: '#888' }}>取消</button>
              <button className="btn-sm" onClick={async () => {
                setEditTagsSaving(true)
                try {
                  // 清理空 namespace
                  const cleanedTags = {}
                  Object.entries(editTagsForm.tags).forEach(([k, v]) => {
                    if (v && v.length > 0) cleanedTags[k] = v
                  })
                  await updateGalleryMetaTags(editTagsModal.gid, {
                    tags: cleanedTags,
                    title: editTagsForm.title,
                    category: editTagsForm.category,
                    language: editTagsForm.language || null
                  })
                  setEditTagsModal(null)
                  loadMetas(); loadPaged()
                  setToast('标签已更新')
                } catch (e) { setToast('更新失败: ' + e.message) }
                setEditTagsSaving(false)
                setTimeout(() => setToast(null), 2000)
              }} disabled={editTagsSaving} style={{ borderColor: '#f59e0b', color: '#fbbf24' }}>{editTagsSaving ? '保存中...' : '💾 保存'}</button>
            </div>
          </div>
        </div>
      )}

      {toasts.length > 0 && (
        <div style={{ position: 'fixed', top: 20, left: '50%', transform: 'translateX(-50%)', zIndex: 300, display: 'flex', flexDirection: 'column', gap: 6, pointerEvents: 'none' }}>
          {toasts.map((t, i) => (
            <div key={t.key} style={{
              padding: '10px 24px', borderRadius: 10, background: 'rgba(0,0,0,0.85)',
              color: '#fbbf24', fontSize: '0.9rem', fontWeight: 600,
              boxShadow: '0 4px 16px rgba(0,0,0,0.4)', opacity: 1 - i * 0.25,
              transform: `translateY(${i * 4}px)`
            }}>{t.msg}</div>
          ))}
        </div>
      )}
    </div>
  )
}
