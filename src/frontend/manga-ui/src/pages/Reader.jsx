import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { API_BASE } from '../api'
import { useReaderSettings } from '../useReaderSettings'

// 阅读方向
const DIRECTIONS = [
  { key: 'ltr', label: '左→右', icon: '→' },
  { key: 'rtl', label: '右→左', icon: '←' },
]

// 缩放模式
const FIT_MODES = [
  { key: 'fit-width', label: '适应宽度', icon: '↔' },
  { key: 'fit-height', label: '适应高度', icon: '↕' },
  { key: 'fit-both', label: '适应页面', icon: '⊡' },
  { key: 'original', label: '原始大小', icon: '1:1' },
]

// 翻页效果
const TRANSITIONS = [
  { key: 'fade', label: '淡入淡出', icon: '🌫' },
  { key: 'slide', label: '滑动', icon: '⇢' },
  { key: 'none', label: '无效果', icon: '▯' },
]

// 阅读模式
const READ_MODES = [
  { key: 'paged', label: '翻页', icon: '📖' },
  { key: 'scroll', label: '滚动', icon: '📜' },
]

// ==================== 图片懒加载 Hook ====================
function useLazyImage(src) {
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState(false)
  const imgRef = useRef(null)

  useEffect(() => {
    setLoaded(false)
    setError(false)
    const img = new Image()
    imgRef.current = img
    img.onload = () => setLoaded(true)
    img.onerror = () => setError(true)
    img.src = src
    return () => { img.onload = null; img.onerror = null }
  }, [src])

  return { loaded, error }
}

// ==================== 单页渲染组件 ====================
function PageImage({ src, fitMode, fitPercent, transition, current, index, direction, onLoad, onError, scrollMode }) {
  const { loaded, error } = useLazyImage(src)

  useEffect(() => { if (loaded) onLoad?.() }, [loaded])
  useEffect(() => { if (error) onError?.() }, [error])

  const isCurrent = index === current

  let transitionClass = ''
  if (!scrollMode && transition === 'fade') {
    transitionClass = isCurrent ? 'page-fade-in' : 'page-hidden'
  } else if (!scrollMode && transition === 'slide') {
    if (index === current) transitionClass = 'page-slide-center'
    else if (index < current) transitionClass = direction === 'rtl' ? 'page-slide-right' : 'page-slide-left'
    else transitionClass = direction === 'rtl' ? 'page-slide-left' : 'page-slide-right'
  } else if (!scrollMode) {
    transitionClass = isCurrent ? '' : 'page-hidden'
  }

  // 根据 fitMode + fitPercent 计算 inline style
  const pct = (fitPercent ?? 100) / 100
  let imgStyle = { display: 'block' }
  let slotJustify = 'center', slotAlign = 'center'
  if (fitMode === 'fit-width') {
    imgStyle = { ...imgStyle, width: `${pct * 100}%`, height: 'auto', margin: '0 auto' }
    slotJustify = 'center'; slotAlign = 'flex-start'
  } else if (fitMode === 'fit-height') {
    const hRef = scrollMode ? '100vh' : '100%'
    imgStyle = { ...imgStyle, width: 'auto', height: hRef, margin: '0 auto' }
    slotJustify = 'center'; slotAlign = 'center'
  } else if (fitMode === 'fit-both') {
    imgStyle = { ...imgStyle, maxWidth: `${pct * 100}%`, maxHeight: scrollMode ? '100vh' : '100%', width: 'auto', height: 'auto', margin: '0 auto' }
    slotJustify = 'center'; slotAlign = 'center'
  } else if (fitMode === 'original') {
    imgStyle = { ...imgStyle, width: 'auto', height: 'auto', margin: '0 auto' }
    slotJustify = 'center'; slotAlign = 'flex-start'
  }

  // 滚动模式用普通 div（自然流式），翻页模式用绝对定位
  const slotClass = scrollMode ? 'reader-page-slot-scroll' : `reader-page-slot ${transitionClass}`

  return (
    <div className={slotClass}
      style={{ alignItems: slotAlign, justifyContent: slotJustify }}>
      {!loaded && !error && (
        <div className="reader-page-loading"><div className="reader-spinner" /></div>
      )}
      {error && (
        <div className="reader-page-error">加载失败</div>
      )}
      {loaded && (
        <img
          src={src}
          alt={`第 ${index + 1} 页`}
          draggable={false}
          style={imgStyle}
          onLoad={() => onLoad?.()}
        />
      )}
    </div>
  )
}

