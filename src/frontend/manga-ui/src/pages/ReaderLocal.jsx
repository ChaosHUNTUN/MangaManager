import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { fetchLocalGalleryPagesAbortable, API_BASE, fetchReadingProgressAbortable, saveReadingProgress } from '../api'
import { useReaderSettings } from '../hooks/useReaderSettings'
import useReaderScroll from '../hooks/useReaderScroll'
import useReaderSlideshow from '../hooks/useReaderSlideshow'
import useReaderKeyboard from '../hooks/useReaderKeyboard'
import PageImage from '../components/PageImage'
import { FIT_MODES, TRANSITIONS, READ_MODES } from '../constants/reader'

export default function ReaderLocal() {
  const { gid } = useParams()
  const navigate = useNavigate()
  const [pages, setPages] = useState([])
  const [index, setIndex] = useState(0)
  const [loading, setLoading] = useState(true)
  // 画廊间导航上下文：完整有序 gid 列表（优先使用异步加载的全量列表，回退到当前页列表）
  const [displayGids, setDisplayGids] = useState([])
  const [gidsTotal, setGidsTotal] = useState(0) // 分页列表的总数（用于显示）
  const [toast, setToast] = useState(null)
  const toastTimerRef = useRef(null)
  useEffect(() => () => { if (toastTimerRef.current) clearTimeout(toastTimerRef.current) }, [])
  const [showUI, setShowUI] = useState(true)
  const hideTimerRef = useRef(null)

  // 阅读进度追踪：记录本次阅读中所有漫画的当前页码
  const progressRef = useRef({})
  const progressSeededRef = useRef(false) // 防止 pages 加载覆盖进度
  const abortRef = useRef(null) // AbortController 用于取消旧的页面加载请求
  const currentGid = parseInt(gid)

  // 沉浸模式：3秒无鼠标移动隐藏 UI
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
      const items = Object.entries(progressRef.current)
        .map(([g, p]) => ({ gid: parseInt(g), pageIndex: p }))
        .filter(item => !Number.isNaN(item.gid))
      if (items.length > 0) {
        const blob = new Blob([JSON.stringify(items)], { type: 'application/json' })
        navigator.sendBeacon(`${API_BASE}/api/readingprogress`, blob)
      }
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [])
  useEffect(() => {
    return () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
      const items = Object.entries(progressRef.current)
        .map(([g, p]) => ({ gid: parseInt(g), pageIndex: p }))
        .filter(item => !Number.isNaN(item.gid))
      if (items.length > 0) {
        try { const blob = new Blob([JSON.stringify(items)], { type: 'application/json' }); navigator.sendBeacon(`${API_BASE}/api/readingprogress`, blob) } catch {}
      }
    }
  }, [])

  // 使用数据库持久化的阅读器设置（必须在依赖它的 Hooks 之前调用）
  const { settings, updateSetting } = useReaderSettings()
  const { fitMode, fitPercent, transition, readMode, slideInterval, scrollSpeed, loopMode } = settings

  // 滚动模式（依赖 readMode → 必须在 settings 之后）
  const { scrollRef, pageRefsRef, visibleRange, loadedPagesRef, scrollProgress, handleScrollRef, setLastIndex } = useReaderScroll({
    readMode, pages, onIndexChange: (idx) => setIndex(idx)
  })

  // 幻灯片（依赖 readMode/scrollRef → 必须在 settings + useReaderScroll 之后）
  const { slideshow, setSlideshow, isHovering, setIsHovering } = useReaderSlideshow({
    pages, readMode, slideInterval, scrollSpeed, loopMode, scrollRef, setIndex
  })

  // 同步 index 到 Hook 供模式切换时保持位置
  useEffect(() => { setLastIndex(index) }, [index, setLastIndex])
  useEffect(() => {
    try {
      // 优先使用完整 gid 列表（后台异步加载的）
      const fullGids = JSON.parse(sessionStorage.getItem('reader-local-full-gids') || 'null')
      if (fullGids && Array.isArray(fullGids) && fullGids.length > 0) {
        setDisplayGids(fullGids)
        setGidsTotal(fullGids.length)
        return
      }
      // 回退：使用当前页 gid 列表
      const ctx = JSON.parse(sessionStorage.getItem('reader-local-context') || 'null')
      if (ctx && Array.isArray(ctx.gids) && ctx.gids.length > 0) {
        setDisplayGids(ctx.gids)
        setGidsTotal(ctx.total || ctx.gids.length)
      }
    } catch { }
  }, [gid])

  // 监听 CustomEvent 接收异步加载的全量 gid 列表
  useEffect(() => {
    const handler = (e) => {
      const fullGids = e.detail
      if (fullGids && Array.isArray(fullGids) && fullGids.length > 0) {
        setDisplayGids(fullGids); setGidsTotal(fullGids.length)
      }
    }
    window.addEventListener('reader-gids-updated', handler)
    return () => window.removeEventListener('reader-gids-updated', handler)
  }, [])

  // 加载当前漫画的阅读进度（只在 gid 变化时请求，取消旧请求）
  useEffect(() => {
    if (Number.isNaN(currentGid)) return
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
    const gidNum = parseInt(gid)
    if (Number.isNaN(gidNum)) return
    if (abortRef.current) abortRef.current.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl

    setLoading(true)
    fetchLocalGalleryPagesAbortable(gidNum, ctrl.signal)
      .then(p => {
        setPages(p)
        if (!progressSeededRef.current) setIndex(0)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [gid])

  const currentIdx = displayGids.indexOf(currentGid)
  const hasPrevGallery = currentIdx > 0
  const hasNextGallery = currentIdx >= 0 && currentIdx < displayGids.length - 1

  const goPrevPage = () => setIndex(i => Math.max(0, i - 1))
  const goNextPage = () => setIndex(i => Math.min(pages.length - 1, i + 1))

  // index 变化时实时更新阅读进度（ref 用于退出时批量保存）
  const saveTimerRef = useRef(null)
  useEffect(() => {
    if (!Number.isNaN(currentGid)) progressRef.current[currentGid] = index
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      const items = Object.entries(progressRef.current)
        .map(([g, p]) => ({ gid: parseInt(g), pageIndex: p }))
        .filter(item => !Number.isNaN(item.gid))
      if (items.length > 0) saveReadingProgress(items)
    }, 2000)
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current) }
  }, [index, currentGid])

  const goPrevGallery = () => {
    if (currentIdx > 0) {
      navigate(`/reader-local/${displayGids[currentIdx - 1]}`)
    } else {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current); setToast('已经是第一部'); toastTimerRef.current = setTimeout(() => setToast(null), 1500)
    }
  }

  const goNextGallery = () => {
    if (currentIdx < displayGids.length - 1) {
      navigate(`/reader-local/${displayGids[currentIdx + 1]}`)
    } else {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current); setToast('已经是最后一部'); toastTimerRef.current = setTimeout(() => setToast(null), 1500)
    }
  }

  const setFitModeAndSave = (m) => { updateSetting('fitMode', m); requestAnimationFrame(() => window.dispatchEvent(new Event('resize'))) }

  // 快捷键帮助 state（必须在 useReaderKeyboard 之前）
  const [showHelp, setShowHelp] = useState(false)

  // 键盘+触摸（必须在所有函数定义之后）
  useReaderKeyboard({
    readMode, fitMode, updateSetting,
    goPrevPage, goNextPage, goPrevGallery, goNextGallery,
    setSlideshow, setShowHelp, resetHideTimer, setShowUI,
    progressRef,
  })
  const helpTimerRef = useRef(null)
  useEffect(() => {
    if (!showHelp) return
    if (helpTimerRef.current) clearTimeout(helpTimerRef.current)
    helpTimerRef.current = setTimeout(() => setShowHelp(false), 4000)
    return () => { if (helpTimerRef.current) clearTimeout(helpTimerRef.current) }
  }, [showHelp])

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
        <button className="btn-sm" onClick={() => { const returnUrl = sessionStorage.getItem('reader-local-return-url') || ''; navigate(`/local${returnUrl}`, { replace: true }) }} style={{ color: '#a78bfa', borderColor: '#7c3aed' }}>← 返回</button>
      </div>
    )
  }

  const handleProgressClick = (e) => {
    if (readMode === 'scroll') {
      const c = scrollRef.current
      if (!c) return
      const rect = e.currentTarget.getBoundingClientRect()
      const pct = (e.clientX - rect.left) / rect.width
      c.scrollTop = pct * (c.scrollHeight - c.clientHeight)
      handleScrollRef.current()
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
          <a href="/local" className="reader-back-btn" onClick={e => {
            e.preventDefault()
            const items = Object.entries(progressRef.current)
              .map(([g, p]) => ({ gid: parseInt(g), pageIndex: p }))
              .filter(item => !Number.isNaN(item.gid))
            if (items.length > 0) saveReadingProgress(items)
            const returnUrl = sessionStorage.getItem('reader-local-return-url') || ''
            navigate(`/local${returnUrl}`, { replace: true })
          }}>← 返回</a>
          <span className="reader-title" style={{ maxWidth: 300 }}>GID {gid}</span>
        </div>
        <div className="reader-topbar-right" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button className="reader-btn" onClick={goPrevGallery} disabled={!hasPrevGallery} title="上一部 (↑)">▲</button>
          <button className="reader-btn" onClick={goNextGallery} disabled={!hasNextGallery} title="下一部 (↓)">▼</button>
          <span className="reader-page-num">{displayGids.length > 0 ? `${currentIdx + 1}/${displayGids.length} 部` : `GID ${gid}`} · {index + 1}/{pages.length} 页</span>
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
              <span className="reader-help-key">↑ / ↓</span><span>上/下一部（翻页模式）</span>
              <span className="reader-help-key">Ctrl+↑ / Ctrl+↓</span><span>上/下一部（所有模式）</span>
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
          <div className="reader-hotzone reader-hotzone-center" onClick={() => { setShowUI(s => { resetHideTimer(); return !s }) }} />
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
    </div>
  )
}