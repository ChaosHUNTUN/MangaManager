import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { saveReadingProgress } from '../api'
import { FIT_MODES } from '../constants/reader'

/**
 * 键盘快捷键 & 触摸手势 Hook
 */
export default function useReaderKeyboard({ readMode, fitMode, updateSetting, goPrevPage, goNextPage, goPrevGallery, goNextGallery, setSlideshow, setShowHelp, resetHideTimer, setShowUI, progressRef }) {
  const navigate = useNavigate()
  const fitModeRef = useRef(fitMode)
  const readModeRef = useRef(readMode)
  useEffect(() => { fitModeRef.current = fitMode }, [fitMode])
  useEffect(() => { readModeRef.current = readMode }, [readMode])

  const actionsRef = useRef({ goPrevPage, goNextPage, goPrevGallery, goNextGallery })
  actionsRef.current = { goPrevPage, goNextPage, goPrevGallery, goNextGallery }

  useEffect(() => {
    const handler = (e) => {
      const tag = e.target.tagName
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return

      if (e.key === 'ArrowLeft' || e.key === 'a') { e.preventDefault(); actionsRef.current.goPrevPage() }
      else if (e.key === 'ArrowRight' || e.key === 'd') { e.preventDefault(); actionsRef.current.goNextPage() }
      else if (e.key === 'ArrowUp') {
        if (readModeRef.current !== 'scroll') { e.preventDefault(); actionsRef.current.goPrevGallery() }
      }
      else if (e.key === 'ArrowDown') {
        if (readModeRef.current !== 'scroll') { e.preventDefault(); actionsRef.current.goNextGallery() }
      }
      else if (e.ctrlKey && e.key === 'ArrowUp') { e.preventDefault(); actionsRef.current.goPrevGallery() }
      else if (e.ctrlKey && e.key === 'ArrowDown') { e.preventDefault(); actionsRef.current.goNextGallery() }
      else if (e.key === 'Escape') {
        e.preventDefault()
        const items = Object.entries(progressRef.current || {}).map(([g, p]) => ({ gid: parseInt(g), pageIndex: p }))
        saveReadingProgress(items)
        const returnUrl = sessionStorage.getItem('reader-local-return-url') || ''
        navigate(`/local${returnUrl}`, { replace: true })
      }
      else if (e.key === ' ') { e.preventDefault(); setSlideshow(s => !s) }
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
        updateSetting('readMode', readModeRef.current === 'paged' ? 'scroll' : 'paged')
      }
      else if (e.key === '?' || e.key === 'h' || e.key === 'H') { e.preventDefault(); setShowHelp(s => !s) }
    }
    window.addEventListener('keydown', handler)

    // 移动端触摸手势
    let touchStartX = 0, touchStartY = 0, touchStartTime = 0
    const touchStart = (e) => {
      if (e.touches.length > 1) return
      touchStartX = e.touches[0].clientX; touchStartY = e.touches[0].clientY; touchStartTime = Date.now()
    }
    const touchEnd = (e) => {
      if (readModeRef.current !== 'paged') return
      const dx = touchStartX - e.changedTouches[0].clientX
      const dy = touchStartY - e.changedTouches[0].clientY
      const elapsed = Date.now() - touchStartTime
      if (elapsed < 300 && Math.abs(dx) < 30 && Math.abs(dy) < 30) {
        setShowUI(s => { if (s) resetHideTimer?.(); return !s }); return
      }
      if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 40) {
        e.preventDefault()
        if (dx > 0) actionsRef.current.goNextPage(); else actionsRef.current.goPrevPage()
      } else if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 50) {
        if (dy > 0) setShowUI(false); else { setShowUI(true); resetHideTimer?.() }
      }
    }
    window.addEventListener('touchstart', touchStart, { passive: true })
    window.addEventListener('touchend', touchEnd, { passive: true })

    return () => {
      window.removeEventListener('keydown', handler)
      window.removeEventListener('touchstart', touchStart)
      window.removeEventListener('touchend', touchEnd)
    }
  }, [updateSetting, setSlideshow, setShowHelp, setShowUI, resetHideTimer, navigate])
}
