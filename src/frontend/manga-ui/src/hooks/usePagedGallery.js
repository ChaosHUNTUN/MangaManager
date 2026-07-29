import { useState, useEffect, useCallback, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { fetchLocalGalleriesPaged, fetchLocalGalleriesRandom, fetchLocalGalleryMetas, fetchLocalGalleryGids } from '../api'

/**
 * 分页画廊加载 Hook
 * — URL 参数双向同步、分页/随机加载、竞态防护、自动匹配事件监听
 */
export default function usePagedGallery({ albumConfig, albumConfigRef, albumsLoaded, setError }) {
  // ── URL 参数 ──
  const [searchParams, setSearchParams] = useSearchParams()
  const search = searchParams.get('q') || ''
  const sortBy = searchParams.get('sort') || 'modified-desc'
  const pageSize = parseInt(searchParams.get('size') || '20', 10)
  const page = parseInt(searchParams.get('p') || '1', 10)
  const activeGroup = searchParams.get('group') || 'all'
  const randomMode = searchParams.get('random') === 'true'

  const updateParams = useCallback((updates) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev)
      if (!('random' in updates)) next.delete('random')
      Object.entries(updates).forEach(([k, v]) => {
        if (v === null || v === undefined || v === '' || v === 'all' || v === 'modified-desc' || v === 'grid' || v === 20 || v === 1) next.delete(k)
        else next.set(k, String(v))
      })
      return next
    }, { replace: true })
  }, [setSearchParams])

  const setSearch = useCallback((v) => updateParams({ q: v || null }), [updateParams])
  const setPage = useCallback((v) => updateParams({ p: v === 1 ? null : v }), [updateParams])

  // ── 元数据 ──
  const [galleryMetas, setGalleryMetas] = useState([])
  const [metaLoading, setMetaLoading] = useState(true)
  const loadMetas = useCallback(async () => {
    setMetaLoading(true)
    try { setGalleryMetas(await fetchLocalGalleryMetas()) } catch { }
    setMetaLoading(false)
  }, [])
  useEffect(() => { loadMetas() }, [loadMetas])

  // ── 分页状态 ──
  const [pageItems, setPageItems] = useState([])
  const [pageTotal, setPageTotal] = useState(0)
  const [pageTotalPages, setPageTotalPages] = useState(1)
  const [pageLoading, setPageLoading] = useState(true)

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

  // 自动匹配事件监听（下载完成后触发）
  useEffect(() => {
    const handler = () => { loadMetas(); loadPaged() }
    window.addEventListener('local-gallery-auto-match', handler)
    return () => window.removeEventListener('local-gallery-auto-match', handler)
  }, [loadPaged])

  // ── 阅读器上下文 ──
  const handleOpenReader = useCallback(async ({ gid, albumConfig, isRandom, paged }) => {
    const allGids = Object.values(albumConfig).flatMap(v => v.gids || [])
    let ag = null, ao = null
    if (activeGroup.startsWith('album:')) {
      const album = albumConfig[activeGroup.slice(6)]
      if (album) { ag = album.gids || []; ao = sortBy === 'custom' ? (album.order || album.gids) : null }
    }
    const contextGids = paged.map(g2 => g2.gid)
    sessionStorage.setItem('reader-local-context', JSON.stringify({ group: isRandom ? undefined : activeGroup, search: isRandom ? undefined : search, sort: isRandom ? undefined : sortBy, gids: contextGids, total: isRandom ? paged.length : pageTotal, isRandom }))
    sessionStorage.setItem('reader-local-return-url', window.location.search)
    if (isRandom) sessionStorage.removeItem('reader-local-full-gids')
    if (!isRandom) {
      try {
        const fg = await fetchLocalGalleryGids({ group: activeGroup === 'all' ? null : activeGroup, search: search || null, sort: sortBy || null, albumGids: activeGroup.startsWith('album:') ? ag : allGids.length > 0 ? allGids : null, albumOrder: ao })
        if (fg?.length) { sessionStorage.setItem('reader-local-full-gids', JSON.stringify(fg)); window.dispatchEvent(new CustomEvent('reader-gids-updated', { detail: fg })) }
      } catch { }
    }
  }, [activeGroup, search, sortBy, pageTotal])

  return {
    galleryMetas, setGalleryMetas, metaLoading,
    pageItems, pageTotal, pageTotalPages, pageLoading,
    search, sortBy, pageSize, page, activeGroup, randomMode,
    searchParams, setSearch, setPage, updateParams,
    loadMetas, loadPaged, loadRandom, handleOpenReader,
  }
}