// ==================== 主组件 ====================
export default function Reader() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [pages, setPages] = useState([])
  const [current, setCurrent] = useState(0)
  const [loading, setLoading] = useState(true)
  const [mangaTitle, setMangaTitle] = useState('')

  // 使用数据库持久化的阅读器设置
  const { settings, updateSetting } = useReaderSettings()
  const { fitMode, fitPercent, direction, transition, readMode, slideInterval, scrollSpeed, loopMode } = settings

  // UI 显示控制
  const [showUI, setShowUI] = useState(true)
  const hideTimerRef = useRef(null)

  // 幻灯片
  const [slideshow, setSlideshow] = useState(false)
  const [isHovering, setIsHovering] = useState(false)
  const timerRef = useRef(null)
  const animFrameRef = useRef(null)

  // 缩略图导航
  const [showThumbnails, setShowThumbnails] = useState(false)
  const thumbRef = useRef(null)

  // 快捷键提示
  const [showHelp, setShowHelp] = useState(false)
  const helpTimerRef = useRef(null)

  useEffect(() => {
    if (!showHelp) return
    if (helpTimerRef.current) clearTimeout(helpTimerRef.current)
    helpTimerRef.current = setTimeout(() => setShowHelp(false), 4000)
    return () => { if (helpTimerRef.current) clearTimeout(helpTimerRef.current) }
  }, [showHelp])

  // 滚动模式
  const scrollContainerRef = useRef(null)
  const [visibleRange, setVisibleRange] = useState({ start: 0, end: 10 })
  const [imgLoading, setImgLoading] = useState(true)
  const loadedPagesRef = useRef(new Set())
  const pageRefsRef = useRef([])  // 跟踪每张图片的 DOM 元素
  const [scrollProgress, setScrollProgress] = useState(0)  // 滚动进度百分比

  // 保存设置
  // 使用 updateSetting 替代 localStorage
  const saveSetting = useCallback((key, value) => updateSetting(key, value), [updateSetting])

  useEffect(() => {
    fetch(`${API_BASE}/api/manga/${id}`)
      .then(r => r.json()).then(d => { if (d.data) setMangaTitle(d.data.title) }).catch(() => { })

    fetch(`${API_BASE}/api/reader/manga/${id}/pages`)
      .then(r => r.json()).then(d => {
        if (d.data && d.data.length > 0) {
          setPages(d.data)
          setCurrent(0)
        }
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [id])

  // 预加载相邻图片
  const preloadedRef = useRef(new Set())
  useEffect(() => {
    if (pages.length === 0) return
    const toPreload = [current - 2, current - 1, current, current + 1, current + 2]
      .filter(i => i >= 0 && i < pages.length && !preloadedRef.current.has(i))
    toPreload.forEach(i => {
      preloadedRef.current.add(i)
      const img = new Image()
      img.src = `${API_BASE}${pages[i]?.url}`
    })
  }, [current, pages])

  // 幻灯片 - ref 避免闭包过期
  const loopModeRef = useRef(loopMode)
  const readModeSlideshowRef = useRef(readMode)
  const scrollSpeedRef = useRef(scrollSpeed)
  useEffect(() => { loopModeRef.current = loopMode }, [loopMode])
  useEffect(() => { readModeSlideshowRef.current = readMode }, [readMode])
  useEffect(() => { scrollSpeedRef.current = scrollSpeed }, [scrollSpeed])

  useEffect(() => {
    // 清理旧定时器
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
    if (animFrameRef.current) { cancelAnimationFrame(animFrameRef.current); animFrameRef.current = null }
    if (!slideshow || isHovering || pages.length === 0) return

    const mode = readModeSlideshowRef.current
    console.log('[Slideshow] start, mode:', mode, 'isHovering:', isHovering)

    if (mode === 'scroll') {
      let lastTime = performance.now()
      let frameCount = 0
      const animate = (now) => {
        const container = scrollContainerRef.current
        if (!container) {
          frameCount++
          if (frameCount < 60) animFrameRef.current = requestAnimationFrame(animate)
          else console.log('[Slideshow] scroll container not found after 60 frames')
          return
        }
        if (frameCount === 0) console.log('[Slideshow] scroll container found, scrollHeight:', container.scrollHeight)
        const dt = Math.min((now - lastTime) / 1000, 0.1) // 防止大跳帧
        lastTime = now
        const px = scrollSpeedRef.current * dt
        container.scrollTop += px
        const maxTop = container.scrollHeight - container.clientHeight
        if (container.scrollTop >= maxTop - 2) {
          if (loopModeRef.current) container.scrollTop = 0
        }
        animFrameRef.current = requestAnimationFrame(animate)
      }
      animFrameRef.current = requestAnimationFrame(animate)
    } else {
      timerRef.current = setInterval(() => {
        setCurrent(prev => {
          const next = prev + 1
          if (next >= pages.length) return loopModeRef.current ? 0 : prev
          setImgLoading(true)
          return next
        })
      }, slideInterval * 1000)
    }
    return () => {
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
      if (animFrameRef.current) { cancelAnimationFrame(animFrameRef.current); animFrameRef.current = null }
    }
  }, [slideshow, isHovering, slideInterval, pages.length, readMode])

  // 沉浸模式：3秒无鼠标移动隐藏 UI（滚动模式下不受页码变化影响）
  const resetHideTimer = useCallback(() => {
    setShowUI(true)
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
    hideTimerRef.current = setTimeout(() => setShowUI(false), 3000)
  }, [])
  useEffect(() => {
    return () => { if (hideTimerRef.current) clearTimeout(hideTimerRef.current) }
  }, [])

  const goTo = useCallback((delta) => {
    setCurrent(prev => {
      // delta: +1 = 上一页, -1 = 下一页（在 RTL 阅读方向下）
      // direction='rtl': 反转 delta；direction='ltr': 保持 delta
      const d = direction === 'rtl' ? -delta : delta
      const next = prev + d
      if (next < 0) {
        return loopMode ? pages.length - 1 : prev
      }
      if (next >= pages.length) {
        return loopMode ? 0 : prev
      }
      setImgLoading(true)
      return next
    })
  }, [pages.length, loopMode, direction])

  const jumpTo = useCallback((index) => {
    if (index >= 0 && index < pages.length && index !== current) {
      setCurrent(index)
      setImgLoading(true)
      setShowThumbnails(false)
    }
  }, [pages.length, current])

  // 用 ref 保存最新函数引用，避免键盘事件闭包过期
  const goToRef = useRef(goTo)
  const cycleFitModeRef = useRef(cycleFitMode)
  const toggleReadModeRef = useRef(toggleReadMode)
  const showUIWithTimerRef = useRef(resetHideTimer)
  const showThumbnailsRef = useRef(showThumbnails)
  const readModeRef = useRef(readMode)
  useEffect(() => { goToRef.current = goTo }, [goTo])
  useEffect(() => { cycleFitModeRef.current = cycleFitMode }, [cycleFitMode])
  useEffect(() => { toggleReadModeRef.current = toggleReadMode }, [toggleReadMode])
  useEffect(() => { showUIWithTimerRef.current = resetHideTimer }, [resetHideTimer])
  useEffect(() => { showThumbnailsRef.current = showThumbnails }, [showThumbnails])
  useEffect(() => { readModeRef.current = readMode }, [readMode])

  // 键盘
  useEffect(() => {
    const handler = (e) => {
      // 忽略在 input/select/textarea 中的按键
      const tag = e.target.tagName
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return

      if (e.key === 'ArrowLeft' || e.key === 'a') { e.preventDefault(); goToRef.current(1) }
      else if (e.key === 'ArrowRight' || e.key === 'd') { e.preventDefault(); goToRef.current(-1) }
      else if (e.key === 'Escape') {
        if (showThumbnailsRef.current) { setShowThumbnails(false); return }
        navigate(`/manga/${id}`)
      }
      else if (e.key === ' ') { e.preventDefault(); setSlideshow(s => !s) }
      else if (e.key === 't' || e.key === 'T') { e.preventDefault(); setShowThumbnails(s => !s) }
      else if (e.key === 'f' || e.key === 'F') { e.preventDefault(); cycleFitModeRef.current() }
      else if (e.key === 'm' || e.key === 'M') { e.preventDefault(); toggleReadModeRef.current() }
      else if (e.key === '?' || e.key === 'h' || e.key === 'H') { e.preventDefault(); setShowHelp(s => !s) }
    }
    window.addEventListener('keydown', handler)

    let touchStartX = 0, touchStartY = 0
    const touchStart = (e) => { touchStartX = e.touches[0].clientX; touchStartY = e.touches[0].clientY }
    const touchEnd = (e) => {
      const dx = touchStartX - e.changedTouches[0].clientX
      const dy = touchStartY - e.changedTouches[0].clientY
      if (readModeRef.current === 'paged') {
        if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 40) {
          goToRef.current(dx > 0 ? 1 : -1)
        } else if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 50) {
          if (dy > 0) setShowUI(false)
          else showUIWithTimerRef.current()
        }
      }
    }
    window.addEventListener('touchstart', touchStart, { passive: true })
    window.addEventListener('touchend', touchEnd, { passive: true })

    return () => {
      window.removeEventListener('keydown', handler)
      window.removeEventListener('touchstart', touchStart)
      window.removeEventListener('touchend', touchEnd)
    }
  }, [])  // 只注册一次，通过 ref 获取最新引用

  // 缩放模式切换 - 立即刷新
  const setFitModeAndSave = useCallback((mode) => {
    updateSetting('fitMode', mode)
    requestAnimationFrame(() => window.dispatchEvent(new Event('resize')))
  }, [updateSetting])

  const cycleFitMode = () => {
    const modes = FIT_MODES.map(m => m.key)
    const idx = modes.indexOf(fitMode)
    setFitModeAndSave(modes[(idx + 1) % modes.length])
  }

  const setTransitionAndSave = useCallback((t) => updateSetting('transition', t), [updateSetting])

  const toggleReadMode = useCallback(() => {
    const next = readMode === 'paged' ? 'scroll' : 'paged'
    updateSetting('readMode', next)
  }, [readMode, updateSetting])

  // 辅助：估算一页的高度
  const estimatePageHeight = useCallback(() => window.innerHeight * 0.95, [])

  // 滚动模式 - 用实际图片 DOM 位置精确计算页码
  const handleScroll = useCallback(() => {
    if (readMode !== 'scroll') return
    const container = scrollContainerRef.current
    if (!container) return
    const scrollTop = container.scrollTop
    const containerHeight = container.clientHeight
    const viewCenter = scrollTop + containerHeight / 2

    // 根据每张图片的实际 DOM 位置计算当前页码
    const refs = pageRefsRef.current
    let currentIdx = 0
    for (let i = 0; i < refs.length; i++) {
      const el = refs[i]
      if (el) {
        const rect = el.getBoundingClientRect()
        const elTop = rect.top + scrollTop - container.offsetTop
        const elBottom = elTop + rect.height
        if (viewCenter >= elTop && viewCenter < elBottom) {
          currentIdx = i; break
        }
        if (i < refs.length - 1) {
          const nextEl = refs[i + 1]
          if (nextEl) {
            const nextRect = nextEl.getBoundingClientRect()
            const nextTop = nextRect.top + scrollTop - container.offsetTop
            if (viewCenter >= elBottom && viewCenter < nextTop) {
              currentIdx = (viewCenter - elBottom < nextTop - viewCenter) ? i : i + 1
              break
            }
          }
        }
      }
    }
    if (scrollTop + containerHeight >= container.scrollHeight - 2) {
      currentIdx = pages.length - 1
    }

    // 可见范围（懒加载）
    const bufferPx = containerHeight * 3
    const viewTop = scrollTop - bufferPx
    const viewBottom = scrollTop + containerHeight + bufferPx
    let start = 0, end = pages.length - 1
    for (let i = 0; i < refs.length; i++) {
      const el = refs[i]
      if (el) {
        const rect = el.getBoundingClientRect()
        const elTop = rect.top + scrollTop - container.offsetTop
        const elBottom = elTop + rect.height
        if (elBottom >= viewTop && elTop <= viewBottom) {
          if (start === 0) start = i
          end = i
        }
      }
    }
    setVisibleRange({ start, end })
    for (let i = start; i <= end; i++) loadedPagesRef.current.add(i)
    setCurrent(currentIdx)
    // 同步滚动进度
    const maxScroll = container.scrollHeight - containerHeight
    setScrollProgress(maxScroll > 0 ? (scrollTop / maxScroll * 100) : 0)
  }, [readMode, pages.length])

  useEffect(() => {
    if (readMode !== 'scroll') return
    const container = scrollContainerRef.current
    if (!container) return
    container.addEventListener('scroll', handleScroll, { passive: true })
    handleScroll()
    return () => container.removeEventListener('scroll', handleScroll)
  }, [readMode, pages.length, handleScroll])

  // 切换到滚动模式时重置加载状态
  useEffect(() => {
    if (readMode === 'scroll') {
      loadedPagesRef.current = new Set()
    }
  }, [readMode])

  if (loading) return <div className="reader-loading"><div className="reader-spinner" /><span>加载中...</span></div>
  if (pages.length === 0) return <div className="reader-error"><p>无图片内容</p><Link to={`/manga/${id}`}>返回详情</Link></div>

  const progress = readMode === 'scroll'
    ? scrollProgress.toFixed(0)
    : ((current + 1) / pages.length * 100).toFixed(0)

  // 进度条点击：滚动模式用实际滚动位置，翻页模式用页码
  const handleProgressClick = (e) => {
    if (readMode === 'scroll') {
      const c = scrollContainerRef.current
      if (!c) return
      const rect = e.currentTarget.getBoundingClientRect()
      const pct = (e.clientX - rect.left) / rect.width
      c.scrollTop = pct * (c.scrollHeight - c.clientHeight)
    } else {
      const rect = e.currentTarget.getBoundingClientRect()
      jumpTo(Math.floor((e.clientX - rect.left) / rect.width * pages.length))
    }
  }

  // ==================== 滚动模式渲染（自然流式布局） ====================
  const renderScrollMode = () => {
    return (
      <div className="reader-scroll-container" ref={scrollContainerRef} onMouseMove={resetHideTimer}>
        {pages.map((p, i) => {
          const shouldLoad = loadedPagesRef.current.has(i)
          return (
            <div key={i} className="reader-scroll-page"
              ref={el => { pageRefsRef.current[i] = el }}>
                {shouldLoad ? (
                  <PageImage
                    src={`${API_BASE}${p.url}`}
                    fitMode={fitMode}
                    fitPercent={fitPercent}
                    transition="none"
                    current={current}
                    index={i}
                    direction={direction}
                    scrollMode={true}
                  />
                ) : (
                <div className="reader-scroll-placeholder" style={{ height: window.innerHeight * 0.95 }} />
              )}
            </div>
          )
        })}
      </div>
    )
  }

  // ==================== 翻页模式渲染 ====================
  const renderPagedMode = () => {
    const safePage = pages[current]
    const imgUrl = safePage ? `${API_BASE}${safePage.url}` : ''
    const prevPage = pages[current - 1]
    const nextPage = pages[current + 1]
    return (
      <div
        className="reader-image-area"
        onMouseEnter={() => setIsHovering(true)}
        onMouseLeave={() => setIsHovering(false)}
        onMouseMove={resetHideTimer}>
        {/* 翻页热区 */}
        <div className="reader-hotzone reader-hotzone-left" onClick={e => { e.stopPropagation(); goTo(1) }} />
        <div className="reader-hotzone reader-hotzone-right" onClick={e => { e.stopPropagation(); goTo(-1) }} />

        {/* 悬浮暂停提示 */}
        {slideshow && isHovering && (
          <div className="reader-hover-hint">⏸ 悬停暂停</div>
        )}

        {/* 翻页效果 */}
        <div className="reader-transition-wrapper">
          {transition === 'slide' && (
            <>
              {prevPage && (
                <PageImage
                  src={`${API_BASE}${prevPage.url}`}
                  fitMode={fitMode}
                  fitPercent={fitPercent}
                  transition={transition}
                  current={current}
                  index={current - 1}
                  direction={direction}
                  key={`prev-${current}`}
                />
              )}
              {imgUrl && (
                <PageImage
                  src={imgUrl}
                  fitMode={fitMode}
                  fitPercent={fitPercent}
                  transition={transition}
                  current={current}
                  index={current}
                  direction={direction}
                  key={`curr-${current}`}
                  onLoad={() => setImgLoading(false)}
                  onError={() => setImgLoading(false)}
                />
              )}
              {nextPage && (
                <PageImage
                  src={`${API_BASE}${nextPage.url}`}
                  fitMode={fitMode}
                  fitPercent={fitPercent}
                  transition={transition}
                  current={current}
                  index={current + 1}
                  direction={direction}
                  key={`next-${current}`}
                />
              )}
            </>
          )}
          {transition !== 'slide' && imgUrl && (
            <PageImage
              src={imgUrl}
              fitMode={fitMode}
              fitPercent={fitPercent}
              transition={transition}
              current={current}
              index={current}
              direction={direction}
              key={current}
              onLoad={() => setImgLoading(false)}
              onError={() => setImgLoading(false)}
            />
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="reader-root" onClick={resetHideTimer}>
      {/* ===== 顶栏 ===== */}
      <div className={`reader-topbar ${showUI ? '' : 'hidden'}`}>
        <div className="reader-topbar-left">
          <Link to={`/manga/${id}`} className="reader-back-btn">← 返回</Link>
          <span className="reader-title" title={mangaTitle}>{mangaTitle}</span>
        </div>
        <div className="reader-topbar-right" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span className="reader-page-num">{current + 1} / {pages.length}</span>
          <button className="reader-btn" onClick={() => setShowHelp(s => !s)} title="快捷键 (?/H)" style={{ fontSize: '0.7rem', padding: '2px 6px' }}>?</button>
        </div>
      </div>

      {/* ===== 缩略图导航面板 ===== */}
      {showThumbnails && (
        <div className="reader-thumb-panel" ref={thumbRef}>
          <div className="reader-thumb-header">
            <span>缩略图导航 ({pages.length} 页)</span>
            <button onClick={() => setShowThumbnails(false)}>✕</button>
          </div>
          <div className="reader-thumb-grid">
            {pages.map((p, i) => (
              <div key={i}
                className={`reader-thumb-item ${i === current ? 'active' : ''}`}
                onClick={() => jumpTo(i)}>
                <img src={`${API_BASE}${p.url}`} alt={`${i + 1}`} loading="lazy" />
                <span>{i + 1}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ===== 主图区域 ===== */}
      {readMode === 'scroll' ? renderScrollMode() : renderPagedMode()}

      {/* ===== 快捷键帮助面板 ===== */}
      {showHelp && (
        <div className="reader-help-overlay" onClick={() => setShowHelp(false)}>
          <div className="reader-help-panel" onClick={e => e.stopPropagation()}>
            <div className="reader-help-title">⌨ 快捷键</div>
            <div className="reader-help-grid">
              <span className="reader-help-key">← / A</span><span>上一页</span>
              <span className="reader-help-key">→ / D</span><span>下一页</span>
              <span className="reader-help-key">Space</span><span>幻灯片</span>
              <span className="reader-help-key">F</span><span>缩放模式</span>
              <span className="reader-help-key">M</span><span>翻页/滚动</span>
              <span className="reader-help-key">T</span><span>缩略图</span>
              <span className="reader-help-key">? / H</span><span>快捷键</span>
              <span className="reader-help-key">Esc</span><span>返回</span>
            </div>
            <div className="reader-help-hint">点击空白处关闭 · 4秒后自动消失</div>
          </div>
        </div>
      )}

      {/* ===== 底栏控制 ===== */}
      <div className={`reader-bottombar ${showUI ? '' : 'hidden'}`}>
        {/* 进度条 */}
        <div className="reader-progress-track" onClick={handleProgressClick}>
          <div className="reader-progress-fill" style={{ width: `${progress}%` }} />
        </div>

        <div className="reader-controls">
          {/* 左侧 */}
          <div className="reader-controls-left">
            <button className="reader-btn" onClick={() => goTo(1)} disabled={current === 0 && !loopMode}
              title="上一页 (←/A)">◀ 上一页</button>
            <button className="reader-btn" onClick={() => setShowThumbnails(s => !s)}
              title="缩略图 (T)">▦ 缩略图</button>
          </div>

          {/* 中间 */}
          <div className="reader-controls-center">
            <span className="reader-page-indicator">
              {current + 1}<span style={{ color: '#555' }}>/</span>{pages.length}
            </span>
          </div>

          {/* 右侧 */}
          <div className="reader-controls-right">
            {/* 幻灯片 */}
            <button className={`reader-btn ${slideshow ? 'active-slide' : ''}`}
              onClick={() => setSlideshow(s => !s)} title="幻灯片 (空格)">
              {slideshow ? '⏸' : '▶'}
            </button>

            {/* 阅读模式 */}
            <select className="reader-select" value={readMode}
              onChange={e => updateSetting('readMode', e.target.value)}
              title="阅读模式 (M)">
              {READ_MODES.map(m => (
                <option key={m.key} value={m.key}>{m.icon} {m.label}</option>
              ))}
            </select>

            {/* 阅读方向 */}
            <select className="reader-select" value={direction}
              onChange={e => updateSetting('direction', e.target.value)}
              title="阅读方向">
              {DIRECTIONS.map(d => (
                <option key={d.key} value={d.key}>{d.icon} {d.label}</option>
              ))}
            </select>

            {/* 缩放模式 */}
            <select className="reader-select" value={fitMode}
              onChange={e => setFitModeAndSave(e.target.value)} title="缩放模式 (F)">
              {FIT_MODES.map(m => (
                <option key={m.key} value={m.key}>{m.icon} {m.label}</option>
              ))}
            </select>

            {/* 缩放百分比（适应宽度/高度时显示） */}
            {(fitMode === 'fit-width' || fitMode === 'fit-height' || fitMode === 'fit-both') && (
              <input
                type="range"
                min="20" max="100" step="5"
                value={fitPercent}
                onChange={e => updateSetting('fitPercent', Number(e.target.value))}
                title={`缩放: ${fitPercent}%`}
                style={{ width: 60, accentColor: '#a78bfa', cursor: 'pointer', margin: '0 2px' }}
              />
            )}
            <span style={{ color: '#888', fontSize: '0.65rem', minWidth: 32, textAlign: 'center' }}>{fitPercent}%</span>

            {/* 翻页效果 */}
            <select className="reader-select" value={transition}
              onChange={e => setTransitionAndSave(e.target.value)} title="翻页效果">
              {TRANSITIONS.map(t => (
                <option key={t.key} value={t.key}>{t.icon} {t.label}</option>
              ))}
            </select>

            <button className="reader-btn" onClick={() => goTo(-1)} disabled={current >= pages.length - 1 && !loopMode}
              title="下一页 (→/D)">下一页 ▶</button>
          </div>
        </div>
      </div>

      {/* ===== 幻灯片面板 ===== */}
      {slideshow && showUI && (
        <div className="slideshow-panel">
          {readMode === 'scroll' ? (
            <>
              <label>🚀 速度</label>
              <select value={scrollSpeed} onChange={e => updateSetting('scrollSpeed', Number(e.target.value))}>
                {[50, 100, 150, 200, 300, 400, 600].map(v => (
                  <option key={v} value={v}>{v}px/s</option>
                ))}
              </select>
            </>
          ) : (
            <>
              <label>⏱ 间隔</label>
              <select value={slideInterval} onChange={e => updateSetting('slideInterval', Number(e.target.value))}>
                {[1, 2, 3, 5, 8, 10, 15, 20, 30].map(v => (
                  <option key={v} value={v}>{v}秒</option>
                ))}
              </select>
            </>
          )}
          <label>{readMode === 'scroll' ? '📜 滚动' : '📖 翻页'}</label>
          <select value={loopMode ? 'loop' : 'stop'} onChange={e => updateSetting('loopMode', e.target.value === 'loop')}>
            <option value="stop">停止</option>
            <option value="loop">循环</option>
          </select>
        </div>
      )}
    </div>
  )
}
