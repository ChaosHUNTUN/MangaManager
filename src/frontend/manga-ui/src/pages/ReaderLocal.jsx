import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { fetchLocalGalleryPagesAbortable, fetchLocalGalleryDetail, fetchReadingProgressAbortable, saveReadingProgress, API_BASE } from '../api'
import { useReaderEngine } from '../visual-test/reader/useReaderEngine'
import useImagePreload from '../hooks/useImagePreload'
import PaginatedView from '../visual-test/reader/PaginatedView'
import ContinuousView from '../visual-test/reader/ContinuousView'
import ReaderToolbar from '../visual-test/reader/ReaderToolbar'
import '../visual-test/reader/reader.css'

/** 归一化 pages 响应为绝对 URL 数组（相对路径拼 API_BASE） */
function normalizePages(p) {
  const arr = Array.isArray(p) ? p : (p?.data || [])
  return arr.map(page => {
    if (!page) return ''
    const raw = typeof page === 'string' ? page : (page.url || page.Url || page.path || '')
    if (!raw) return ''
    return raw.startsWith('http') ? raw : `${API_BASE}${raw}`
  }).filter(Boolean)
}

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
  const [initialProgress, setInitialProgress] = useState(null)   // null=未加载, {gid, pageIndex, scrollOffset}=已加载
  const pagesCacheRef = useRef({})       // gid → 绝对 URL 列表（会话内预取/已加载缓存，作品间切换秒开）
  const preloadCtrlRef = useRef(null)    // 预取 AbortController

  // ── 阅读进度 ──
  const progressRef = useRef({})           // gid → { page, offset }
  const saveTimerRef = useRef(null)
  const offsetRef = useRef(0)              // 当前滚动页内偏移（0~1）
  const progressRestoredRef = useRef(null) // 恢复完成前禁止保存，避免串进度

  const buildProgressItems = useCallback(() =>
    Object.entries(progressRef.current)
      .map(([k, p]) => ({ gid: parseInt(k), pageIndex: p?.page ?? 0, scrollOffset: p?.offset ?? null }))
      .filter(item => !Number.isNaN(item.gid)), [])

  const saveProgress = useCallback((g, page, offset) => {
    if (Number.isNaN(g)) return
    progressRef.current[g] = { page, offset: offset ?? null }
    const items = buildProgressItems()
    if (items.length > 0) saveReadingProgress(items)
  }, [buildProgressItems])
  const flushProgress = useCallback(() => {
    const items = buildProgressItems()
    if (items.length > 0) {
      try { const blob = new Blob([JSON.stringify(items)], { type: 'application/json' }); navigator.sendBeacon(`${API_BASE}/api/readingprogress`, blob) } catch {}
    }
  }, [buildProgressItems])

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
      .then(prog => {
        if (!ctrl.signal.aborted) {
          setInitialProgress({
            gid: currentGid,
            pageIndex: prog?.pageIndex ?? 0,
            scrollOffset: prog?.scrollOffset ?? null,
          })
        }
      })
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
    // 会话内已有缓存（预取或刚看过）→ 直接使用，秒开
    const cached = pagesCacheRef.current[gidNum]
    if (cached && cached.length > 0) {
      setPages(cached)
      setLoading(false)
      return
    }
    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl
    setLoading(true)
    fetchLocalGalleryPagesAbortable(gidNum, ctrl.signal)
      .then(p => {
        if (ctrl.signal.aborted) return
        const urls = normalizePages(p)
        pagesCacheRef.current[gidNum] = urls
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

  // ── Engine ──
  const engine = useReaderEngine(pages.length)
  const { currentPage, totalPages, direction, flow, readingOrder, fit, zoom,
    background, bgValue, padding, uiVisible,
    slideshowActive, slideshowInterval, scrollSpeed, viewport,
    pageStep, flipDirRef,
    setCurrentPage, setDirection, setFlow, setReadingOrder, setFit, setZoom,
    setBackground, setPadding, setUiVisible,
    setSlideshowInterval, setScrollSpeed,
    goForward, goBack, goFirst, goLast, setFitCycled, zoomIn, zoomOut, zoomReset,
    setBgCycled, toggleSlideshow, setSlideshowActive,
    scrollerRef, updateChrome,
  } = engine

  // ── 下一部预取：读到末尾阈值（最后 5%，至少 3 页）时预取下一页列表，切换秒开 ──
  // 注意：必须在 engine 解构之后（currentPage 已声明），否则 TDZ 崩溃
  useEffect(() => {
    if (loading || galleryList.length === 0 || pages.length === 0) return
    const idx = galleryList.indexOf(currentGid)
    if (idx < 0 || idx >= galleryList.length - 1) return
    const threshold = Math.max(3, Math.round(pages.length * 0.05))
    if (currentPage < pages.length - threshold) return
    const nextGid = galleryList[idx + 1]
    if (!nextGid || pagesCacheRef.current[nextGid]) return
    preloadCtrlRef.current?.abort()
    const ctrl = new AbortController()
    preloadCtrlRef.current = ctrl
    fetchLocalGalleryPagesAbortable(nextGid, ctrl.signal)
      .then(p => {
        if (ctrl.signal.aborted) return
        const urls = normalizePages(p)
        if (urls.length > 0) pagesCacheRef.current[nextGid] = urls
      })
      .catch(() => {})
    return () => { if (preloadCtrlRef.current === ctrl) preloadCtrlRef.current = null }
  }, [currentPage, pages, galleryList, currentGid, loading])

  // 方向/模式派生（键盘、手势、帮助面板共用）
  const isVertical = direction === 'vertical'
  const isPaged = flow === 'paginated'
  const [scrollRestore, setScrollRestore] = useState(null)   // {pageIndex, offset} 滚动恢复意图
  const rootRef = useRef(null)
  const [showThumbs, setShowThumbs] = useState(false)
  const [showHelp, setShowHelp] = useState(false)

  // ── 运行时测量 HUD/底部栏实际高度（含缩略图展开），替代硬编码 44/36 ──
  useEffect(() => {
    const measure = () => {
      const root = rootRef.current
      if (!root) return
      const hud = root.querySelector('.r-hud')
      const bar = root.querySelector('.r-bar')
      updateChrome(hud ? hud.getBoundingClientRect().height : 0, bar ? bar.getBoundingClientRect().height : 0)
    }
    measure()
    const t = setTimeout(measure, 80)   // AnimatePresence 高度动画结束后复测
    return () => clearTimeout(t)
  }, [uiVisible, showThumbs, updateChrome, loading])

  // ── 画廊间切换（需在 engine 之后, currentPage 依赖其解构） ──
  const [edgeHint, setEdgeHint] = useState('')
  const edgeHintTimerRef = useRef(null)
  const showEdgeHint = useCallback((msg) => {
    setEdgeHint(msg)
    clearTimeout(edgeHintTimerRef.current)
    edgeHintTimerRef.current = setTimeout(() => setEdgeHint(''), 1500)
  }, [])
  const goPrevGallery = useCallback(() => {
    if (progressRestoredRef.current === currentGid) saveProgress(currentGid, currentPage, isPaged ? null : offsetRef.current)   // 恢复完成前不保存，避免继承上一部页码
    if (currentIdx < 0) return
    if (currentIdx <= 0) { showEdgeHint('已是第一部'); return }
    const prev = galleryList[currentIdx - 1]
    if (prev) navigate(`/reader-local/${prev}`, { replace: true })
  }, [galleryList, currentIdx, navigate, currentGid, currentPage, saveProgress, showEdgeHint, isPaged])
  const goNextGallery = useCallback(() => {
    if (progressRestoredRef.current === currentGid) saveProgress(currentGid, currentPage, isPaged ? null : offsetRef.current)   // 恢复完成前不保存，避免继承上一部页码
    if (currentIdx < 0) return
    if (currentIdx >= galleryList.length - 1) { showEdgeHint('已是最后一部'); return }
    const next = galleryList[currentIdx + 1]
    if (next) navigate(`/reader-local/${next}`, { replace: true })
  }, [galleryList, currentIdx, navigate, currentGid, currentPage, saveProgress, showEdgeHint, isPaged])

  // 返回书架（保存进度后回到进入阅读器前的筛选/排序状态）
  const handleBack = useCallback(() => {
    if (progressRestoredRef.current === currentGid) saveProgress(currentGid, currentPage, isPaged ? null : offsetRef.current)
    const returnUrl = sessionStorage.getItem('reader-local-return-url') || ''
    navigate(`/local${returnUrl}`, { replace: true })
  }, [saveProgress, currentGid, currentPage, navigate, isPaged])

  // ── 图片预加载 (±50 页半径, gid 变化自动中断) ──
  useImagePreload(pages, currentPage, currentGid)

  // ── UI 自动隐藏 ──
  const uiTimerRef = useRef(null)
  const clearTimer = useCallback(() => clearTimeout(uiTimerRef.current), [])
  const startTimer = useCallback(() => {
    clearTimer()
    uiTimerRef.current = setTimeout(() => { setUiVisible(false); setShowThumbs(false) }, 4000)
  }, [setUiVisible, clearTimer])

  useEffect(() => {
    if (!uiVisible && !showThumbs) return clearTimer()
    startTimer()
    return clearTimer
  }, [uiVisible, showThumbs, currentPage, startTimer, clearTimer])

  // ── 交互感知的自动隐藏：任何操作都续期；鼠标移到底部/顶部区域时唤醒 UI ──
  const lastMoveRef = useRef(0)
  useEffect(() => {
    const onInteract = () => { if (uiVisible) startTimer() }
    const onMove = (e) => {
      const now = Date.now()
      if (now - lastMoveRef.current < 300) return
      lastMoveRef.current = now
      const nearBottom = window.innerHeight - e.clientY < 90
      const nearTop = e.clientY < 60
      if (nearBottom || nearTop) {
        setUiVisible(true)
        startTimer()
      } else if (uiVisible) {
        startTimer()
      }
    }
    window.addEventListener('pointerdown', onInteract)
    window.addEventListener('wheel', onInteract, { passive: true })
    window.addEventListener('keydown', onInteract)
    window.addEventListener('mousemove', onMove)
    return () => {
      window.removeEventListener('pointerdown', onInteract)
      window.removeEventListener('wheel', onInteract)
      window.removeEventListener('keydown', onInteract)
      window.removeEventListener('mousemove', onMove)
    }
  }, [uiVisible, startTimer, setUiVisible])

  // ── gid 切换时清除全部状态, 避免上一部作品的残留数据污染 ──
  useEffect(() => {
    setCurrentPage(0)
    setInitialProgress(null)
    progressRestoredRef.current = null
    setScrollRestore(null)
    offsetRef.current = 0
  }, [gid, setCurrentPage])

  // ── 进度的效果（必须在 engine 之后） ──
  // 恢复上次位置（首次加载 + gid 变更时）
  useEffect(() => {
    // initialProgress 携带 gid：只有与当前作品匹配时才恢复，杜绝把上一部的页码应用到本作
    if (!initialProgress || initialProgress.gid !== currentGid || loading || progressRestoredRef.current === currentGid) return
    progressRestoredRef.current = currentGid
    // 钳制越界进度（画廊重下/页数减少时避免停在占位页）
    const clamped = Math.min(initialProgress.pageIndex ?? 0, Math.max(0, totalPages - 1))
    setCurrentPage(clamped)
    // 滚动模式带页内偏移 → 交给 ContinuousView 定位到帧内精确位置
    if (flow === 'continuous' && initialProgress.scrollOffset != null) {
      setScrollRestore({ pageIndex: clamped, offset: initialProgress.scrollOffset })
    } else {
      setScrollRestore(null)
    }
  }, [initialProgress, loading, currentGid, totalPages, setCurrentPage, flow])

  const scheduleSave = useCallback(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      if (progressRestoredRef.current === currentGid)
        saveProgress(currentGid, currentPage, isPaged ? null : offsetRef.current)
    }, 2000)
  }, [currentGid, currentPage, saveProgress, isPaged])

  // 滚动跟踪：页码变化（带偏移）→ 更新 ref + 防抖保存
  const handlePageChange = useCallback((idx, offset) => {
    if (offset != null) offsetRef.current = offset
    setCurrentPage(idx)
    if (progressRestoredRef.current === currentGid) scheduleSave()
  }, [setCurrentPage, currentGid, scheduleSave])

  // 同页滚动：只更新偏移 + 防抖保存（页码不变时不重设 currentPage）
  const handleOffsetChange = useCallback((offset) => {
    offsetRef.current = offset
    if (progressRestoredRef.current === currentGid) scheduleSave()
  }, [currentGid, scheduleSave])

  // 翻页时自动保存进度（2秒防抖）
  useEffect(() => {
    // 恢复完成前不保存：避免把上一部的页码写进本作品的进度
    if (progressRestoredRef.current !== currentGid) return
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => saveProgress(currentGid, currentPage, isPaged ? null : offsetRef.current), 2000)
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current) }
  }, [currentPage, currentGid, saveProgress, isPaged])

  // ── 键盘（主轴键=阅读主操作，交叉轴键=作品导航） ──
  useEffect(() => {
    const scroller = () => scrollerRef.current
    const scrollBy = (dx, dy) => {
      const el = scroller()
      if (el) { el.scrollLeft += dx; el.scrollTop += dy }
    }
    // 交叉轴键在放大平移需要时优先平移，作品导航退位（见交互模型文档 §4）
    const crossAxis = (key, prev, next) => (e) => {
      e.preventDefault()
      const el = scroller()
      const canPanX = el && el.scrollWidth > el.clientWidth
      const canPanY = el && el.scrollHeight > el.clientHeight
      if (key === 'ArrowLeft' && canPanX) { el.scrollLeft -= 300; return }
      if (key === 'ArrowRight' && canPanX) { el.scrollLeft += 300; return }
      if (key === 'ArrowUp' && canPanY) { el.scrollTop -= 300; return }
      if (key === 'ArrowDown' && canPanY) { el.scrollTop += 300; return }
      if (key === 'ArrowLeft' || key === 'ArrowUp') prev()
      else next()
    }
    const onKey = (e) => {
      if (e.ctrlKey || e.metaKey) {
        if (e.key === '=' || e.key === '+') { e.preventDefault(); zoomIn(); }
        else if (e.key === '-') { e.preventDefault(); zoomOut(); }
        else if (e.key === 'ArrowLeft') { e.preventDefault(); goFirst(); }   // Ctrl+← 第一页
        else if (e.key === 'ArrowRight') { e.preventDefault(); goLast(); }   // Ctrl+→ 尾页
        return
      }
      // 主轴键：paged → 翻页；scroll → 滚动
      if (isVertical) {
        if (e.key === 'ArrowUp') { e.preventDefault(); if (isPaged) goBack(); else scrollBy(0, -300); return }
        if (e.key === 'ArrowDown') { e.preventDefault(); if (isPaged) goForward(); else scrollBy(0, 300); return }
        if (e.key === 'ArrowLeft') { crossAxis('ArrowLeft', goPrevGallery, goNextGallery)(e); return }
        if (e.key === 'ArrowRight') { crossAxis('ArrowRight', goPrevGallery, goNextGallery)(e); return }
      } else {
        if (e.key === 'ArrowLeft') {
          e.preventDefault()
          if (isPaged) { if (readingOrder === 'rtl') goForward(); else goBack() }
          else scrollBy(readingOrder === 'rtl' ? 300 : -300, 0)   // RTL 行反转下 scrollLeft 增大=向后读
          return
        }
        if (e.key === 'ArrowRight') {
          e.preventDefault()
          if (isPaged) { if (readingOrder === 'rtl') goBack(); else goForward() }
          else scrollBy(readingOrder === 'rtl' ? -300 : 300, 0)
          return
        }
        if (e.key === 'ArrowUp') { crossAxis('ArrowUp', goPrevGallery, goNextGallery)(e); return }
        if (e.key === 'ArrowDown') { crossAxis('ArrowDown', goPrevGallery, goNextGallery)(e); return }
      }
      // PgUp/PgDn：全模式作品导航别名
      if (e.key === 'PageUp')   { e.preventDefault(); goPrevGallery(); return }
      if (e.key === 'PageDown') { e.preventDefault(); goNextGallery(); return }
      // 自动阅读速率：[ = 减慢，] = 加快（翻页间隔 1-60s / 滚动速度 20-1600px/s）
      if (e.key === '[' || e.key === ']') {
        if (!slideshowActive) return
        e.preventDefault()
        const faster = e.key === ']'
        if (isPaged) {
          setSlideshowInterval(v => Math.min(60, Math.max(1, v + (faster ? -1 : 1))))
        } else {
          setScrollSpeed(v => Math.min(1600, Math.max(20, v + (faster ? 10 : -10))))
        }
        return
      }
      if (e.key === 'Home') { e.preventDefault(); goFirst(); return }
      if (e.key === 'End')  { e.preventDefault(); goLast(); return }
      if (e.key === 'Tab') { e.preventDefault(); setUiVisible(v => !v) }
      if (e.key === ' ')   { e.preventDefault(); toggleSlideshow() }
      if (e.key === 'Escape') {
        e.preventDefault()
        handleBack()
      }
      if (e.key === '0') zoomReset()
      if (e.key === 'f' || e.key === 'F') setFlow(f => f === 'paginated' ? 'continuous' : 'paginated')
      if (e.key === 'd' || e.key === 'D') setDirection(d => d === 'horizontal' ? 'vertical' : 'horizontal')
      if (e.key === '?' || e.key === 'h' || e.key === 'H') { e.preventDefault(); setShowHelp(s => !s) }
      
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [goForward, goBack, goFirst, goLast, flow, direction, zoomIn, zoomOut, zoomReset, toggleSlideshow,
    setUiVisible, setFlow, setDirection, scrollerRef, goPrevGallery, goNextGallery, handleBack,
    isVertical, isPaged, readingOrder, slideshowActive, setSlideshowInterval, setScrollSpeed,
    currentPage, currentGid, saveProgress])

  // ── 自动阅读：连续模式下任何手动操作（滚轮/点击/方向键）立即暂停 ──
  useEffect(() => {
    if (!(slideshowActive && flow === 'continuous')) return
    const pause = () => setSlideshowActive(false)
    const onKey = (e) => { if (e.key.startsWith('Arrow')) pause() }
    window.addEventListener('wheel', pause, { passive: true })
    window.addEventListener('pointerdown', pause)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('wheel', pause)
      window.removeEventListener('pointerdown', pause)
      window.removeEventListener('keydown', onKey)
    }
  }, [slideshowActive, flow, setSlideshowActive])

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
    <div ref={rootRef} className="r-root" style={{ background: bgValue }}
      onClick={(e) => {
        if (e.target.closest('.r-hud') || e.target.closest('.r-bar') || e.target.closest('.r-flip-area')) return
        handleCanvasClick()
      }}
      onWheel={handleWheel}>
      <ReaderToolbar
        uiVisible={uiVisible} showThumbs={showThumbs}
        title={title} currentPage={currentPage} totalPages={totalPages}
        direction={direction} flow={flow} fit={fit} zoom={zoom}
        readingOrder={readingOrder}
        background={background} padding={padding}
        slideshowActive={slideshowActive} slideshowInterval={slideshowInterval}
        setUiVisible={setUiVisible} setShowThumbs={setShowThumbs}
        setDirection={setDirection} setFlow={setFlow} setReadingOrder={setReadingOrder}
        setBgCycled={setBgCycled} setPadding={setPadding} setFitCycled={setFitCycled}
        zoomIn={zoomIn} zoomOut={zoomOut} zoomReset={zoomReset}
        toggleSlideshow={toggleSlideshow} setSlideshowInterval={setSlideshowInterval}
        scrollSpeed={scrollSpeed} setScrollSpeed={setScrollSpeed}
        goForward={goForward} goBack={goBack}
        onPrevGallery={goPrevGallery} onNextGallery={goNextGallery}
        canPrevGallery={currentIdx > 0}
        canNextGallery={currentIdx >= 0 && currentIdx < galleryList.length - 1}
        images={pages} pageStep={pageStep} setCurrentPage={setCurrentPage}
        onBack={handleBack}
        showHelp={showHelp} onToggleHelp={() => setShowHelp(s => !s)}
      />
      {flow === 'paginated' ? (
        <PaginatedView key={`paginated-${totalPages}`}
          images={pages} currentPage={currentPage}
          totalPages={totalPages}
          flipDirRef={flipDirRef} viewport={viewport} padding={padding}
          direction={direction} readingOrder={readingOrder} fit={fit} zoom={zoom}
          goForward={goForward} goBack={goBack}
          onPrevGallery={goPrevGallery} onNextGallery={goNextGallery}
          setUiVisible={setUiVisible} uiVisible={uiVisible}
        />
      ) : (
        <ContinuousView key={`continuous-${totalPages}`}
          images={pages} direction={direction} fit={fit} zoom={zoom}
          readingOrder={readingOrder}
          padding={padding} viewport={viewport} scrollerRef={scrollerRef}
          currentPage={currentPage} onPageChange={handlePageChange} onOffsetChange={handleOffsetChange}
          scrollRestore={scrollRestore} onRestoreApplied={() => setScrollRestore(null)}
          uiVisible={uiVisible} setUiVisible={setUiVisible}
        />
      )}

      {/* 作品边界提示 */}
      {edgeHint && <div className="r-edge-hint">{edgeHint}</div>}

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
                ...(isVertical
                  ? [['↑ / ↓', isPaged ? '上一页 / 下一页' : '向上 / 向下滚动']]
                  : [['← / →', isPaged
                    ? (readingOrder === 'rtl' ? '下一页 / 上一页' : '上一页 / 下一页')
                    : (readingOrder === 'rtl' ? '向前 / 向后滚动' : '向左 / 向右滚动')]]),
                ...(isVertical
                  ? [['← / →', '上一部 / 下一部作品']]
                  : [['↑ / ↓', '上一部 / 下一部作品']]),
                ['PageUp / PageDown', '上 / 下一部作品'],
                ['Home / End', '第一页 / 最后一页'], ['空格', '幻灯片 / 自动滚动'],
                ['[ / ]', '自动阅读时 减慢 / 加快'],
                ['Tab', '显示 / 隐藏界面'], ['F', '翻页 / 滚动模式'],
                ['D', '纵向 / 横向'], ['0', '重置缩放'],
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
