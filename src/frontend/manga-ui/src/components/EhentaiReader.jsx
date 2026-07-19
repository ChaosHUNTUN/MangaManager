import { useState, useEffect, useRef } from 'react'
import PageImage from './PageImage'
import { fetchEHGalleryPages, getEHImageProxyUrl, API_BASE } from '../api'

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

/**
 * E-Hentai 在线阅读器（内嵌组件）
 * 支持本地已下载文件 + 远程代理两种模式
 * 
 * Props:
 *   detail   - 画廊详情 { gid, token, title }
 *   onClose  - 关闭阅读器回调
 *   onError  - 错误回调 (message)
 */
export default function EhentaiReader({ detail, onClose, onError }) {
  const [pages, setPages] = useState(null)
  const [index, setIndex] = useState(0)
  const [loading, setLoading] = useState(true)
  const [fitMode, setFitMode] = useState('fit-width')
  const [transition, setTransition] = useState('fade')
  const [readMode, setReadMode] = useState('paged')
  const [showUI, setShowUI] = useState(true)
  const [showHelp, setShowHelp] = useState(false)
  const scrollRef = useRef(null)
  const [visibleRange, setVisibleRange] = useState({ start: 0, end: 20 })

  // 帮助面板 4 秒自动消失
  const helpTimerRef = useRef(null)
  useEffect(() => {
    if (!showHelp) return
    if (helpTimerRef.current) clearTimeout(helpTimerRef.current)
    helpTimerRef.current = setTimeout(() => setShowHelp(false), 4000)
    return () => { if (helpTimerRef.current) clearTimeout(helpTimerRef.current) }
  }, [showHelp])

  // 从 localStorage 恢复阅读设置
  useEffect(() => {
    try {
      const s = JSON.parse(localStorage.getItem('reader-settings') || '{}')
      if (s.fitMode) setFitMode(s.fitMode)
      if (s.transition) setTransition(s.transition)
      if (s.readMode) setReadMode(s.readMode)
    } catch { }
  }, [])

  const saveSetting = (k, v) => {
    try { const s = JSON.parse(localStorage.getItem('reader-settings') || '{}'); s[k] = v; localStorage.setItem('reader-settings', JSON.stringify(s)) } catch { }
  }

  // 加载页面
  useEffect(() => {
    if (!detail) return
    setLoading(true)
    ;(async () => {
      try {
        // 先检查本地是否已下载
        const localResp = await fetch(`${API_BASE}/api/ehentai/gallery/${detail.gid}/local?title=${encodeURIComponent(detail.title)}`)
        const localData = await localResp.json()
        if (localData.data?.downloaded && localData.data?.pages?.length > 0) {
          setPages(localData.data.pages.map((url, i) => ({
            index: i + 1, imageUrl: url, local: true
          })))
        } else {
          const r = await fetchEHGalleryPages(detail.gid, detail.token)
          setPages((r.pages || []).map(p => ({ ...p, local: false })))
        }
        setIndex(0)
      } catch (e) { onError?.(e.message) }
      setLoading(false)
    })()
  }, [detail?.gid])

  // 键盘快捷键
  const actionsRef = useRef({ goPrev: null, goNext: null, close: null })
  useEffect(() => {
    if (!pages) return
    const handler = (e) => {
      if (e.key === 'ArrowLeft' || e.key === 'a') actionsRef.current.goPrev?.()
      else if (e.key === 'ArrowRight' || e.key === 'd') actionsRef.current.goNext?.()
      else if (e.key === 'Escape') actionsRef.current.close?.()
      else if (e.key === 'f' || e.key === 'F') {
        const modes = FIT_MODES.map(m => m.key)
        const idx = modes.indexOf(fitMode)
        const next = modes[(idx + 1) % modes.length]
        setFitMode(next); saveSetting('fitMode', next)
        requestAnimationFrame(() => window.dispatchEvent(new Event('resize')))
      }
      else if (e.key === 'm' || e.key === 'M') {
        setReadMode(p => { const n = p === 'paged' ? 'scroll' : 'paged'; saveSetting('readMode', n); return n })
      }
      else if (e.key === '?' || e.key === 'h' || e.key === 'H') {
        setShowHelp(s => !s)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [!!pages, fitMode])

  // 滚动模式处理
  useEffect(() => {
    if (!pages || readMode !== 'scroll') return
    const c = scrollRef.current; if (!c) return
    const onScroll = () => {
      const pageH = window.innerHeight * 0.95
      const start = Math.max(0, Math.floor(c.scrollTop / pageH) - 2)
      const end = Math.min(pages.length, Math.ceil((c.scrollTop + c.clientHeight) / pageH) + 2)
      setVisibleRange({ start, end })
      setIndex(Math.round(c.scrollTop / pageH))
    }
    c.addEventListener('scroll', onScroll, { passive: true })
    onScroll()
    return () => c.removeEventListener('scroll', onScroll)
  }, [pages, readMode])

  if (loading) {
    return (
      <div style={{ position: 'fixed', inset: 0, background: '#000', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
        <div className="reader-spinner" />
        <div style={{ color: '#888' }}>加载中...</div>
      </div>
    )
  }

  if (!pages || pages.length === 0) {
    return (
      <div style={{ position: 'fixed', inset: 0, background: '#000', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
        <div style={{ color: '#888' }}>暂无图片</div>
        <button className="btn-sm" onClick={onClose} style={{ borderColor: '#7c3aed', color: '#a78bfa' }}>← 返回</button>
      </div>
    )
  }

  const p = pages[index]
  const getImgUrl = (page) => {
    if (!page) return ''
    if (page.local) return page.imageUrl.startsWith('http') ? page.imageUrl : `${API_BASE}${page.imageUrl}`
    return getEHImageProxyUrl(page.imageUrl || '')
  }
  const imgUrl = p ? getImgUrl(p) : null
  const isLocal = p?.local
  const progressPct = ((index + 1) / pages.length * 100).toFixed(1)
  const goPrev = () => setIndex(i => Math.max(0, i - 1))
  const goNext = () => setIndex(i => Math.min(pages.length - 1, i + 1))
  actionsRef.current = { goPrev, goNext, close: onClose }

  // 预加载
  const preloadPages = []
  for (let d = -3; d <= 3; d++) {
    const idx = index + d
    if (idx !== index && idx >= 0 && idx < pages.length) {
      preloadPages.push({ idx, url: getImgUrl(pages[idx]) })
    }
  }

  return (
    <div className="reader-root">
      {/* 顶栏 */}
      <div className={`reader-topbar ${showUI ? '' : 'hidden'}`}>
        <div className="reader-topbar-left">
          <button className="reader-back-btn" onClick={onClose}>← 返回</button>
        </div>
        <div className="reader-topbar-right">
          <button className="reader-btn" onClick={() => setShowHelp(s => !s)} title="快捷键 (?/H)" style={{ fontSize: '0.7rem', padding: '2px 6px', marginRight: 8 }}>?</button>
          <span className="reader-page-num">{index + 1} / {pages.length}</span>
        </div>
      </div>

      {/* 底栏 */}
      <div className={`reader-bottombar ${showUI ? '' : 'hidden'}`}>
        <div className="reader-progress-track" onClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect()
          setIndex(Math.round((e.clientX - rect.left) / rect.width * (pages.length - 1)))
        }}>
          <div className="reader-progress-fill" style={{ width: `${progressPct}%` }} />
        </div>
        <div className="reader-controls">
          <div className="reader-controls-left">
            <button className="reader-btn" onClick={goPrev} disabled={index <= 0}>◀</button>
          </div>
          <div className="reader-controls-center">
            <span className="reader-page-indicator">{index + 1} / {pages.length}</span>
          </div>
          <div className="reader-controls-right">
            <select className="reader-select" value={readMode} onChange={e => { setReadMode(e.target.value); saveSetting('readMode', e.target.value) }}>
              {READ_MODES.map(m => <option key={m.key} value={m.key}>{m.icon} {m.label}</option>)}
            </select>
            <select className="reader-select" value={fitMode} onChange={e => { setFitMode(e.target.value); saveSetting('fitMode', e.target.value); requestAnimationFrame(() => window.dispatchEvent(new Event('resize'))) }}>
              {FIT_MODES.map(m => <option key={m.key} value={m.key}>{m.icon} {m.label}</option>)}
            </select>
            <select className="reader-select" value={transition} onChange={e => { setTransition(e.target.value); saveSetting('transition', e.target.value) }}>
              {TRANSITIONS.map(t => <option key={t.key} value={t.key}>{t.icon} {t.label}</option>)}
            </select>
            <button className="reader-btn" onClick={goNext} disabled={index >= pages.length - 1}>▶</button>
          </div>
        </div>
      </div>

      {/* 主内容 */}
      {readMode === 'scroll' ? (
        <div className="reader-scroll-container" ref={scrollRef}>
          <div className="reader-scroll-inner" style={{ height: pages.length * window.innerHeight * 0.95 }}>
            {pages.map((rp, i) => {
              const inRange = i >= visibleRange.start && i <= visibleRange.end
              const pageUrl = getImgUrl(rp)
              return (
                <div key={i} className="reader-scroll-page" style={{ height: window.innerHeight * 0.95, position: 'absolute', top: i * window.innerHeight * 0.95, left: 0, right: 0 }}>
                  {inRange ? <PageImage src={pageUrl} fitMode={fitMode} transition={transition} current={index} index={i} scrollMode /> : <div className="reader-scroll-placeholder" />}
                </div>
              )
            })}
          </div>
        </div>
      ) : (
        <>
          <div className="reader-hotzone reader-hotzone-left" onClick={goPrev} />
          <div className="reader-hotzone reader-hotzone-right" onClick={goNext} />
          <div className="reader-image-area" onMouseMove={() => setShowUI(true)}>
            <div className="reader-transition-wrapper">
              {transition === 'slide' ? (
                <>
                  <PageImage src={getImgUrl(pages[index - 1])} fitMode={fitMode} transition={transition} current={index} index={index - 1} />
                  <PageImage src={getImgUrl(p)} fitMode={fitMode} transition={transition} current={index} index={index} />
                  <PageImage src={getImgUrl(pages[index + 1])} fitMode={fitMode} transition={transition} current={index} index={index + 1} />
                </>
              ) : (
                <PageImage src={getImgUrl(p)} fitMode={fitMode} transition={transition} current={index} index={index} />
              )}
            </div>
            {isLocal && (
              <div style={{ position: 'absolute', top: 48, right: 16, background: 'rgba(16,185,129,0.2)', color: '#10b981', padding: '3px 10px', borderRadius: 10, fontSize: '0.7rem', zIndex: 15 }}>本地文件</div>
            )}
          </div>
        </>
      )}

      {/* 预加载 */}
      {preloadPages.map(pp => <link key={pp.idx} rel="preload" as="image" href={pp.url} />)}
      {preloadPages.map(pp => <img key={'pre' + pp.idx} src={pp.url} style={{ display: 'none' }} alt="" />)}

      {/* 快捷键帮助面板 */}
      {showHelp && (
        <div className="reader-help-overlay" onClick={() => setShowHelp(false)}>
          <div className="reader-help-panel" onClick={e => e.stopPropagation()}>
            <div className="reader-help-title">⌨ 快捷键</div>
            <div className="reader-help-grid">
              <span className="reader-help-key">← / A</span><span>上一页</span>
              <span className="reader-help-key">→ / D</span><span>下一页</span>
              <span className="reader-help-key">F</span><span>切换缩放模式</span>
              <span className="reader-help-key">M</span><span>翻页/滚动模式</span>
              <span className="reader-help-key">? / H</span><span>显示/隐藏帮助</span>
              <span className="reader-help-key">Esc</span><span>关闭阅读器</span>
            </div>
            <div className="reader-help-hint">点击空白处关闭 · 4秒后自动消失</div>
          </div>
        </div>
      )}
    </div>
  )
}
