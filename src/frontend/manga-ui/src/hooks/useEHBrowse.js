import { useState, useEffect, useRef, useCallback } from 'react'
import { fetchEHGalleries, checkDownloaded } from '../api'

export default function useEHBrowse() {
  // 浏览
  const [galleries, setGalleries] = useState([])
  const [search, setSearch] = useState('')
  const [totalPages, setTotalPages] = useState(0)
  const [nextCursor, setNextCursor] = useState(null)
  const [hasMore, setHasMore] = useState(true)
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState(null)
  const [exhentai, setExhentai] = useState(true)
  const [popularMode, setPopularMode] = useState(true)
  const loadMoreRef = useRef(null)
  const currentSearchRef = useRef('')
  const currentExRef = useRef(true)
  const currentFiltersRef = useRef({})

  // 本地/下载状态
  const [localGids, setLocalGids] = useState(new Set())
  const [downloadingGids, setDownloadingGids] = useState(new Set())

  // 高级搜索
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [filters, setFilters] = useState({
    categoryMask: 0, minRating: 0, pageFrom: '', pageTo: '', advSearch: 0,
  })

  const toggleCategory = (bit) => { setFilters(f => ({ ...f, categoryMask: f.categoryMask ^ bit })) }
  const toggleAdvSearch = (bit) => { setFilters(f => ({ ...f, advSearch: f.advSearch ^ bit })) }

  const buildFiltersObj = (isPopular = false) => {
    const f = {}
    if (isPopular) f.popular = true
    if (filters.categoryMask) f.categoryMask = filters.categoryMask
    if (filters.minRating > 0) f.minRating = filters.minRating
    if (filters.pageFrom) f.pageFrom = parseInt(filters.pageFrom) || undefined
    if (filters.pageTo) f.pageTo = parseInt(filters.pageTo) || undefined
    if (filters.advSearch) f.advSearch = filters.advSearch
    return f
  }

  // 浏览
  const browseAbortRef = useRef(null)
  const browse = async (s, ex, forcePopular = null) => {
    if (browseAbortRef.current) browseAbortRef.current.abort()
    const ctrl = new AbortController(); browseAbortRef.current = ctrl
    setLoading(true); setError(null); setGalleries([]); setTotalPages(0)
    setNextCursor(null); setHasMore(true)
    currentSearchRef.current = s
    currentExRef.current = ex
    const isPopular = forcePopular !== null ? forcePopular : (popularMode && !s)
    const filterObj = buildFiltersObj(isPopular)
    currentFiltersRef.current = filterObj
    try {
      const r = await fetchEHGalleries(s, 0, ex, null, filterObj, ctrl.signal)
      if (!ctrl.signal.aborted) {
        const gals = r.galleries || []
        setGalleries(gals)
        setTotalPages(r.totalPages || 0)
        setHasMore(!!r.nextCursor)
        setNextCursor(r.nextCursor || null)
        if (gals.length > 0) {
          const gids = gals.map(g => g.gid)
          checkDownloaded(gids).then(downloaded => setLocalGids(new Set(downloaded))).catch(() => {})
        }
      }
    } catch (e) { if (e.name !== 'AbortError') setError(e.message) }
    if (!ctrl.signal.aborted) setLoading(false)
  }

  const goPopular = () => { setSearch(''); browse('', exhentai, true) }

  const loadMore = useCallback(async () => {
    if (loadingMore || loading || !hasMore || !nextCursor) return
    setLoadingMore(true)
    const requestCursor = nextCursor
    try {
      const r = await fetchEHGalleries(currentSearchRef.current, 0, currentExRef.current, requestCursor, currentFiltersRef.current)
      const newItems = r.galleries || []
      if (newItems.length === 0) { setHasMore(false) }
      else {
        setGalleries(prev => [...prev, ...newItems])
        if (nextCursor === requestCursor) {
          setNextCursor(r.nextCursor || null)
          setHasMore(!!r.nextCursor)
        }
        const gids = newItems.map(g => g.gid)
        checkDownloaded(gids).then(downloaded => {
          setLocalGids(prev => { const s = new Set(prev); downloaded.forEach(d => s.add(d)); return s })
        }).catch(() => {})
      }
    } catch (e) { /* 静默失败 */ }
    setLoadingMore(false)
  }, [loadingMore, loading, hasMore, nextCursor])

  // IntersectionObserver：懒加载
  useEffect(() => {
    const el = loadMoreRef.current
    if (!el || galleries.length === 0) return
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) loadMore() },
      { rootMargin: '400px' }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [galleries.length, totalPages, nextCursor, hasMore, loading, loadingMore])

  return {
    galleries, search, setSearch, totalPages, nextCursor, hasMore,
    loading, loadingMore, error, setError,
    exhentai, setExhentai, popularMode, setPopularMode, loadMoreRef,
    localGids, setLocalGids, downloadingGids, setDownloadingGids,
    filters, setFilters, toggleCategory, toggleAdvSearch, buildFiltersObj,
    showAdvanced, setShowAdvanced, browse, goPopular, loadMore,
  }
}
