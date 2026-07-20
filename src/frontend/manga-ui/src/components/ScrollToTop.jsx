import { useState, useEffect, useCallback } from 'react'
import { IconArrowUp } from './Icons'

export default function ScrollToTop({ containerRef, threshold = 400 }) {
  const [visible, setVisible] = useState(false)

  const check = useCallback(() => {
    const el = containerRef?.current
    const top = el ? el.scrollTop : window.scrollY
    setVisible(top > threshold)
  }, [containerRef, threshold])

  useEffect(() => {
    const el = containerRef?.current
    const target = el || window
    target.addEventListener('scroll', check, { passive: true })
    check()
    return () => target.removeEventListener('scroll', check)
  }, [check, containerRef])

  const scrollToTop = () => {
    const el = containerRef?.current
    if (el) { el.scrollTo({ top: 0, behavior: 'smooth' }) }
    else { window.scrollTo({ top: 0, behavior: 'smooth' }) }
  }

  if (!visible) return null

  return (
    <button
      onClick={scrollToTop}
      title="回到顶部"
      style={{
        position: 'fixed', bottom: 24, right: 24,
        width: 36, height: 36,
        borderRadius: 'var(--radius-full)',
        background: 'rgba(30, 30, 48, 0.92)',
        border: '1.5px solid var(--accent-teal)',
        color: 'var(--accent-teal)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: 'pointer', opacity: 0.85,
        backdropFilter: 'blur(8px)',
        boxShadow: '0 2px 12px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.06)',
        transition: 'all var(--duration-fast) var(--ease-out)',
        zIndex: 100, outline: 'none',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.opacity = '1'
        e.currentTarget.style.transform = 'scale(1.08)'
        e.currentTarget.style.background = 'rgba(40, 40, 60, 0.95)'
      }}
      onMouseLeave={e => {
        e.currentTarget.style.opacity = '0.85'
        e.currentTarget.style.transform = 'scale(1)'
        e.currentTarget.style.background = 'rgba(30, 30, 48, 0.92)'
      }}>
      <IconArrowUp size={16} />
    </button>
  )
}