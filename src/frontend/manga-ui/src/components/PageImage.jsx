import { useState, useRef, useEffect } from 'react'

/**
 * 统一页面图片组件 — 原生 img 渐进渲染，无 spinner 延迟
 *
 * Props:
 *   src          - 图片 URL（必需）
 *   fitMode      - 缩放模式: 'fit-width' | 'fit-height' | 'fit-both' | 'original'
 *   fitPercent   - 缩放百分比 (20-100, 默认 100)
 *   transition   - 翻页过渡: 'fade' | 'slide' | 'none'
 *   current      - 当前页 index（用于过渡动画判断）
 *   index        - 本页 index
 *   scrollMode   - 是否滚动模式
 */
export default function PageImage({ src, fitMode, fitPercent, transition, current, index, scrollMode }) {
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState(false)

  // 图片切换时重置状态
  const prevSrcRef = useRef(src)
  useEffect(() => {
    if (prevSrcRef.current !== src) {
      prevSrcRef.current = src
      setLoaded(false)
      setError(false)
    }
  }, [src])

  const isCurrent = index === current
  let cls = 'reader-page-slot'
  if (scrollMode) cls += ' reader-page-slot-scroll'
  if (!scrollMode) {
    if (transition === 'fade') cls += isCurrent ? ' page-fade-in' : ' page-hidden'
    else if (transition === 'slide') {
      if (isCurrent) cls += ' page-slide-center'
      else if (index < current) cls += ' page-slide-left'
      else cls += ' page-slide-right'
    } else cls += isCurrent ? '' : ' page-hidden'
  }

  const pct = (fitPercent ?? 100) / 100
  let imgStyle = { display: 'block', transition: 'opacity 0.25s ease', opacity: loaded ? 1 : 0 }
  let slotStyle = {}
  if (fitMode === 'fit-width') {
    imgStyle = { ...imgStyle, width: `${pct * 100}%`, height: 'auto', margin: '0 auto' }
    slotStyle = { alignItems: 'flex-start', justifyContent: 'center' }
  } else if (fitMode === 'fit-height') {
    imgStyle = { ...imgStyle, width: 'auto', height: scrollMode ? 'auto' : '100%', maxHeight: scrollMode ? '100vh' : 'none', margin: '0 auto' }
    slotStyle = { alignItems: 'center', justifyContent: 'center' }
  } else if (fitMode === 'fit-both') {
    imgStyle = { ...imgStyle, maxWidth: `${pct * 100}%`, maxHeight: scrollMode ? '100vh' : '100%', width: 'auto', height: 'auto', margin: '0 auto' }
    slotStyle = { alignItems: 'center', justifyContent: 'center' }
  } else if (fitMode === 'original') {
    imgStyle = { ...imgStyle, width: 'auto', height: 'auto', margin: '0 auto' }
    slotStyle = { alignItems: 'center', justifyContent: 'flex-start' }
  }

  // 是否为当前/前后页（优先加载）
  const isNear = Math.abs(index - current) <= 1

  return (
    <div className={cls} style={slotStyle}>
      {error ? (
        <div className="reader-page-error">加载失败</div>
      ) : (
        <img
          src={src}
          alt={`${index + 1}`}
          draggable={false}
          style={imgStyle}
          loading={isNear ? 'eager' : 'lazy'}
          decoding="async"
          onLoad={() => setLoaded(true)}
          onError={() => setError(true)}
        />
      )}
    </div>
  )
}
