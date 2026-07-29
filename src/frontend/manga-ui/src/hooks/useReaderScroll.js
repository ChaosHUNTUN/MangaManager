import { useState, useRef, useCallback, useEffect } from 'react'

/**
 * 滚动模式 Hook — 管理滚动进度、可见范围、页码计算
 */
export default function useReaderScroll({ readMode, pages, onIndexChange }) {
  const [visibleRange, setVisibleRange] = useState({ start: 0, end: 10 })
  const [scrollProgress, setScrollProgress] = useState(0)
  const loadedPagesRef = useRef(new Set())
  const scrollRef = useRef(null)
  const pageRefsRef = useRef([])
  const scrollPosRef = useRef({ scrollTop: 0, clientHeight: 0 })
  const pagesRef = useRef(pages)
  const lastIndexRef = useRef(0)
  pagesRef.current = pages

  const handleScroll = useCallback(() => {
    if (readMode !== 'scroll') return
    const c = scrollRef.current; if (!c) return
    const scrollTop = c.scrollTop
    const clientHeight = c.clientHeight
    const viewCenter = scrollTop + clientHeight / 2
    scrollPosRef.current = { scrollTop, clientHeight }
    const pages = pagesRef.current

    const refs = pageRefsRef.current
    let currentIdx = 0
    for (let i = 0; i < refs.length; i++) {
      const el = refs[i]
      if (el) {
        const rect = el.getBoundingClientRect()
        const elTop = rect.top + scrollTop - c.offsetTop
        const elBottom = elTop + rect.height
        if (viewCenter >= elTop && viewCenter < elBottom) { currentIdx = i; break }
        if (i < refs.length - 1) {
          const nextEl = refs[i + 1]
          if (nextEl) {
            const nextRect = nextEl.getBoundingClientRect()
            const nextTop = nextRect.top + scrollTop - c.offsetTop
            if (viewCenter >= elBottom && viewCenter < nextTop) { currentIdx = (viewCenter - elBottom < nextTop - viewCenter) ? i : i + 1; break }
          }
        }
      }
    }
    if (scrollTop + clientHeight >= c.scrollHeight - 2) currentIdx = pages.length - 1

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
        if (elBottom >= viewTop && elTop <= viewBottom) { if (start === 0) start = i; end = i }
      }
    }
    setVisibleRange({ start, end })
    for (let i = start; i <= end; i++) loadedPagesRef.current.add(i)
    onIndexChange?.(currentIdx)
    const maxScroll = c.scrollHeight - clientHeight
    setScrollProgress(maxScroll > 0 ? (scrollTop / maxScroll * 100) : 0)
  }, [readMode, pages.length, onIndexChange])

  const handleScrollRef = useRef(handleScroll)
  handleScrollRef.current = handleScroll

  // 始终跟踪 index
  useEffect(() => { lastIndexRef.current = lastIndexRef.current || 0 }, [])
  // 接受外部 index 更新
  const setLastIndex = (idx) => { lastIndexRef.current = idx }

  // 切换到滚动模式时跳到之前位置
  useEffect(() => {
    if (readMode !== 'scroll' || !pages.length) return
    const targetIdx = lastIndexRef.current
    if (targetIdx <= 0) return
    const raf = requestAnimationFrame(() => {
      const c = scrollRef.current
      if (c) {
        const pageH = window.innerHeight * 0.95
        c.scrollTop = Math.min(targetIdx * pageH, c.scrollHeight - c.clientHeight)
      }
    })
    return () => cancelAnimationFrame(raf)
  }, [readMode])

  // 绑定滚动事件
  useEffect(() => {
    if (readMode !== 'scroll') return
    const c = scrollRef.current; if (!c) return
    c.addEventListener('scroll', handleScroll, { passive: true })
    handleScroll()
    return () => c.removeEventListener('scroll', handleScroll)
  }, [readMode, pages.length, handleScroll])

  // 切换模式时清空已加载集合
  useEffect(() => {
    if (readMode === 'scroll') loadedPagesRef.current = new Set()
  }, [readMode])

  return { scrollRef, pageRefsRef, scrollPosRef, visibleRange, loadedPagesRef, scrollProgress, handleScroll, handleScrollRef, setLastIndex }
}
