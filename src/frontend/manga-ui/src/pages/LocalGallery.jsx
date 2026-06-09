import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { Link } from 'react-router-dom'
import { fetchLocalGalleries, fetchLocalGalleryDetail, getLocalCoverUrl, deleteLocalGallery, translateEHTags, redownloadLocalGallery, batchRedownloadLocalGalleries, API_BASE, fetchAlbumConfig, saveAlbumConfig, importLocalGallery, batchImportGalleries, fetchGalleryMetaTags, updateGalleryMetaTags, browseDirectory } from '../api'

const CATEGORY_COLORS = {
  doujinshi: '#F44336', manga: '#FF9800', 'artist cg': '#FBC02D',
  'game cg': '#4CAF50', western: '#8BC34A', 'non-h': '#2196F3',
  imageset: '#9C27B0', cosplay: '#E91E63', 'asian porn': '#795548',
  misc: '#607D8B', private: '#607D8B', other: '#607D8B'
}
const getCategoryColor = (cat) => CATEGORY_COLORS[(cat || '').toLowerCase()] || '#607D8B'
const formatSize = (b) => b > 1e9 ? (b / 1e9).toFixed(1) + ' GB' : b > 1e6 ? (b / 1e6).toFixed(0) + ' MB' : b + ' B'
const PAGE_OPTIONS = [30, 60, 120]
const SORT_OPTIONS = [
  { key: 'modified-desc', label: '最近修改' }, { key: 'modified-asc', label: '最早修改' },
  { key: 'title-asc', label: '标题 A-Z' }, { key: 'title-desc', label: '标题 Z-A' },
  { key: 'pages-desc', label: '页数最多' }, { key: 'pages-asc', label: '页数最少' },
  { key: 'size-desc', label: '大小最大' }, { key: 'size-asc', label: '大小最小' },
]

