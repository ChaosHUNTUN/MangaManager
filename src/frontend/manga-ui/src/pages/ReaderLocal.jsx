import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { fetchLocalGalleryPagesAbortable, fetchLocalGalleryDetail, fetchReadingProgressAbortable, saveReadingProgress, API_BASE } from '../api'
import { useReaderEngine } from '../visual-test/reader/useReaderEngine'
import useImagePreload from '../hooks/useImagePreload'
import PaginatedView from '../visual-test/reader/PaginatedView'
import ContinuousView from '../visual-test/reader/ContinuousView'
import ReaderToolbar from '../visual-test/reader/ReaderToolbar'
import '../visual-test/reader/reader.css'

/**
 * 统一阅读器 — 接入视觉测试平台已验证的 reader 引擎 + 视图
 */
export default function ReaderLocal() {
  const { gid } = useParams()
  const navigate = useNavigate()

  // ── 数据加载 ──
  const [pages, setPages] = useState([])
  const [loading, setLoading] = useState(true)
  const [title, setTitle] = useState('')
  const abortRef = useRef(null)
  const currentGid = parseInt(gid)
  const [initialPage, setInitialPage] = useState(null)   // null=未加载, 0+=已加载(含0页)

  // ── 阅读进度 ──
  const progressRef = useRef({})
  const saveTimerRef = useRef(null)
  const saveProgress = useCallback((g, page) => {
    if (Number.isNaN(g)) return
    progressRef.current[g] = page
    const items = Object.entries(progressRef.current)
      .map(([k, p]) => ({ gid: parseInt(k), pageIndex: p }))
      .filter(item => !Number.isNaN(item.gid))
    if (items.length > 0) saveReadingProgress(items)
  }, [])
  const flushProgress = useCallback(() => {
    const items = Object.entries(progressRef.current)
      .map(([k, p]) => ({ gid: parseInt(k), pageIndex: p }))
      .filter(item => !Number.isNaN(item.gid))
    if (items.length > 0) {
      try { const blob = new Blob([JSON.stringify(items)], { type: 'application/json' }); navigator.sendBeacon(`${API_BASE}/api/readingprogress`, blob) } catch {}
    }
  }, [])

  // 加载画廊标题（详情接口返回标题，失败时回退为 gid）
  useEffect(() => {
    if (Number.isNaN(currentGid)) { setTitle(''); return }
    setTitle(String(currentGid))
    let cancelled = false
    fetchLocalGalleryDetail(currentGid)
      .then(d => { if (!cancelled && d?.title) setTitle(d.title) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [gid])

  // 加载上次进度
  useEffect(() => {
    if (Number.isNaN(currentGid)) return
    const ctrl = new AbortController()
    fetchReadingProgressAbortable(currentGid, ctrl.signal)
      .then(pageIndex => { if (!ctrl.signal.aborted) setInitialPage(pageIndex ?? 0) })
      .catch(() => {})
    return () => ctrl.abort()
  }, [gid])

  // 退出时保存
  useEffect(() => () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); flushProgress() }, [])
  useEffect(() => {
    const handler = () => flushProgress()
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [])

  useEffect(() => {
    const gidNum = parseInt(gid)
    if (isNaN(gidNum)) { setLoading(false); return }
    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl
    setLoading(true)
    fetchLocalGalleryPagesAbortable(gidNum, ctrl.signal)
      .then(p => {
        const arr = Array.isArray(p) ? p : (p?.data || [])
        // url 可能是相对路径 (/api/...) 或完整 URL
        const urls = arr.map(page => {
          if (!page) return ''
          const raw = typeof page === 'string' ? page : (page.url || page.Url || page.path || '')
          if (!raw) return ''
          // 已是绝对 URL 则用原值, 否则拼接 API_BASE
          return raw.startsWith('http') ? raw : `${API_BASE}${raw}`
        }).filter(Boolean)
        setPages(urls)
        setLoading(false)
      })
      .catch(err => {
        if (err?.name !== 'AbortError') console.error('[Reader] pages load failed:', err)
        setLoading(false)
      })
    return () => ctrl.abort()
  }, [gid])

  // ── 画廊间导航 ──
  // 优先级: reader-local-full-gids (完整列表, 异步加载) > reader-local-context.gids (当前页)
  const [galleryList, setGalleryList] = useState([])
  const loadGalleryList = useCallback(() => {
    try {
      const fullGids = JSON.parse(sessionStorage.getItem('reader-local-full-gids') || 'null')
      if (fullGids?.length) { setGalleryList(fullGids); return }
      const ctx = JSON.parse(sessionStorage.getItem('reader-local-context') || 'null')
      if (ctx?.gids?.length) setGalleryList(ctx.gids)
    } catch {}
  }, [])
  useEffect(loadGalleryList, [gid])
  // 监听完整列表异步加载完成
  useEffect(() => {
    const onUpdate = (e) => { if (e.detail?.length) setGalleryList(e.detail) }
    window.addEventListener('reader-gids-updated', onUpdate)
    return () => window.removeEventListener('reader-gids-updated', onUpdate)
  }, [])

  const currentIdx = galleryList.indexOf(parseInt(gid))
  // 如果当前 gid 不在列表中（如从搜索结果直接打开），尝试插回去
  // 否则上一个/下一个就找不到
  const hasPrev = galleryList.length > 0 && currentIdx > 0
  const hasNext = galleryList.length > 0 && currentIdx >= 0 && currentIdx < galleryList.length - 1

  // ── Engine ──
  const engine = useReaderEngine(pages.length)
  const { currentPage, totalPages, direction, flow, fit, zoom,
    background, bgValue, padding, uiVisible,
    slideshowActive, slideshowInterval, scrollSpeed, viewport,
    pageStep, flipDirRef,
    setCurrentPage, setDirection, setFlow, setFit, setZoom,
    setBackground, setPadding, setUiVisible,
    setSlideshowInterval, setScrollSpeed,
    goForward, goBack, goFirst, goLast, setFitCycled, zoomIn, zoomOut, zoomReset,
    setBgCycled, toggleSlideshow, setSlideshowActive,
    scrollerRef,
  } = engine

  // ── 画廊间切换（需在 engine 之后, currentPage 依赖其解构） ──
  const goPrevGallery = useCallback(() => {
    saveProgress(currentGid, currentPage)   // 保存真实页码, 勿覆盖为 0
    if (currentIdx < 0) return
    const prev = galleryList[currentIdx - 1]
    if (prev) navigate(`/reader-local/${prev}`, { replace: true })
  }, [galleryList, currentIdx, navigate, currentGid, currentPage, saveProgress])
  const goNextGallery = useCallback(() => {
    saveProgress(currentGid, currentPage)   // 保存真实页码, 勿覆盖为 0
    if (currentIdx < 0) return
    const next = galleryList[currentIdx + 1]
    if (next) navigate(`/reader-local/${next}`, { replace: true })
  }, [galleryList, currentIdx, navigate, currentGid, currentPage, saveProgress])

  // 返回书架（保存进度后回到进入阅读器前的筛选/排序状态）
  const handleBack = useCallback(() => {
    saveProgress(currentGid, currentPage)
    const returnUrl = sessionStorage.getItem('reader-local-return-url') || ''
    navigate(`/local${returnUrl}`, { replace: true })
  }, [saveProgress, currentGid, currentPage, navigate])

  // ── 图片预加载 (±50 页半径, gid 变化自动中断) ──
  useImagePreload(pages, currentPage, currentGid)

  // ── UI 自动隐藏 ──
  const uiTimerRef = useRef(null)
  const clearTimer = useCallback(() => clearTimeout(uiTimerRef.current), [])
  const startTimer = useCallback(() => {
    clearTimer()
    uiTimerRef.current = setTimeout(() => { setUiVisible(false); setShowThumbs(false) }, 4000)
  }, [setUiVisible, clearTimer])

  const [showThumbs, setShowThumbs] = useState(false)
  const [showHelp, setShowHelp] = useState(false)

  useEffect(() => {
    if (!uiVisible && !showThumbs) return clearTimer()
    startTimer()
    return clearTimer
  }, [uiVisible, showThumbs, currentPage, startTimer, clearTimer])

  // ── gid 切换时清除全部状态, 避免上一部作品的残留数据污染 ──
  useEffect(() => {
    setCurrentPage(0)
    setInitialPage(null)
    progressRestoredRef.current = null
  }, [gid, setCurrentPage])

  // ── 进度的效果（必须在 engine 之后） ──
  // 恢复上次位置（首次加载 + gid 变更时）
  const progressRestoredRef = useRef(null)
  useEffect(() => {
    if (initialPage === null || loading || progressRestoredRef.current === currentGid) return
    progressRestoredRef.current = currentGid
    setCurrentPage(initialPage)
  }, [initialPage, loading, currentGid, setCurrentPage])

  // 翻页时自动保存进度（2秒防抖）
  useEffect(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => saveProgress(currentGid, currentPage), 2000)
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current) }
  }, [currentPage, currentGid, saveProgress])

  // ── 键盘 ──
  useEffect(() => {
    const onKey = (e) => {
      if (e.ctrlKey || e.metaKey) {
        if (e.key === '=' || e.key === '+') { e.preventDefault(); zoomIn(); }
        else if (e.key === '-') { e.preventDefault(); zoomOut(); }
        else if (e.key === 'ArrowLeft') { e.preventDefault(); goFirst(); }   // Ctrl+← 第一页
        else if (e.key === 'ArrowRight') { e.preventDefault(); goLast(); }   // Ctrl+→ 尾页
        return
      }
      if (e.key === 'ArrowRight') { e.preventDefault(); goForward(); return }
      if (e.key === 'ArrowLeft')  { e.preventDefault(); goBack(); return }
      if (e.key === 'ArrowUp') {
        if (flow === 'paginated') { e.preventDefault(); goNextGallery(); }
        else if (scrollerRef.current) { e.preventDefault(); scrollerRef.current.scrollTop -= 300 }
        return
      }
      if (e.key === 'ArrowDown') {
        if (flow === 'paginated') { e.preventDefault(); goPrevGallery(); }
        else if (scrollerRef.current) { e.preventDefault(); scrollerRef.current.scrollTop += 300 }
        return
      }
      if (e.key === 'PageUp')   { e.preventDefault(); goNextGallery(); return }
      if (e.key === 'PageDown') { e.preventDefault(); goPrevGallery(); return }
      if (e.key === 'Home') { e.preventDefault(); goFirst(); return }
      if (e.key === 'End')  { e.preventDefault(); goLast(); return }
      if (e.key === 'Tab') { e.preventDefault(); setUiVisible(v => !v) }
      if (e.key === ' ')   { e.preventDefault(); toggleSlideshow() }
      if (e.key === 'Escape') {
        e.preventDefault()
        handleBack()
      }
      if (e.key === '0') zoomReset()
      if (e.key === 'f') setFlow(f => f === 'paginated' ? 'continuous' : 'paginated')
      if (e.key === 'd') setDirection(d => d === 'horizontal' ? 'vertical' : 'horizontal')
      if (e.key === '?' || e.key === 'h' || e.key === 'H') { e.preventDefault(); setShowHelp(s => !s) }
      
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [goForward, goBack, goFirst, goLast, flow, direction, zoomIn, zoomOut, zoomReset, toggleSlideshow,
    setUiVisible, setFlow, setDirection, scrollerRef, goPrevGallery, goNextGallery, handleBack,
    currentPage, currentGid, saveProgress])

  // ── 滚轮缩放 ──
  const handleWheel = useCallback((e) => {
    if (e.ctrlKey || e.metaKey) { e.preventDefault(); e.deltaY < 0 ? zoomIn() : zoomOut() }
  }, [zoomIn, zoomOut])

  // ── 点击中部 ──
  const handleCanvasClick = useCallback(() => {
    setUiVisible(v => !v)
    if (!uiVisible) setShowThumbs(true)
  }, [uiVisible, setUiVisible])

  if (loading) return <div className="r-root"><div className="r-img-spinner">Loading...</div></div>
  if (pages.length === 0) return (
    <div className="r-root" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ color: 'var(--text-muted)', textAlign: 'center' }}>
        <div style={{ fontSize: '1.5rem', marginBottom: 8 }}>📭</div>
        <div>该作品暂无页面数据</div>
        <button className="btn-sm" style={{ marginTop: 16 }} onClick={() => navigate(-1)}>返回</button>
      </div>
    </div>
  )

  return (
    <div className="r-root" style={{ background: bgValue }}
      onClick={(e) => {
        if (e.target.closest('.r-hud') || e.target.closest('.r-bar') || e.target.closest('.r-flip-area')) return
        handleCanvasClick()
      }}
      onWheel={handleWheel}>
      <ReaderToolbar
        uiVisible={uiVisible} showThumbs={showThumbs}
        title={title} currentPage={currentPage} totalPages={totalPages}
        direction={direction} flow={flow} fit={fit} zoom={zoom}
        background={background} padding={padding}
        slideshowActive={slideshowActive} slideshowInterval={slideshowInterval}
        setUiVisible={setUiVisible} setShowThumbs={setShowThumbs}
        setDirection={setDirection} setFlow={setFlow}
        setBgCycled={setBgCycled} setPadding={setPadding} setFitCycled={setFitCycled}
        zoomIn={zoomIn} zoomOut={zoomOut} zoomReset={zoomReset}
        toggleSlideshow={toggleSlideshow} setSlideshowInterval={setSlideshowInterval}
        scrollSpeed={scrollSpeed} setScrollSpeed={setScrollSpeed}
        goForward={goForward} goBack={goBack}
        images={pages} pageStep={pageStep} setCurrentPage={setCurrentPage}
        onBack={handleBack}
        showHelp={showHelp} onToggleHelp={() => setShowHelp(s => !s)}
      />
      {flow === 'paginated' ? (
        <PaginatedView key={`paginated-${totalPages}`}
          images={pages} currentPage={currentPage}
          totalPages={totalPages}
          flipDirRef={flipDirRef} viewport={viewport} padding={padding}
          goForward={goForward} goBack={goBack}
          setUiVisible={setUiVisible} uiVisible={uiVisible}
        />
      ) : (
        <ContinuousView key={`continuous-${totalPages}`}
          images={pages} direction={direction} zoom={zoom}
          padding={padding} viewport={viewport} scrollerRef={scrollerRef}
          uiVisible={uiVisible} setUiVisible={setUiVisible}
        />
      )}

      {/* 快捷键帮助面板 */}
      {showHelp && (
        <div onClick={() => setShowHelp(false)} style={{
          position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            background: 'var(--glass-bg)', backdropFilter: 'blur(20px) saturate(1.2)',
            border: '1px solid var(--glass-border)', borderRadius: 'var(--radius-lg)',
            padding: '20px 24px', maxWidth: 440, width: '90vw',
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04)',
          }}>
            <div style={{ fontSize: 'var(--text-md)', fontWeight: 600, color: 'var(--text-primary)', marginBottom: 14 }}>⌨ 键盘快捷键</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7, fontSize: 'var(--text-sm)' }}>
              {[
                ['← / A', '上一页'], ['→ / D', '下一页'],
                ['↑ / ↓', '上 / 下一部作品'], ['PageUp / PageDown', '上 / 下一部作品'],
                ['Home / End', '第一页 / 最后一页'], ['空格', '幻灯片 / 自动滚动'],
                ['Tab', '显示 / 隐藏界面'], ['F', '翻页 / 滚动模式'],
                ['D', '滚动方向'], ['0', '重置缩放'],
                ['Ctrl + 滚轮 / ±', '缩放'], ['Ctrl + ← / →', '第一页 / 尾页'],
                ['Esc', '返回书架'], ['? / H', '显示 / 隐藏帮助'],
              ].map(([k, v]) => (
                <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <span style={{ color: 'var(--accent)', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', whiteSpace: 'nowrap', minWidth: 104 }}>{k}</span>
                  <span style={{ color: 'var(--text-secondary)' }}>{v}</span>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 14, fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>点击空白处关闭 · 再次按 ? 关闭</div>
          </div>
        </div>
      )}
    </div>
  )
}
