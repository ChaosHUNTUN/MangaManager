import { useState, useEffect, useRef } from 'react'

/**
 * 幻灯片 Hook — 管理定时翻页/滚动动画
 */
export default function useReaderSlideshow({ pages, readMode, slideInterval, scrollSpeed, loopMode, scrollRef, setIndex: setParentIndex }) {
  const [slideshow, setSlideshow] = useState(false)
  const [isHovering, setIsHovering] = useState(false)
  const timerRef = useRef(null)
  const animFrameRef = useRef(null)

  const readModeRef = useRef(readMode)
  const loopModeRef = useRef(loopMode)
  const scrollSpeedRef = useRef(scrollSpeed)
  useEffect(() => { readModeRef.current = readMode; loopModeRef.current = loopMode; scrollSpeedRef.current = scrollSpeed }, [readMode, loopMode, scrollSpeed])

  useEffect(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
    if (animFrameRef.current) { cancelAnimationFrame(animFrameRef.current); animFrameRef.current = null }
    if (!slideshow || isHovering || pages.length === 0) return

    if (readModeRef.current === 'scroll') {
      let lastTime = performance.now()
      const animate = (now) => {
        const c = scrollRef.current
        if (!c) { animFrameRef.current = requestAnimationFrame(animate); return }
        const dt = Math.min((now - lastTime) / 1000, 0.1)
        lastTime = now
        c.scrollTop += scrollSpeedRef.current * dt
        const maxTop = c.scrollHeight - c.clientHeight
        if (c.scrollTop >= maxTop - 2 && loopModeRef.current) c.scrollTop = 0
        animFrameRef.current = requestAnimationFrame(animate)
      }
      animFrameRef.current = requestAnimationFrame(animate)
    } else {
      timerRef.current = setInterval(() => {
        setParentIndex(prev => {
          const next = prev + 1
          if (next >= pages.length) return loopModeRef.current ? 0 : prev
          return next
        })
      }, slideInterval * 1000)
    }
    return () => {
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
      if (animFrameRef.current) { cancelAnimationFrame(animFrameRef.current); animFrameRef.current = null }
    }
  }, [slideshow, isHovering, slideInterval, pages.length, readMode])

  return { slideshow, setSlideshow, isHovering, setIsHovering }
}
