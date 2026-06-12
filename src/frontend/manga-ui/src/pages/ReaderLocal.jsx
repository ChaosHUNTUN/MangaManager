import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { fetchLocalGalleries, fetchLocalGalleryPagesAbortable, API_BASE, fetchReadingProgressAbortable, saveReadingProgress } from '../api'
import { useReaderSettings } from '../useReaderSettings'
import PageImage from '../components/PageImage'

const FIT_MODES = [
  { key: 'fit-width', label: '适应宽度', icon: '↔' },
  { key: 'fit-height', label: '适应高度', icon: '↕' },
  { key: 'fit-both', label: '适应页面', icon: '⊡' },
  { key: 'original', label: '原始大小', icon: '1:1' },
]

const TRANSITIONS = [
  { key: 'fade', label: '淡入淡出', icon: '🌫' },
  { key: 'slide', label: '滑动', icon: '⇢' },
  { key: 'none', label: '无效果', icon: '▯' },
]

const READ_MODES = [
  { key: 'paged', label: '翻页', icon: '📖' },
  { key: 'scroll', label: '滚动', icon: '📜' },
]

export default function ReaderLocal() {
  const { gid } = useParams()
  const navigate = useNavigate()
  const [pages, setPages] = useState([])
  const [index, setIndex] = useState(0)
  const [loading, setLoading] = useState(true)
  const [galleries, setGalleries] = useState([])
  const [toast, setToast] = useState(null)
  const [showUI, setShowUI] = useState(true)
  const hideTimerRef = useRef(null)
  const scrollRef = useRef(null)

  // 阅读进度追踪：记录本次阅读中所有漫画的当前页码
  const progressRef = useRef({})
  const progressSeededRef = useRef(false) // 防止 pages 加载覆盖进度
  const abortRef = useRef(null) // AbortController 用于取消旧的页面加载请求
  const currentGid = parseInt(gid)
  const [visibleRange, setVisibleRange] = useState({ start: 0, end: 10 })
  const loadedPagesRef = useRef(new Set())
  const [scrollProgress, setScrollProgress] = useState(0)

  // 沉浸模式：3秒无鼠标移动隐藏 UI
  // 在滚动模式下，页码变化不应重置计时器（否则长图永远不隐藏）
  const showUIRef = useRef(showUI)
  useEffect(() => { showUIRef.current = showUI }, [showUI])
  const resetHideTimer = useCallback(() => {
    setShowUI(true)
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
    hideTimerRef.current = setTimeout(() => setShowUI(false), 3000)
  }, [])

  // 页面关闭时用 sendBeacon 确保进度保存
  useEffect(() => {
    const handler = () => {
      const items = Object.entries(progressRef.current).map(([g, p]) => ({ gid: parseInt(g), pageIndex: p }))
      if (items.length > 0) {
        navigator.sendBeacon(`${API_BASE}/api/readingprogress`, JSON.stringify(items))
      }
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [])
  useEffect(() => {
    return () => { if (hideTimerRef.current) clearTimeout(hideTimerRef.current) }
  }, [])

  // 使用数据库持久化的阅读器设置
  const { settings, updateSetting } = useReaderSettings()
  const { fitMode, fitPercent, transition, readMode, slideInterval, scrollSpeed, loopMode } = settings

  // 加载画廊列表（模块级缓存，避免每次切换都请求）
  useEffect(() => {
    fetchLocalGalleries().then(list => setGalleries(list)).catch(() => { })
  }, [])

  // 加载当前漫画的阅读进度（只在 gid 变化时请求，取消旧请求）
  useEffect(() => {
    progressSeededRef.current = false
    const ctrl = new AbortController()
    fetchReadingProgressAbortable(currentGid, ctrl.signal).then(savedPage => {
      if (savedPage > 0) {
        progressSeededRef.current = true
        setIndex(savedPage)
      }
    }).catch(() => { })
    return () => ctrl.abort()
  }, [currentGid])

  useEffect(() => {
    // 取消上一次未完成的请求
    if (abortRef.current) abortRef.current.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl

    setLoading(true)
    fetchLocalGalleryPagesAbortable(parseInt(gid), ctrl.signal)
      .then(p => {
        setPages(p)
        if (!progressSeededRef.current) setIndex(0)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [gid])

  // 从 sessionStorage 获取筛选后的 gid 列表（由 LocalGallery 传入）
  const [readerList, setReaderList] = useState(null)
  useEffect(() => {
    try {
      const list = JSON.parse(sessionStorage.getItem('reader-local-list') || 'null')
      if (Array.isArray(list) && list.length > 0) setReaderList(list)
    } catch { }
  }, [gid])

  const currentIdx = readerList ? readerList.indexOf(currentGid) : galleries.findIndex(g => g.gid === currentGid)
  const displayGalleries = readerList || galleries
  const hasPrevGallery = currentIdx > 0
  const hasNextGallery = currentIdx < displayGalleries.length - 1

  const goPrevPage = () => setIndex(i => Math.max(0, i - 1))
  const goNextPage = () => setIndex(i => Math.min(pages.length - 1, i + 1))

  // index 变化时实时更新阅读进度（ref 用于退出时批量保存）
  // 同时 2 秒防抖自动保存，避免退出时丢失
  const saveTimerRef = useRef(null)
  useEffect(() => {
    progressRef.current[currentGid] = index
    // 2 秒防抖自动保存
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      const items = Object.entries(progressRef.current).map(([g, p]) => ({ gid: parseInt(g), pageIndex: p }))
      saveReadingProgress(items)
    }, 2000)
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current) }
  }, [index, currentGid])

  const goPrevGallery = () => {
    if (hasPrevGallery) {
      navigate(`/reader-local/${displayGalleries[currentIdx - 1]}`)
    }
    else { setToast('已经是第一部'); setTimeout(() => setToast(null), 1500) }
  }
  const goNextGallery = () => {
    if (hasNextGallery) {
      navigate(`/reader-local/${displayGalleries[currentIdx + 1]}`)
    }
    else { setToast('已经是最后一部'); setTimeout(() => setToast(null), 1500) }
  }

  const setFitModeAndSave = (m) => { updateSetting('fitMode', m); requestAnimationFrame(() => window.dispatchEvent(new Event('resize'))) }

  // 幻灯片
  const [slideshow, setSlideshow] = useState(false)
  const [isHovering, setIsHovering] = useState(false)
  const timerRef = useRef(null)
  const animFrameRef = useRef(null)

  // 快捷键帮助
  const [showHelp, setShowHelp] = useState(false)
  const helpTimerRef = useRef(null)
  useEffect(() => {
    if (!showHelp) return
    if (helpTimerRef.current) clearTimeout(helpTimerRef.current)
    helpTimerRef.current = setTimeout(() => setShowHelp(false), 4000)
    return () => { if (helpTimerRef.current) clearTimeout(helpTimerRef.current) }
  }, [showHelp])

  // 幻灯片 ref
  const readModeRef2 = useRef(readMode)
  const loopModeRef2 = useRef(loopMode)
  const scrollSpeedRef = useRef(scrollSpeed)
  useEffect(() => { readModeRef2.current = readMode }, [readMode])
  useEffect(() => { loopModeRef2.current = loopMode }, [loopMode])
  useEffect(() => { scrollSpeedRef.current = scrollSpeed }, [scrollSpeed])

  useEffect(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
    if (animFrameRef.current) { cancelAnimationFrame(animFrameRef.current); animFrameRef.current = null }
    if (!slideshow || isHovering || pages.length === 0) return

    console.log('[ReaderLocal Slideshow] start, mode:', readModeRef2.current)

    if (readModeRef2.current === 'scroll') {
      let lastTime = performance.now()
      const animate = (now) => {
        const c = scrollRef.current
        if (!c) { animFrameRef.current = requestAnimationFrame(animate); return }
        const dt = Math.min((now - lastTime) / 1000, 0.1)
        lastTime = now
        c.scrollTop += scrollSpeedRef.current * dt
        const maxTop = c.scrollHeight - c.clientHeight
        if (c.scrollTop >= maxTop - 2) {
          if (loopModeRef2.current) c.scrollTop = 0
        }
        animFrameRef.current = requestAnimationFrame(animate)
      }
      animFrameRef.current = requestAnimationFrame(animate)
    } else {
      timerRef.current = setInterval(() => {
        setIndex(prev => {
          const next = prev + 1
          if (next >= pages.length) return loopModeRef2.current ? 0 : prev
          return next
        })
      }, slideInterval * 1000)
    }
    return () => {
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
      if (animFrameRef.current) { cancelAnimationFrame(animFrameRef.current); animFrameRef.current = null }
    }
  }, [slideshow, isHovering, slideInterval, pages.length, readMode])

  // 键盘
  const fitModeRef = useRef(fitMode)
  const readModeRef3 = useRef(readMode)
  useEffect(() => { fitModeRef.current = fitMode }, [fitMode])
  useEffect(() => { readModeRef3.current = readMode }, [readMode])

  const actionsRef = useRef({ goPrevPage, goNextPage, goPrevGallery, goNextGallery })
  actionsRef.current = { goPrevPage, goNextPage, goPrevGallery, goNextGallery }

  useEffect(() => {
    const handler = (e) => {
      const tag = e.target.tagName
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return

      if (e.key === 'ArrowLeft' || e.key === 'a') { e.preventDefault(); actionsRef.current.goPrevPage() }
      else if (e.key === 'ArrowRight' || e.key === 'd') { e.preventDefault(); actionsRef.current.goNextPage() }
      // 滚动模式下 ArrowUp/Down 不切换画廊（让浏览器默认滚动）
      else if (e.key === 'ArrowUp') {
        if (readModeRef3.current !== 'scroll') { e.preventDefault(); actionsRef.current.goPrevGallery() }
      }
      else if (e.key === 'ArrowDown') {
        if (readModeRef3.current !== 'scroll') { e.preventDefault(); actionsRef.current.goNextGallery() }
      }
      // Ctrl+ArrowUp/Down 在任何模式下切换画廊
      else if (e.ctrlKey && e.key === 'ArrowUp') { e.preventDefault(); actionsRef.current.goPrevGallery() }
      else if (e.ctrlKey && e.key === 'ArrowDown') { e.preventDefault(); actionsRef.current.goNextGallery() }
      else if (e.key === 'Escape') {
        e.preventDefault()
        // 保存所有阅读进度后退出
        const items = Object.entries(progressRef.current).map(([g, p]) => ({ gid: parseInt(g), pageIndex: p }))
        saveReadingProgress(items)
        navigate('/')
      }
      else if (e.key === ' ') { e.preventDefault(); setSlideshow(s => !s) }
      else if (e.key === 't' || e.key === 'T') { e.preventDefault() }
      else if (e.key === 'f' || e.key === 'F') {
        e.preventDefault()
        const modes = FIT_MODES.map(m => m.key)
        const idx = modes.indexOf(fitModeRef.current)
        const next = modes[(idx + 1) % modes.length]
        updateSetting('fitMode', next)
        requestAnimationFrame(() => window.dispatchEvent(new Event('resize')))
      }
      else if (e.key === 'm' || e.key === 'M') {
        e.preventDefault()
        const n = readModeRef3.current === 'paged' ? 'scroll' : 'paged'
        updateSetting('readMode', n)
      }
      else if (e.key === '?' || e.key === 'h' || e.key === 'H') { e.preventDefault(); setShowHelp(s => !s) }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [updateSetting])

  // 滚动模式：存储每张图片 DOM 的 ref，用于精确计算页码
  const pageRefsRef = useRef([])
  const scrollPosRef = useRef({ scrollTop: 0, clientHeight: 0 })

  const handleScroll = useCallback(() => {
    if (readMode !== 'scroll') return
    const c = scrollRef.current; if (!c) return
    const scrollTop = c.scrollTop
    const clientHeight = c.clientHeight
    const viewCenter = scrollTop + clientHeight / 2
    scrollPosRef.current = { scrollTop, clientHeight }

    // 根据每张图片的实际 DOM 位置计算当前页码
    const refs = pageRefsRef.current
    let currentIdx = 0
    for (let i = 0; i < refs.length; i++) {
      const el = refs[i]
      if (el) {
        const rect = el.getBoundingClientRect()
        const elTop = rect.top + scrollTop - c.offsetTop
        const elBottom = elTop + rect.height
        // 视口中心落在该图片范围内
        if (viewCenter >= elTop && viewCenter < elBottom) {
          currentIdx = i
          break
        }
        // 视口中心在图片之间
        if (i < refs.length - 1) {
          const nextEl = refs[i + 1]
          if (nextEl) {
            const nextRect = nextEl.getBoundingClientRect()
            const nextTop = nextRect.top + scrollTop - c.offsetTop
            if (viewCenter >= elBottom && viewCenter < nextTop) {
              // 在两个图片之间，选更近的那个
              currentIdx = (viewCenter - elBottom < nextTop - viewCenter) ? i : i + 1
              break
            }
          }
        }
      }
    }
    // 如果滚动到最底部
    if (scrollTop + clientHeight >= c.scrollHeight - 2) {
      currentIdx = pages.length - 1
    }

    // 计算可见范围（用于懒加载）
    const bufferPx = clientHeight * 3
    const viewTop = scrollTop - bufferPx
    const viewBottom = scrollTop + clientHeight + bufferPx
    let start = 0, end = pages.length - 1
    for (let i = 0; i < refs.length; i++) {
      const el = refs[i]
      if (el) {
        const rect = el.getBoundingClientRect()
        const elTop = rect.top + scrollTop - c.offsetTop
        const elBottom = elTop + rect.height
        if (elBottom >= viewTop && elTop <= viewBottom) {
          if (start === 0) start = i
          end = i
        }
      }
    }
    setVisibleRange({ start, end })
    for (let i = start; i <= end; i++) loadedPagesRef.current.add(i)
    setIndex(currentIdx)
    // 同步滚动进度（用于进度条）
    const maxScroll = c.scrollHeight - clientHeight
    setScrollProgress(maxScroll > 0 ? (scrollTop / maxScroll * 100) : 0)
  }, [readMode, pages.length])

  useEffect(() => {
    if (readMode !== 'scroll') return
    const c = scrollRef.current; if (!c) return
    c.addEventListener('scroll', handleScroll, { passive: true })
    handleScroll()
    return () => c.removeEventListener('scroll', handleScroll)
  }, [readMode, pages.length, handleScroll])

  useEffect(() => {
    if (readMode === 'scroll') loadedPagesRef.current = new Set()
  }, [readMode])

  // 进度条百分比：滚动模式用实际滚动位置，翻页模式用页码
  const progressPct = readMode === 'scroll'
    ? scrollProgress.toFixed(1)
    : ((index + 1) / pages.length * 100).toFixed(1)

  // 预加载相邻页面
  const preloadPages = useMemo(() => {
    const result = []
    for (let d = -3; d <= 3; d++) {
      const idx = index + d
      if (idx !== index && idx >= 0 && idx < pages.length)
        result.push({ idx, url: `${API_BASE}${pages[idx].url}` })
    }
    return result
  }, [index, pages])

  if (loading) {
    return (
      <div style={{ position: 'fixed', inset: 0, background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: '#888' }}>加载中...</div>
      </div>
    )
  }

  if (pages.length === 0) {
    return (
      <div style={{ position: 'fixed', inset: 0, background: '#000', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
        <div style={{ color: '#888' }}>暂无图片</div>
        <Link to="/" className="btn-sm" style={{ textDecoration: 'none', color: '#a78bfa', borderColor: '#7c3aed' }}>← 返回</Link>
      </div>
    )
  }

  // 滚动模式下用实际滚动位置做进度条点击跳转
  const handleProgressClick = (e) => {
    if (readMode === 'scroll') {
      const c = scrollRef.current
      if (!c) return
      const rect = e.currentTarget.getBoundingClientRect()
      const pct = (e.clientX - rect.left) / rect.width
      c.scrollTop = pct * (c.scrollHeight - c.clientHeight)
    } else {
      const rect = e.currentTarget.getBoundingClientRect()
      setIndex(Math.round((e.clientX - rect.left) / rect.width * (pages.length - 1)))
    }
  }

  const safePage = pages[index]
  const imgUrl = safePage ? `${API_BASE}${safePage.url}` : ''

  return (
    <div className="reader-root">
      {toast && (
        <div style={{ position: 'fixed', top: 20, left: '50%', transform: 'translateX(-50%)', zIndex: 300, padding: '10px 24px', borderRadius: 10, background: 'rgba(0,0,0,0.85)', color: '#fbbf24', fontSize: '0.9rem', fontWeight: 600, boxShadow: '0 4px 16px rgba(0,0,0,0.4)', animation: 'toast-in 0.3s ease, toast-out 0.3s ease 1.2s forwards', pointerEvents: 'none' }}>{toast}</div>
      )}

      {/* 顶栏 */}
      <div className={`reader-topbar ${showUI ? '' : 'hidden'}`}>
        <div className="reader-topbar-left">
          <a href="/" className="reader-back-btn" onClick={e => {
            e.preventDefault()
            const items = Object.entries(progressRef.current).map(([g, p]) => ({ gid: parseInt(g), pageIndex: p }))
            saveReadingProgress(items)
            navigate('/')
          }}>← 返回</a>
          <span className="reader-title" style={{ maxWidth: 300 }}>{(readerList ? galleries.find(g => g.gid === currentGid) : galleries[currentIdx])?.title || `GID ${gid}`}</span>
        </div>
        <div className="reader-topbar-right" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button className="reader-btn" onClick={goPrevGallery} disabled={!hasPrevGallery} title="上一部 (↑)">▲</button>
          <button className="reader-btn" onClick={goNextGallery} disabled={!hasNextGallery} title="下一部 (↓)">▼</button>
          <span className="reader-page-num">{currentIdx + 1}/{displayGalleries.length} 部 · {index + 1}/{pages.length} 页</span>
          <button className="reader-btn" onClick={() => setShowHelp(s => !s)} title="快捷键 (?/H)" style={{ fontSize: '0.7rem', padding: '2px 6px' }}>?</button>
        </div>
      </div>

      {/* 底栏 */}
      <div className={`reader-bottombar ${showUI ? '' : 'hidden'}`}>
        <div className="reader-progress-track" onClick={handleProgressClick}>
          <div className="reader-progress-fill" style={{ width: `${progressPct}%` }} />
        </div>
        <div className="reader-controls">
          <div className="reader-controls-left">
            <button className="reader-btn" onClick={goPrevPage} disabled={index <= 0}>◀</button>
          </div>
          <div className="reader-controls-center">
            <span className="reader-page-indicator">{index + 1} / {pages.length}</span>
          </div>
          <div className="reader-controls-right">
            <select className="reader-select" value={readMode} onChange={e => updateSetting('readMode', e.target.value)}>
              {READ_MODES.map(m => <option key={m.key} value={m.key}>{m.icon} {m.label}</option>)}
            </select>
            <select className="reader-select" value={fitMode} onChange={e => setFitModeAndSave(e.target.value)}>
              {FIT_MODES.map(m => <option key={m.key} value={m.key}>{m.icon} {m.label}</option>)}
            </select>
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
            <select className="reader-select" value={transition} onChange={e => updateSetting('transition', e.target.value)}>
              {TRANSITIONS.map(t => <option key={t.key} value={t.key}>{t.icon} {t.label}</option>)}
            </select>
            <button className="reader-btn" onClick={goNextPage} disabled={index >= pages.length - 1}>▶</button>
          </div>
        </div>
      </div>

      {/* 快捷键帮助面板 */}
      {showHelp && (
        <div className="reader-help-overlay" onClick={() => setShowHelp(false)}>
          <div className="reader-help-panel" onClick={e => e.stopPropagation()}>
            <div className="reader-help-title">⌨ 快捷键</div>
            <div className="reader-help-grid">
              <span className="reader-help-key">← / A</span><span>上一页</span>
              <span className="reader-help-key">→ / D</span><span>下一页</span>
              <span className="reader-help-key">Ctrl+↑ / Ctrl+↓</span><span>上/下一部</span>
              <span className="reader-help-key">Space</span><span>幻灯片开关</span>
              <span className="reader-help-key">F</span><span>切换缩放</span>
              <span className="reader-help-key">M</span><span>翻页/滚动模式</span>
              <span className="reader-help-key">? / H</span><span>显示/隐藏帮助</span>
              <span className="reader-help-key">Esc</span><span>返回画廊</span>
            </div>
            <div className="reader-help-hint">点击空白处关闭 · 4秒后自动消失</div>
          </div>
        </div>
      )}

      {/* 幻灯片面板 */}
      {slideshow && showUI && (
        <div className="slideshow-panel">
          {readMode === 'scroll' ? (
            <>
              <label>🚀 速度</label>
              <select value={scrollSpeed} onChange={e => updateSetting('scrollSpeed', Number(e.target.value))}>
                {[50, 100, 150, 200, 300, 400, 600].map(v => <option key={v} value={v}>{v}px/s</option>)}
              </select>
            </>
          ) : (
            <>
              <label>⏱ 间隔</label>
              <select value={slideInterval} onChange={e => updateSetting('slideInterval', Number(e.target.value))}>
                {[1, 2, 3, 5, 8, 10, 15, 20, 30].map(v => <option key={v} value={v}>{v}秒</option>)}
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

      {/* 主内容 */}
      {readMode === 'scroll' ? (
        <div className="reader-scroll-container" ref={scrollRef} onMouseMove={resetHideTimer}>
          {pages.map((p, i) => {
            const shouldLoad = loadedPagesRef.current.has(i)
            return (
              <div key={i} className="reader-scroll-page"
                ref={el => { pageRefsRef.current[i] = el }}>
                {shouldLoad ? (
                  <PageImage src={`${API_BASE}${p.url}`} fitMode={fitMode} fitPercent={fitPercent} transition="none" current={index} index={i} scrollMode={true} />
                ) : (
                  <div className="reader-scroll-placeholder" style={{ height: window.innerHeight * 0.95 }} />
                )}
              </div>
            )
          })}
        </div>
      ) : (
        <>
          <div className="reader-hotzone reader-hotzone-left" onClick={goPrevPage} />
          <div className="reader-hotzone reader-hotzone-right" onClick={goNextPage} />
          <div className="reader-image-area" onMouseMove={resetHideTimer}>
            <div className="reader-transition-wrapper">
              {transition === 'slide' ? (
                <>
                  {pages[index - 1] && (
                    <PageImage src={`${API_BASE}${pages[index - 1].url}`} fitMode={fitMode} fitPercent={fitPercent} transition={transition} current={index} index={index - 1} />
                  )}
                  {imgUrl && (
                    <PageImage src={imgUrl} fitMode={fitMode} fitPercent={fitPercent} transition={transition} current={index} index={index} />
                  )}
                  {pages[index + 1] && (
                    <PageImage src={`${API_BASE}${pages[index + 1].url}`} fitMode={fitMode} fitPercent={fitPercent} transition={transition} current={index} index={index + 1} />
                  )}
                </>
              ) : imgUrl ? (
                <PageImage src={imgUrl} fitMode={fitMode} fitPercent={fitPercent} transition={transition} current={index} index={index} />
              ) : null}
            </div>
          </div>
        </>
      )}

      {/* 预加载 */}
      {preloadPages.map(pp => <link key={pp.idx} rel="preload" as="image" href={pp.url} />)}
      {preloadPages.map(pp => <img key={'pre' + pp.idx} src={pp.url} style={{ display: 'none' }} alt="" />)}
    </div>
  )
}