export default function LocalGallery() {
  const [galleries, setGalleries] = useState([])
  const [loading, setLoading] = useState(true)
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
const [toasts, setToasts] = useState([])
const toastIdRef = useRef(0)
const setToast = (msg, duration = 2000) => {
  if (!msg) return // 兼容 setToast(null) 清空
  const id = ++toastIdRef.current
  setToasts(prev => [...prev.slice(-2), { id, msg, key: id }])
  setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), duration)
}

  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState('modified-desc')
  const [pageSize, setPageSize] = useState(30)
  const [page, setPage] = useState(1)
  const [viewMode, setViewMode] = useState('grid')
  const [activeGroup, setActiveGroup] = useState('all')

  // 搜索自动补全
  const [searchSuggestions, setSearchSuggestions] = useState([])
  const [showSearchSuggestions, setShowSearchSuggestions] = useState(false)
  const [cursorPos, setCursorPos] = useState(0)
  const searchInputRef = useRef(null)
  const suggestTimerRef = useRef(null)

  const [repairing, setRepairing] = useState(false)
  const [repairProgress, setRepairProgress] = useState(null)

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
    setAlbumConfig(cfg)
    try {
      await saveAlbumConfig(cfg)
    } catch (e) {
      setToast('保存专辑失败: ' + e.message)
      setTimeout(() => setToast(null), 3000)
      return
    }
    try { localStorage.setItem('local-albums', JSON.stringify(cfg)) } catch { }
  }, [])

  // 辅助函数
  const getAlbumGids = (key) => albumConfig[key]?.gids || []
  const getAlbumName = (key) => albumConfig[key]?.name || key
  const getAllAlbumGids = useCallback(() => {
    const all = new Set()
    Object.values(albumConfig).forEach(v => v.gids?.forEach(id => all.add(id)))
    return all
  }, [albumConfig])

  // 侧边栏
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [albumModal, setAlbumModal] = useState(null)
  const dragGidRef = useRef(null)
  const [dragGid, setDragGid] = useState(null)
  const dragCloneRef = useRef(null)  // 拖拽时显示的克隆卡片

  // 点击触发的 hover 层
  const [hoveredGid, setHoveredGid] = useState(null)

  // 鼠标位置跟踪（侧边栏自动展开）
  const sidebarTimeoutRef = useRef(null)
  const sidebarZoneRef = useRef(null)

  useEffect(() => { loadGalleries() }, [])

  const loadGalleries = async () => {
    setLoading(true)
    try { setGalleries(await fetchLocalGalleries()) } catch (e) { setError(e.message) }
    setLoading(false)
  }

  // 辅助：从画廊数据提取可匹配的标签
  const getGalleryTags = useCallback((g) => {
    const artists = g.artists || []
    const groups = g.groups || []
    return { artists, groups, all: [...artists, ...groups] }
  }, [])

  // 当 albumConfig 和 galleries 都加载完成后，自动将未分类作品匹配到自定义专辑
  useEffect(() => {
    if (!albumsLoaded || galleries.length === 0) return
    if (Object.keys(albumConfig).length === 0) return

    const albumGids = new Set(Object.values(albumConfig).flatMap(v => v.gids || []))
    let changed = false
    const cfg = { ...albumConfig }

    galleries.forEach(g => {
      if (albumGids.has(g.gid)) return // 已在某个专辑中
      const tags = [...(g.artists || []), ...(g.groups || [])]
      for (const tag of tags) {
        if (cfg[tag]) {
          const gids = cfg[tag].gids || []
          if (!gids.includes(g.gid)) {
            cfg[tag] = { ...cfg[tag], gids: [...gids, g.gid] }
            // 同步更新 order（如果存在）
            if (cfg[tag].order) {
              cfg[tag].order = [...cfg[tag].order, g.gid]
            }
            changed = true
            break // 匹配到第一个就停
          }
        }
      }
    })

    if (changed) {
      saveAlbums(cfg)
      console.log('[auto-match] 已将新作品自动匹配到专辑')
    }
  }, [galleries, albumConfig, albumsLoaded])

  // 下载后自动匹配专辑（外部通过 window 事件触发）
  // 收到事件后重新加载画廊列表，然后自动匹配 effect 会处理
  useEffect(() => {
    const handler = () => {
      // 重新加载画廊列表以获取新下载的作品
      loadGalleries()
    }
    window.addEventListener('local-gallery-auto-match', handler)
    return () => window.removeEventListener('local-gallery-auto-match', handler)
  }, [])

  // 计算分组（自动分组 + 自定义专辑）
  const groups = useMemo(() => {
    const map = new Map()
    // 自定义专辑（包括空专辑也要显示，方便用户管理）
    Object.entries(albumConfig).forEach(([key, val]) => {
      const gids = val.gids || []
      map.set(`album:${key}`, { type: 'album', key: `album:${key}`, name: val.name || key, count: gids.length, editable: true, createdAt: val.createdAt || val.updatedAt, updatedAt: val.updatedAt })
    })
    // 未匹配到专辑的自动分组
    const albumGids = new Set(Object.values(albumConfig).flatMap(v => v.gids || []))
    galleries.forEach(g => {
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
      } else if (artists.length + grps.length > 1) {
        if (!map.has('multi')) map.set('multi', { type: 'multi', name: '多作者', count: 0 })
        map.get('multi').count++
      } else {
        if (!map.has('unknown')) map.set('unknown', { type: 'unknown', name: '未分类', count: 0 })
        map.get('unknown').count++
      }
    })
    // 专辑按创建时间排序（稳定），自动分组仍按 count 排序
    return Array.from(map.entries())
      .sort((a, b) => {
        if (a[1].type === 'album' && b[1].type === 'album') {
          const ta = a[1].createdAt || a[1].updatedAt || ''
          const tb = b[1].createdAt || b[1].updatedAt || ''
          return ta.localeCompare(tb)
        }
        return b[1].count - a[1].count
      })
      .map(([key, val]) => ({ key, ...val }))
  }, [galleries, albumConfig])

  // 搜索自动补全的标签池（从所有画廊提取 + 专辑名）
  const searchTagPool = useMemo(() => {
    const pool = []
    const seen = new Set()
    const add = (prefix, label) => {
      const key = `${prefix}:${label}`
      if (!seen.has(key)) { seen.add(key); pool.push({ key, label, prefix, syntax: `${prefix}:${label}` }) }
    }
    galleries.forEach(g => {
      (g.artists || []).forEach(t => add('artist', t))
      ;(g.groups || []).forEach(t => add('group', t))
      if (g.category) add('category', g.category)
      if (g.language) add('language', g.language)
      if (g.parody) add('parody', g.parody)
    })
    // 添加专辑名
    Object.entries(albumConfig).forEach(([, val]) => {
      const name = val.name || ''
      if (name && !seen.has(name)) { seen.add(name); pool.push({ key: name, label: name, prefix: 'album', syntax: name }) }
    })
    return pool.sort((a, b) => a.label.localeCompare(b.label))
  }, [galleries, albumConfig])

  // 搜索输入处理（含自动补全）
  const handleSearchInput = (e) => {
    const val = e.target.value
    setSearch(val)
    const pos = e.target.selectionStart || 0
    setCursorPos(pos)

    // 获取光标前的当前词（最后一个空格之后的内容）
    const lastSpace = val.lastIndexOf(' ', pos - 1)
    const currentWord = val.substring(lastSpace + 1, pos).trim().toLowerCase()

    if (suggestTimerRef.current) clearTimeout(suggestTimerRef.current)
    if (currentWord.length >= 1) {
      suggestTimerRef.current = setTimeout(() => {
        const filtered = searchTagPool
          .filter(t => t.label.toLowerCase().includes(currentWord))
          .slice(0, 8)
        setSearchSuggestions(filtered)
        setShowSearchSuggestions(filtered.length > 0)
      }, 150)
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
    setSearch(newVal)
    setShowSearchSuggestions(false)
    setPage(1)
    searchInputRef.current?.focus()
  }

  const handleSearchKey = (e) => {
    if (e.key === 'Escape') setShowSearchSuggestions(false)
  }

  // 筛选 + 排序
  const filtered = useMemo(() => {
    let list = galleries
    if (activeGroup !== 'all') {
      if (activeGroup === 'multi') {
        const ag = getAllAlbumGids()
        list = list.filter(g => !ag.has(g.gid) && (g.artists || []).length + (g.groups || []).length > 1)
      } else if (activeGroup === 'unknown') {
        const ag = getAllAlbumGids()
        list = list.filter(g => !ag.has(g.gid) && (g.artists || []).length === 0 && (g.groups || []).length === 0)
      } else if (activeGroup.startsWith('artist:')) {
        const name = activeGroup.slice(7)
        list = list.filter(g => (g.artists || []).length === 1 && g.artists[0] === name && (g.groups || []).length === 0)
      } else if (activeGroup.startsWith('group:')) {
        const name = activeGroup.slice(6)
        list = list.filter(g => (g.groups || []).length === 1 && g.groups[0] === name && (g.artists || []).length === 0)
      } else if (activeGroup.startsWith('album:')) {
        const albumKey = activeGroup.slice(6)
        const albumGids = albumConfig[albumKey]?.gids || []
        list = list.filter(g => albumGids.includes(g.gid))
      }
    }
    if (search.trim()) {
      // 解析搜索词：支持空格分隔的多个词，支持 tag:value 语法
      const terms = search.trim().split(/\s+/).filter(Boolean)
      list = list.filter(g => {
        return terms.every(term => {
          const lower = term.toLowerCase()
          // 标签语法：prefix:value
          const colonIdx = term.indexOf(':')
          if (colonIdx > 0) {
            const prefix = term.substring(0, colonIdx).toLowerCase()
            const value = term.substring(colonIdx + 1).toLowerCase()
            if (prefix === 'artist') return (g.artists || []).some(a => a.toLowerCase().includes(value))
            if (prefix === 'group') return (g.groups || []).some(gr => gr.toLowerCase().includes(value))
            if (prefix === 'category') return (g.category || '').toLowerCase().includes(value)
            if (prefix === 'language') return (g.language || '').toLowerCase().includes(value)
          }
          // 普通搜索：匹配标题、GID、artists、groups
          return g.title.toLowerCase().includes(lower)
            || String(g.gid).includes(lower)
            || (g.artists || []).some(a => a.toLowerCase().includes(lower))
            || (g.groups || []).some(gr => gr.toLowerCase().includes(lower))
        })
      })
    }
    // 专辑模式下优先用自定义排序
    if (activeGroup.startsWith('album:')) {
      const albumKey = activeGroup.slice(6)
      const order = albumConfig[albumKey]?.order
      if (order && order.length > 0) {
        const orderMap = new Map(order.map((id, i) => [id, i]))
        list = [...list].sort((a, b) => (orderMap.get(a.gid) ?? 9999) - (orderMap.get(b.gid) ?? 9999))
        return list
      }
    }
    const [field, dir] = sortBy.split('-')
    list = [...list].sort((a, b) => {
      let cmp = 0
      if (field === 'modified') cmp = new Date(a.lastModified) - new Date(b.lastModified)
      else if (field === 'title') cmp = a.title.localeCompare(b.title)
      else if (field === 'pages') cmp = a.fileCount - b.fileCount
      else if (field === 'size') cmp = a.totalSize - b.totalSize
      return dir === 'desc' ? -cmp : cmp
    })
    return list
  }, [galleries, activeGroup, search, sortBy, albumConfig])

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const safePage = Math.min(page, totalPages)
  const paged = filtered.slice((safePage - 1) * pageSize, safePage * pageSize)

  const handleDelete = async (gid) => { setDeleting(true); try { await deleteLocalGallery(gid); setGalleries(p => p.filter(g => g.gid !== gid)); setDeleteConfirm(null); setDetail(null) } catch (e) { setError(e.message) } setDeleting(false) }
  const handleBatchDelete = async () => { setDeleting(true); try { for (const gid of selected) await deleteLocalGallery(gid); setGalleries(p => p.filter(g => !selected.has(g.gid))); setSelected(new Set()); setBatchMode(false); setBatchDeleteConfirm(false) } catch (e) { setError(e.message) } setDeleting(false) }
  const handleRedownload = async (gid, title, token) => { try { await redownloadLocalGallery(gid, title, token); setToast('重新下载任务已启动'); setTimeout(() => setToast(null), 1500); setDetail(null) } catch (e) { setToast('重新下载失败: ' + e.message); setTimeout(() => setToast(null), 1500) } }
  const handleBatchRedownload = async () => { setDeleting(true); try { const r = await batchRedownloadLocalGalleries(Array.from(selected)); setBatchRedownloadConfirm(false); setSelected(new Set()); setBatchMode(false); setToast(r ? `批量重新下载: ${r.success} 成功${r.skipped > 0 ? `, ${r.skipped} 跳过` : ''}${r.failed > 0 ? `, ${r.failed} 失败` : ''}` : '批量重新下载任务已启动'); setTimeout(() => setToast(null), 2000) } catch (e) { setToast('批量重新下载失败: ' + e.message); setTimeout(() => setToast(null), 1500) } setDeleting(false) }

  const handleRepairMetadata = async () => {
    setRepairing(true); setRepairProgress({ repaired: 0, failed: 0, total: 0, title: '' })
    try {
      const resp = await fetch(`${API_BASE}/api/local/repair-metadata`, { method: 'POST' })
      const reader = resp.body.getReader(); const decoder = new TextDecoder(); let buffer = ''
      while (true) { const { done, value } = await reader.read(); if (done) break; buffer += decoder.decode(value, { stream: true }); const lines = buffer.split('\n'); buffer = lines.pop() || ''; for (const line of lines) { if (line.startsWith('data: ')) { try { const d = JSON.parse(line.slice(6)); if (d.type === 'start') setRepairProgress({ repaired: 0, failed: 0, total: d.total, title: '准备中...' }); else if (d.type === 'progress') setRepairProgress({ repaired: d.repaired, failed: d.failed, total: d.total, title: d.title }); else if (d.type === 'done') { setRepairProgress({ repaired: d.repaired, failed: d.failed, total: d.total, title: '完成' }); await loadGalleries(); setTimeout(() => setRepairProgress(null), 3000) } } catch { } } } }
    } catch (e) { setToast('补全元数据失败: ' + e.message); setTimeout(() => setToast(null), 2000) }
    setRepairing(false)
  }

  const openDetail = async (gid) => {
    setDetailLoading(true)
    try { const d = await fetchLocalGalleryDetail(gid); setDetail(d); if (d?.tagGroups?.length) { const allTags = []; d.tagGroups.forEach(g => { allTags.push(`n:${g.namespace}`); g.tags.forEach(t => allTags.push(`${g.namespace}:${t}`)) }); translateEHTags(allTags).then(r => { const tMap = {}, nsMap = {}; (r.data || []).forEach(item => { if (item.key?.startsWith('n:')) nsMap[item.key.substring(2)] = item.cn; else if (item.cn) tMap[item.key] = item.cn }); setTagTranslations(tMap); setNsTranslations(nsMap) }).catch(() => {}) } } catch (e) { setError(e.message) }
    setDetailLoading(false)
  }

  // 自定义拖拽（mousedown/mousemove/mouseup，绕过浏览器原生 drag 的首次点击问题）
  const dragMoveRef = useRef(null) // 存储当前 onMove 函数引用，用于 cleanup
  const dragUpRef = useRef(null)   // 存储当前 onUp 函数引用

  // 用 ref 存储最新的 doSortDrop / doAlbumDrop，避免闭包过期问题
  const doAlbumDropRef = useRef(null)
  const doSortDropRef = useRef(null)

  // 判断当前是否在专辑自定义排序模式
  const isAlbumSortMode = activeGroup.startsWith('album:') && sortBy === 'custom'

  const handleDragMouseDown = useCallback((gid, e) => {
    if (batchMode) return
    const card = e.currentTarget.closest('[style*="border-radius"]')
    if (!card) return
    e.preventDefault()
    e.stopPropagation()

    const startX = e.clientX
    const startY = e.clientY
    const startTime = Date.now()

    dragGidRef.current = gid
    setDragGid(gid)
    const isSortMode = activeGroup.startsWith('album:') && sortBy === 'custom'
    setToast(isSortMode ? '拖拽到目标位置以排序' : '拖拽到专辑标签上以分配')

    // 创建拖拽克隆卡片
    const clone = card.cloneNode(true)
    clone.style.position = 'fixed'
    clone.style.zIndex = '9999'
    clone.style.pointerEvents = 'none'
    clone.style.opacity = '0.85'
    clone.style.width = card.offsetWidth + 'px'
    clone.style.transform = 'rotate(2deg) scale(0.95)'
    clone.style.boxShadow = '0 8px 32px rgba(0,0,0,0.6)'
    clone.style.left = (e.clientX - card.offsetWidth / 2) + 'px'
    clone.style.top = (e.clientY - 100) + 'px'
    document.body.appendChild(clone)
    dragCloneRef.current = clone

    // 高亮当前悬停的 drop zone / 排序位置
    let currentHoverZone = null
    let currentSortTarget = null
    const highlightZone = (zoneEl) => {
      if (currentHoverZone && currentHoverZone !== zoneEl) {
        currentHoverZone.style.background = ''
        currentHoverZone.style.borderColor = ''
        currentHoverZone.style.outline = ''
      }
      if (zoneEl && zoneEl !== currentHoverZone) {
        zoneEl.style.background = '#f59e0b15'
        zoneEl.style.borderColor = '#f59e0b'
        zoneEl.style.outline = '2px solid #f59e0b'
        zoneEl.style.outlineOffset = '1px'
      }
      currentHoverZone = zoneEl
    }
    const highlightSortTarget = (sortEl) => {
      if (currentSortTarget && currentSortTarget !== sortEl) {
        currentSortTarget.style.outline = ''
        currentSortTarget.style.outlineOffset = ''
        currentSortTarget.style.borderLeft = ''
      }
      if (sortEl && sortEl !== currentSortTarget) {
        sortEl.style.outline = '2px solid #10b981'
        sortEl.style.outlineOffset = '1px'
        sortEl.style.borderLeft = '4px solid #10b981'
      }
      currentSortTarget = sortEl
    }

    const onMove = (me) => {
      if (clone) {
        clone.style.left = (me.clientX - card.offsetWidth / 2) + 'px'
        clone.style.top = (me.clientY - 100) + 'px'
      }
      // 临时隐藏克隆卡片，避免遮挡 elementFromPoint
      if (clone) clone.style.display = 'none'
      const el = document.elementFromPoint(me.clientX, me.clientY)
      if (clone) clone.style.display = ''

      if (el) {
        // 优先检测专辑 drop zone
        const zoneBtn = el.closest('[data-drop-zone]')
        if (zoneBtn) {
          highlightZone(zoneBtn)
          highlightSortTarget(null)
        } else if (isSortMode) {
          highlightZone(null)
          // 检测排序位置（其他 gallery card）
          const sortCard = el.closest('[data-sort-gid]')
          if (sortCard && sortCard.getAttribute('data-sort-gid') !== String(gid)) {
            highlightSortTarget(sortCard)
          } else {
            highlightSortTarget(null)
          }
        } else {
          highlightZone(null)
          highlightSortTarget(null)
        }
      } else {
        highlightZone(null)
        highlightSortTarget(null)
      }
    }

    const onUp = (me) => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      highlightZone(null)
      highlightSortTarget(null)
      if (clone) { clone.remove(); dragCloneRef.current = null }
      dragMoveRef.current = null
      dragUpRef.current = null

      const droppedGid = dragGidRef.current
      dragGidRef.current = null
      setDragGid(null)

      if (droppedGid == null) return

      // 检测是否为短点击（移动 < 5px 且 < 200ms）→ 视为普通点击
      const dx = me.clientX - startX, dy = me.clientY - startY
      const dt = Date.now() - startTime
      if (Math.abs(dx) < 5 && Math.abs(dy) < 5 && dt < 200) {
        setToast(null)
        // 模拟卡片点击行为：切换 hoveredGid（显示 overlay 详情/阅读按钮）
        setHoveredGid(prev => prev === droppedGid ? null : droppedGid)
        return
      }

      // 检测 mouseup 时的目标（克隆卡片已移除，无需隐藏）
      const el = document.elementFromPoint(me.clientX, me.clientY)
      if (el) {
        // 优先：检测是否在专辑 drop zone 上
        const zoneBtn = el.closest('[data-drop-zone]')
        if (zoneBtn) {
          const albumKey = zoneBtn.getAttribute('data-drop-zone')
          if (albumKey) {
            doAlbumDropRef.current?.(droppedGid, albumKey)
            return
          }
        }
        // 排序模式：检测是否在另一个卡片上
        if (isSortMode) {
          const sortCard = el.closest('[data-sort-gid]')
          if (sortCard) {
            const targetGid = parseInt(sortCard.getAttribute('data-sort-gid'))
            if (targetGid && targetGid !== droppedGid) {
              doSortDropRef.current?.(droppedGid, targetGid)
              return
            }
          }
        }
      }

      // 没有命中任何目标
      setToast('已取消拖拽')
      setTimeout(() => setToast(null), 1000)
    }

    dragMoveRef.current = onMove
    dragUpRef.current = onUp
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }, [batchMode, activeGroup, sortBy])

  // 专辑 drop 逻辑
  const doAlbumDrop = useCallback((gid, albumKey) => {
    const cfg = { ...albumConfig }
    // 先从所有专辑中移除
    Object.keys(cfg).forEach(k => { if (cfg[k]) cfg[k] = { ...cfg[k], gids: cfg[k].gids.filter(id => id !== gid) } })
    // 加入目标专辑（追加到末尾）
    if (!cfg[albumKey]) cfg[albumKey] = { name: albumKey, gids: [], order: [] }
    const existing = cfg[albumKey].gids.filter(id => id !== gid)
    cfg[albumKey] = { ...cfg[albumKey], gids: [...existing, gid] }
    // 同时更新 order（如果存在）
    if (cfg[albumKey].order) {
      cfg[albumKey].order = [...cfg[albumKey].order.filter(id => id !== gid), gid]
    }
    saveAlbums(cfg)
    setToast(`已移动到 "${cfg[albumKey]?.name || albumKey}"`)
    setTimeout(() => setToast(null), 1500)
  }, [albumConfig, saveAlbums])
  doAlbumDropRef.current = doAlbumDrop

  // 专辑内排序拖拽：将 gid 插入到 targetGid 之前
  const doSortDrop = useCallback((gid, targetGid) => {
    const albumKey = activeGroup.slice(6) // 去掉 "album:" 前缀
    const cfg = { ...albumConfig }
    const album = cfg[albumKey]
    if (!album) return

    // 获取当前显示列表（已按 order 或默认排序）
    const currentOrder = album.order && album.order.length > 0
      ? album.order
      : album.gids

    // 移除拖拽的 gid
    const filtered = currentOrder.filter(id => id !== gid)
    // 找到 targetGid 的位置，将 gid 插入到它前面
    const targetIdx = filtered.indexOf(targetGid)
    if (targetIdx === -1) {
      // target 不在列表中，追加到末尾
      filtered.push(gid)
    } else {
      filtered.splice(targetIdx, 0, gid)
    }

    cfg[albumKey] = { ...album, order: filtered }
    saveAlbums(cfg)
    setToast('排序已更新')
    setTimeout(() => setToast(null), 1500)
  }, [activeGroup, albumConfig, saveAlbums])
  doSortDropRef.current = doSortDrop

  // 将自动分组转为自定义专辑
  const convertGroupToAlbum = (grp) => {
    const gids = filtered.filter(g => {
      const a = g.artists || []; const gr = g.groups || []
      if (grp.key === 'multi') return a.length + gr.length > 1
      if (grp.key === 'unknown') return a.length === 0 && gr.length === 0
      if (grp.key.startsWith('artist:')) { const n = grp.key.slice(7); return a.length === 1 && a[0] === n && gr.length === 0 }
      if (grp.key.startsWith('group:')) { const n = grp.key.slice(6); return gr.length === 1 && gr[0] === n && a.length === 0 }
      return false
    }).map(g => g.gid)
    if (gids.length === 0) return
    const cfg = { ...albumConfig }
    cfg[grp.name] = { name: grp.name, gids: [...(cfg[grp.name]?.gids || []), ...gids] }
    saveAlbums(cfg)
    setToast(`已转换 "${grp.name}" (${gids.length} 部) 为专辑`)
    setTimeout(() => setToast(null), 1500)
  }

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
    return (
    <div className="gallery-card"
      data-sort-gid={isSortMode ? g.gid : undefined}
      onClick={() => {
        if (batchMode) setSelected(prev => { const s = new Set(prev); s.has(g.gid) ? s.delete(g.gid) : s.add(g.gid); return s })
        else setHoveredGid(prev => prev === g.gid ? null : g.gid)
      }}
      style={{ background: '#14142a', borderRadius: 10, overflow: 'hidden', cursor: 'pointer', border: `2px solid ${isSel ? '#ef4444' : showOverlay ? '#a78bfa' : '#2a2a4a'}`, transition: 'border-color 0.2s, transform 0.2s', position: 'relative', opacity: dragGid === g.gid ? 0.6 : 1, transform: showOverlay ? 'translateY(-2px)' : 'none' }}>
      {batchMode && <div style={{ position: 'absolute', top: 8, right: 8, zIndex: 10, width: 22, height: 22, borderRadius: 4, background: isSel ? '#ef4444' : 'rgba(0,0,0,0.6)', border: `2px solid ${isSel ? '#ef4444' : '#666'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '0.7rem', fontWeight: 700 }}>{isSel ? '✓' : ''}</div>}
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
            <Link to={`/reader-local/${g.gid}`} onClick={e => { e.stopPropagation(); try { sessionStorage.setItem('reader-local-list', JSON.stringify(filtered.map(g => g.gid))) } catch { } }}
              style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(16,185,129,0.3)', cursor: 'pointer', textDecoration: 'none' }}>
              <span style={{ color: '#fff', fontSize: '0.85rem', fontWeight: 700, background: 'rgba(0,0,0,0.55)', padding: '4px 14px', borderRadius: 6 }}>📖 阅读</span>
            </Link>
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
    return (
    <div
      data-sort-gid={isSortMode ? g.gid : undefined}
      onClick={() => { if (batchMode) setSelected(prev => { const s = new Set(prev); s.has(g.gid) ? s.delete(g.gid) : s.add(g.gid); return s }); else openDetail(g.gid) }}
      style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 12px', background: '#14142a', borderRadius: 8, border: `1px solid ${isSel ? '#ef4444' : '#1e1e3a'}`, cursor: 'pointer', transition: 'border-color 0.2s', opacity: dragGid === g.gid ? 0.6 : 1 }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = '#a78bfa' }} onMouseLeave={e => { e.currentTarget.style.borderColor = isSel ? '#ef4444' : '#1e1e3a' }}>
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
        <button className="btn-sm" onClick={() => { setActiveGroup(grp.key); setPage(1) }}
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

  // 侧边栏内容
  const sidebarContent = (
    <div style={{ padding: '12px 0', height: '100%', overflowY: 'auto' }}>
      <div style={{ padding: '0 14px 10px', fontSize: '0.8rem', fontWeight: 600, color: '#a78bfa', borderBottom: '1px solid #1e1e3a', marginBottom: 8 }}>
        📁 专辑
        <button className="btn-sm" onClick={() => {
          const n = prompt('新建专辑名称（将用于自动匹配下载的漫画）:')
          if (n && n.trim()) { const cfg = { ...albumConfig }; cfg[n.trim()] = { name: n.trim(), gids: cfg[n.trim()]?.gids || [] }; saveAlbums(cfg); setActiveGroup(`album:${n.trim()}`); setPage(1) }
        }} style={{ float: 'right', padding: '2px 8px', fontSize: '0.65rem', borderColor: '#10b981', color: '#6ee7b7', background: 'transparent' }}>+ 新建</button>
      </div>
      {groups.filter(g => g.type === 'album').length === 0 && (
        <div style={{ padding: '8px 14px', fontSize: '0.7rem', color: '#555' }}>暂无专辑，可在详情中创建或转换自动分组</div>
      )}
      {groups.filter(g => g.type === 'album').map(grp => {
        const isActive = activeGroup === grp.key
        const isDropTarget = dragGid != null
        const realKey = grp.key.slice(6) // 去掉 "album:" 前缀
        return (
          <div key={grp.key} style={{ padding: '0 8px' }} className="album-sidebar-row">
            <div onClick={() => { setActiveGroup(grp.key); setPage(1); setSortBy('custom') }}
              data-drop-zone={realKey}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '8px 10px', borderRadius: 6, cursor: 'pointer',
                background: isActive ? '#7c3aed15' : 'transparent',
                border: `1px solid ${isActive ? '#7c3aed40' : isDropTarget ? '#f59e0b40' : 'transparent'}`,
                transition: 'all 0.15s', marginBottom: 2, outline: 'none'
              }}>
              <span style={{ fontSize: '0.78rem', color: isActive ? '#a78bfa' : '#ccc', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>📁 {grp.name}</span>
              <span style={{ fontSize: '0.65rem', color: '#666', marginLeft: 6 }}>{grp.count}</span>
              <span className="album-actions" style={{ display: 'flex', gap: 2, marginLeft: 4, alignItems: 'center' }}>
                <button className="btn-sm" onClick={e => { e.stopPropagation(); const n = prompt('修改显示名称:', grp.name); if (n && n.trim() && n.trim() !== grp.name) { const cfg = { ...albumConfig }; if (cfg[realKey]) cfg[realKey] = { ...cfg[realKey], name: n.trim() }; saveAlbums(cfg) } }} style={{ padding: '2px 4px', fontSize: '0.65rem', borderColor: 'transparent', color: '#888', background: 'transparent', cursor: 'pointer' }} title="修改显示名称">✎</button>
                <button className="btn-sm" onClick={e => { e.stopPropagation(); if (confirm(`删除专辑 "${grp.name}"？画廊将回到自动分组。`)) { const cfg = { ...albumConfig }; delete cfg[realKey]; saveAlbums(cfg) } }} style={{ padding: '2px 4px', fontSize: '0.65rem', borderColor: 'transparent', color: '#fca5a5', background: 'transparent', cursor: 'pointer' }} title="删除">✕</button>
              </span>
            </div>
          </div>
        )
      })}
      <div style={{ padding: '0 14px 10px', marginTop: 12, fontSize: '0.75rem', fontWeight: 600, color: '#888', borderBottom: '1px solid #1e1e3a', marginBottom: 4 }}>自动分组</div>
      {groups.filter(g => g.type !== 'album').map(grp => (
        <div key={grp.key} style={{ padding: '0 14px' }}>
          <div onClick={() => { setActiveGroup(grp.key); setPage(1) }}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 6px', borderRadius: 4, cursor: 'pointer', background: activeGroup === grp.key ? '#7c3aed10' : 'transparent', marginBottom: 1 }}>
            <span style={{ fontSize: '0.75rem', color: activeGroup === grp.key ? '#a78bfa' : '#888', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
              {grp.type === 'artist' ? '👤' : grp.type === 'group' ? '👥' : grp.type === 'multi' ? '👥👤' : '📦'} {grp.name}
            </span>
            <span style={{ fontSize: '0.65rem', color: '#555', marginLeft: 6 }}>{grp.count}</span>
            <button className="btn-sm" onClick={e => { e.stopPropagation(); convertGroupToAlbum(grp) }} style={{ padding: '1px 5px', fontSize: '0.55rem', borderColor: '#8b5cf6', color: '#c4b5fd', background: 'transparent', marginLeft: 4 }} title="转为专辑">+</button>
          </div>
        </div>
      ))}
    </div>
  )

  return (
    <div className="container" style={{ paddingTop: 24, display: 'flex', gap: 0 }}>
      {/* 侧边栏 */}
      <div style={{ position: 'relative', flexShrink: 0 }}>
        {/* 悬停触发区 */}
        <div ref={sidebarZoneRef}
          onMouseEnter={sidebarEnter} onMouseLeave={sidebarLeave}
          onDragOver={sidebarDragOver}
          style={{ position: 'fixed', top: 0, left: 0, width: sidebarOpen ? 240 : 16, height: '100vh', zIndex: 50, transition: 'width 0.25s ease' }}>
          <div style={{
            position: 'absolute', top: 0, left: 0, width: 240, height: '100%',
            background: '#0d0d1a', borderRight: '1px solid #1e1e3a',
            transform: sidebarOpen ? 'translateX(0)' : 'translateX(-224px)',
            transition: 'transform 0.25s ease',
            boxShadow: sidebarOpen ? '4px 0 20px rgba(0,0,0,0.5)' : 'none'
          }}>
            <div style={{ padding: '8px 14px', fontSize: '0.75rem', color: '#555', borderBottom: '1px solid #1e1e3a', display: 'flex', justifyContent: 'space-between' }}>
              <span>📚 画廊管理</span>
              <button className="btn-sm" onClick={() => setSidebarOpen(false)} style={{ padding: '1px 6px', fontSize: '0.6rem', borderColor: '#444', color: '#888' }}>收起</button>
            </div>
            {sidebarContent}
          </div>
          {/* 标签触发器 */}
          {!sidebarOpen && (
            <div style={{ position: 'absolute', left: 0, top: '50%', transform: 'translateY(-50%)', writingMode: 'vertical-rl', background: '#1a1a3a', color: '#666', padding: '8px 4px', borderRadius: '0 6px 6px 0', fontSize: '0.65rem', cursor: 'pointer', letterSpacing: 2, border: '1px solid #2a2a4a', borderLeft: 'none' }}>
              📁 专辑
            </div>
          )}
        </div>
      </div>

      {/* 主内容区 */}
      <div style={{ flex: 1, minWidth: 0, marginLeft: sidebarOpen ? 240 : 24, transition: 'margin-left 0.25s ease' }}>
        {/* 导航栏 */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 20px', marginBottom: 16, background: 'linear-gradient(135deg, #16213e, #1a1a2e)', borderRadius: 12, border: '1px solid #2a2a4a', flexWrap: 'wrap', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <Link to="/ehentai" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', borderRadius: 8, background: '#0f0f1a', border: '1px solid #2a2a4a', color: '#a78bfa', textDecoration: 'none', fontSize: '0.82rem', fontWeight: 500 }}
              onMouseEnter={e => { e.target.style.background = '#1a1a3a'; e.target.style.borderColor = '#7c3aed' }} onMouseLeave={e => { e.target.style.background = '#0f0f1a'; e.target.style.borderColor = '#2a2a4a' }}>🌐 在线</Link>
            <div style={{ width: 1, height: 20, background: '#2a2a4a' }} />
            <span style={{ fontSize: '1.1rem', fontWeight: 700, color: '#e0e0e0' }}>📁 本地画廊</span>
            <span style={{ padding: '2px 10px', borderRadius: 10, background: '#10b98120', color: '#6ee7b7', fontSize: '0.72rem', fontWeight: 600, border: '1px solid #10b98130' }}>{galleries.length} 部</span>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {batchMode ? <>
              <span style={{ fontSize: '0.8rem', color: '#fca5a5' }}>已选 {selected.size}/{galleries.length} 部</span>
              <button className="btn-sm" onClick={() => { const all = galleries.map(g => g.gid); setSelected(selected.size === all.length ? new Set() : new Set(all)) }}
                style={{ borderColor: selected.size === galleries.length ? '#f59e0b' : '#444', color: selected.size === galleries.length ? '#fbbf24' : '#aaa' }}>{selected.size === galleries.length ? '☐ 取消全选' : '☑ 全选'}</button>
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
            <button className="btn-sm" onClick={handleRepairMetadata} disabled={repairing} style={{ borderColor: '#a78bfa', color: '#a78bfa', whiteSpace: 'nowrap' }}>{repairing ? '⏳ 补全中...' : '🔧 补全元数据'}</button>
          </div>
          {repairProgress && <div style={{ fontSize: '0.75rem', color: '#a78bfa', marginBottom: 8 }}>{repairProgress.total > 0 ? `进度: ${repairProgress.repaired}/${repairProgress.total} 完成${repairProgress.failed > 0 ? `, ${repairProgress.failed} 失败` : ''} — ${repairProgress.title}` : '准备中...'}</div>}
          {groups.length > 0 && (
            <div style={{ display: 'flex', gap: 4, marginBottom: 8, overflowX: 'auto', paddingBottom: 4, flexWrap: 'wrap' }}>
              <button className="btn-sm" onClick={() => { setActiveGroup('all'); setPage(1) }}
                style={{ borderColor: activeGroup === 'all' ? '#a78bfa' : '#333', color: activeGroup === 'all' ? '#a78bfa' : '#888', background: activeGroup === 'all' ? '#7c3aed10' : 'transparent', whiteSpace: 'nowrap' }}>📦 全部 ({galleries.length})</button>
              {groups.filter(g => g.type !== 'album').map(grp => renderGroupTag(grp))}
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <select value={sortBy} onChange={e => { setSortBy(e.target.value); setPage(1) }}
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
            <select value={pageSize} onChange={e => { setPageSize(Number(e.target.value)); setPage(1) }}
              style={{ padding: '5px 10px', borderRadius: 6, border: '1px solid #333', background: '#1e1e36', color: '#ccc', fontSize: '0.75rem', outline: 'none', marginLeft: 'auto' }}>
              {PAGE_OPTIONS.map(n => <option key={n} value={n}>每页 {n} 部</option>)}
            </select>
          </div>
        </div>

        {error && <div className="status-msg error" style={{ marginBottom: 12 }}>⚠ {error}</div>}
        {loading && (
          <div className="grid">
            {Array.from({ length: 8 }).map((_, i) => (
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
        {!loading && galleries.length === 0 && !error && <div className="empty"><p>暂无本地画廊</p><p style={{ fontSize: '0.8rem', color: '#666' }}>在 E-Hentai 页面下载后会自动出现在这里</p></div>}

        {viewMode === 'grid' ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
            {paged.map(g => <GalleryCard key={g.gid} g={g} isSel={selected.has(g.gid)} />)}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {paged.map(g => <GalleryRow key={g.gid} g={g} isSel={selected.has(g.gid)} />)}
          </div>
        )}
        {!loading && filtered.length === 0 && galleries.length > 0 && <div className="empty" style={{ padding: 30 }}><p>没有匹配的画廊</p></div>}
        {renderPagination()}

        {/* 详情弹窗 */}
        {detailLoading && <div className="modal-overlay"><div className="modal"><div className="loading">加载详情...</div></div></div>}
        {detail && !detailLoading && (
          <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setDetail(null) }}>
            <div className="modal" style={{ maxWidth: 'min(900px, 90vw)', maxHeight: '85vh', overflowY: 'auto', padding: 0 }}>
              <div style={{ position: 'relative', background: 'linear-gradient(180deg, #1a1a3a 0%, #0f0f1a 100%)', padding: '20px 24px 16px', borderBottom: '1px solid #2a2a4a' }}>
                <button className="btn-sm" onClick={() => setDetail(null)} style={{ position: 'absolute', top: 10, right: 10, border: 'none', color: '#888', fontSize: '1.1rem' }}>✕</button>
                <div style={{ display: 'flex', gap: 16 }}>
                  <div style={{ flexShrink: 0, width: 140, borderRadius: 8, overflow: 'hidden', border: '1px solid #2a2a4a', background: '#1a1a2e' }}><img src={getLocalCoverUrl(detail.gid)} alt="" style={{ width: '100%', display: 'block' }} /></div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <h3 style={{ margin: '0 0 4px', fontSize: '1rem', lineHeight: 1.4, color: '#e0e0e0', fontWeight: 600 }}>{detail.title}</h3>
                    {detail.titleJpn && <div style={{ fontSize: '0.8rem', color: '#888', marginBottom: 8 }}>{detail.titleJpn}</div>}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                      <span style={{ padding: '2px 10px', borderRadius: 10, fontSize: '0.72rem', fontWeight: 600, background: getCategoryColor(detail.category), color: '#fff' }}>{detail.category}</span>
                      {detail.language && <span style={{ padding: '2px 10px', borderRadius: 10, fontSize: '0.72rem', background: '#2a2a4a', color: '#aaa' }}>{detail.language}</span>}
                      {detail.favoriteCount > 0 && <span style={{ padding: '2px 10px', borderRadius: 10, fontSize: '0.72rem', background: '#f59e0b20', color: '#fbbf24', border: '1px solid #f59e0b40' }}>♥ {detail.favoriteCount}</span>}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#888', lineHeight: 1.6 }}>
                      {detail.uploader && <div>上传者: <span style={{ color: '#a78bfa' }}>{detail.uploader}</span></div>}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>GID: {detail.gid} · {detail.fileCount} 页 · {formatSize(detail.totalSize)}<Link to={`/ehentai?open=${detail.gid}${detail.token ? '_' + detail.token : ''}`} onClick={() => setDetail(null)} style={{ fontSize: '0.68rem', color: '#a78bfa', textDecoration: 'none', padding: '1px 8px', borderRadius: 8, border: '1px solid #7c3aed40', background: '#7c3aed10' }} title="在线详情">🔗 在线详情</Link></div>
                    </div>
                  </div>
                </div>
              </div>
              <div style={{ padding: '12px 24px', borderBottom: '1px solid #1a1a3a', display: 'flex', gap: 24, flexWrap: 'wrap' }}>
                {[{ label: '页数', value: detail.fileCount }, { label: '大小', value: formatSize(detail.totalSize) }, { label: '评分', value: detail.rating !== '0' ? `${detail.rating}${detail.ratingCount > 0 ? ` (${detail.ratingCount})` : ''}` : '-' }, { label: '语言', value: detail.language || '-' }].map((m, i) => (
                  <div key={i} style={{ textAlign: 'center', minWidth: 50 }}><div style={{ fontSize: '0.65rem', color: '#666', textTransform: 'uppercase', marginBottom: 2 }}>{m.label}</div><div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#ccc' }}>{m.value}</div></div>
                ))}
              </div>
              {detail.tagGroups?.length > 0 && (
                <div style={{ padding: '12px 24px', borderBottom: '1px solid #1a1a3a' }}>
                  {detail.tagGroups.map((grp, gi) => (
                    <div key={gi} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 8 }}>
                      <span style={{ flexShrink: 0, padding: '2px 10px', borderRadius: 4, background: '#7c3aed20', color: '#a78bfa', fontSize: '0.7rem', fontWeight: 600, lineHeight: '20px', marginTop: 2 }}>{nsTranslations[grp.namespace] || grp.namespace}</span>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, flex: 1 }}>{grp.tags.map((t, ti) => <span key={ti} title={t} style={{ padding: '2px 10px', borderRadius: 4, background: '#1a1a3a', color: '#ccc', fontSize: '0.72rem', border: '1px solid #2a2a4a' }}>{tagTranslations[`${grp.namespace}:${t}`] || t}</span>)}</div>
                    </div>
                  ))}
                </div>
              )}
              <div style={{ padding: '14px 24px', display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <Link to={`/reader-local/${detail.gid}`} onClick={() => { try { sessionStorage.setItem('reader-local-list', JSON.stringify(filtered.map(g => g.gid))) } catch { } }} className="btn-sm" style={{ textDecoration: 'none', borderColor: '#10b981', color: '#6ee7b7' }}>📖 在线阅读</Link>
                  {detail.token && <a href={`https://e-hentai.org/g/${detail.gid}/${detail.token}/`} target="_blank" rel="noreferrer" className="btn-sm" style={{ textDecoration: 'none', color: '#a78bfa', borderColor: '#7c3aed' }}>🌐 在 E-Hentai 查看</a>}
                  <button className="btn-sm" onClick={() => {
                    const tags = []; detail.tagGroups?.forEach(grp => { const ns = grp.namespace.toLowerCase(); if (ns === 'artist' || ns === 'group' || ns === 'other') grp.tags.forEach(t => tags.push({ ns: grp.namespace, tag: t })) })
                    setAlbumModal({ gid: detail.gid, title: detail.title, tags }); setDetail(null)
                  }} style={{ borderColor: '#8b5cf6', color: '#c4b5fd' }}>📁 添加到专辑</button>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn-sm" onClick={async () => {
                    const tags = await fetchGalleryMetaTags(detail.gid)
                    setEditTagsForm({
                      title: detail.title, category: detail.category || 'other',
                      language: detail.language || '', tags: tags || {}
                    })
                    setEditTagsModal({ gid: detail.gid, title: detail.title })
                    setDetail(null)
                  }} style={{ borderColor: '#f59e0b', color: '#fbbf24' }}>🏷 编辑标签</button>
                  {detail.token && <button className="btn-sm" onClick={() => handleRedownload(detail.gid, detail.title, detail.token)} style={{ borderColor: '#f59e0b', color: '#fbbf24' }}>🔄 重新下载</button>}
                  <button className="btn-sm" onClick={() => setDeleteConfirm({ gid: detail.gid, title: detail.title })} style={{ borderColor: '#ef4444', color: '#fca5a5' }}>🗑 删除</button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 删除确认 */}
        {deleteConfirm && <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setDeleteConfirm(null) }}><div className="modal" style={{ maxWidth: 400 }}><h3 style={{ color: '#f87171', marginBottom: 12 }}>确认删除</h3><p style={{ fontSize: '0.9rem', color: '#ccc', marginBottom: 8, wordBreak: 'break-all' }}>{deleteConfirm.title}</p><p style={{ fontSize: '0.78rem', color: '#888', marginBottom: 16 }}>此操作不可撤销。</p><div className="modal-actions" style={{ justifyContent: 'flex-end' }}><button className="btn-sm" onClick={() => setDeleteConfirm(null)} style={{ borderColor: '#444', color: '#888' }}>取消</button><button className="btn-sm" onClick={() => handleDelete(deleteConfirm.gid)} disabled={deleting} style={{ borderColor: '#ef4444', color: '#fca5a5', background: '#7f1d1d20' }}>{deleting ? '删除中...' : '确认删除'}</button></div></div></div>}

        {/* 批量删除 */}
        {batchDeleteConfirm && <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setBatchDeleteConfirm(false) }}><div className="modal" style={{ maxWidth: 400 }}><h3 style={{ color: '#f87171', marginBottom: 12 }}>批量删除确认</h3><p style={{ fontSize: '0.9rem', color: '#ccc', marginBottom: 8 }}>将永久删除选中的 <strong style={{ color: '#fca5a5' }}>{selected.size}</strong> 部画廊。</p><p style={{ fontSize: '0.78rem', color: '#888', marginBottom: 16 }}>此操作不可撤销。</p><div className="modal-actions" style={{ justifyContent: 'flex-end' }}><button className="btn-sm" onClick={() => setBatchDeleteConfirm(false)} style={{ borderColor: '#444', color: '#888' }}>取消</button><button className="btn-sm" onClick={handleBatchDelete} disabled={deleting} style={{ borderColor: '#ef4444', color: '#fca5a5', background: '#7f1d1d20' }}>{deleting ? '删除中...' : `确认删除 ${selected.size} 部`}</button></div></div></div>}

        {/* 批量重新下载 */}
        {batchRedownloadConfirm && <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setBatchRedownloadConfirm(false) }}><div className="modal" style={{ maxWidth: 400 }}><h3 style={{ color: '#fbbf24', marginBottom: 12 }}>批量重新下载确认</h3><p style={{ fontSize: '0.9rem', color: '#ccc', marginBottom: 8 }}>将重新下载选中的 <strong style={{ color: '#fbbf24' }}>{selected.size}</strong> 部画廊。</p><p style={{ fontSize: '0.78rem', color: '#888', marginBottom: 16 }}>需要有效的 .eh 元文件（含 token）。</p><div className="modal-actions" style={{ justifyContent: 'flex-end' }}><button className="btn-sm" onClick={() => setBatchRedownloadConfirm(false)} style={{ borderColor: '#444', color: '#888' }}>取消</button><button className="btn-sm" onClick={handleBatchRedownload} disabled={deleting} style={{ borderColor: '#f59e0b', color: '#fbbf24', background: '#78350f20' }}>{deleting ? '处理中...' : `确认重新下载 ${selected.size} 部`}</button></div></div></div>}

        {/* 添加到专辑 */}
        {albumModal && (
          <div className="modal-overlay" onClick={() => setAlbumModal(null)}>
            <div className="modal" style={{ maxWidth: 420 }} onClick={e => e.stopPropagation()}>
              <h3 style={{ marginBottom: 4 }}>📁 添加到专辑</h3>
              <p style={{ fontSize: '0.8rem', color: '#888', marginBottom: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{albumModal.title}</p>
              {Object.keys(albumConfig).length > 0 && <div style={{ marginBottom: 12 }}><div style={{ fontSize: '0.75rem', color: '#666', marginBottom: 6 }}>选择已有专辑：</div><div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>{Object.entries(albumConfig).map(([key, val]) => { const gids = val.gids || []; const displayName = val.name || key; return <button key={key} className="btn-sm" onClick={() => { const cfg = { ...albumConfig }; cfg[key] = { ...cfg[key], gids: [...gids.filter(id => id !== albumModal.gid), albumModal.gid] }; saveAlbums(cfg); setAlbumModal(null); setToast(`已添加到 "${displayName}"`); setTimeout(() => setToast(null), 1500) }} style={{ borderColor: '#8b5cf6', color: '#c4b5fd', fontSize: '0.72rem' }}>📁 {displayName} ({gids.length})</button> })}</div></div>}
              <div style={{ fontSize: '0.75rem', color: '#666', marginBottom: 6 }}>用标签创建新专辑：</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 12 }}>{albumModal.tags.map((t, i) => <button key={i} className="btn-sm" onClick={() => { const key = t.tag; const cfg = { ...albumConfig }; cfg[key] = { name: key, gids: [...(cfg[key]?.gids || []), albumModal.gid] }; saveAlbums(cfg); setAlbumModal(null); setToast(`已创建专辑 "${key}"`); setTimeout(() => setToast(null), 1500) }} style={{ borderColor: '#f59e0b', color: '#fbbf24', fontSize: '0.72rem' }}>{t.ns === 'artist' ? '👤' : t.ns === 'group' ? '👥' : '📦'} {t.tag}</button>)}</div>
              <div style={{ display: 'flex', gap: 6 }}><input id="new-album-name" type="text" placeholder="或手动输入专辑名..." style={{ flex: 1, padding: '6px 10px', borderRadius: 6, border: '1px solid #2a2a4a', background: '#0f0f1a', color: '#e0e0e0', fontSize: '0.8rem', outline: 'none' }} onKeyDown={e => { if (e.key === 'Enter') { const v = e.target.value.trim(); if (v) { const cfg = { ...albumConfig }; cfg[v] = { name: v, gids: [...(cfg[v]?.gids || []), albumModal.gid] }; saveAlbums(cfg); setAlbumModal(null); setToast(`已创建专辑 "${v}"`); setTimeout(() => setToast(null), 1500) } } }} /><button className="btn-sm" onClick={() => { const v = document.getElementById('new-album-name')?.value?.trim(); if (v) { const cfg = { ...albumConfig }; cfg[v] = { name: v, gids: [...(cfg[v]?.gids || []), albumModal.gid] }; saveAlbums(cfg); setAlbumModal(null); setToast(`已创建专辑 "${v}"`); setTimeout(() => setToast(null), 1500) } }} style={{ borderColor: '#10b981', color: '#6ee7b7' }}>创建</button></div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}><button className="btn-sm" onClick={() => setAlbumModal(null)} style={{ borderColor: '#444', color: '#888' }}>取消</button></div>
            </div>
          </div>
        )}
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
                  await loadGalleries()
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
                  await loadGalleries()
                } catch (e) { setToast('批量导入失败: ' + e.message); setTimeout(() => setToast(null), 2000) }
                setBatchImporting(false)
              }} disabled={batchImporting} style={{ borderColor: '#f59e0b', color: '#fbbf24' }}>{batchImporting ? '导入中...' : '🚀 开始批量导入'}</button>
            </div>
          </div>
        </div>
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
                  await loadGalleries()
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
