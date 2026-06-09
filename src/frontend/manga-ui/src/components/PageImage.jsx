import { useState, useEffect } from 'react'

/**
 * 图片懒加载 Hook
 */
function useLazyImage(src) {
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState(false)
  useEffect(() => {
    setLoaded(false); setError(false)
    const img = new Image()
    img.onload = () => setLoaded(true)
    img.onerror = () => setError(true)
    img.src = src
    return () => { img.onload = null; img.onerror = null }
  }, [src])
  return { loaded, error }
}

/**
 * 统一页面图片组件（本地画廊 + EHentai 在线阅读器共用）
 *
 * Props:
 *   src          - 图片 URL（必需）
 *   fitMode      - 缩放模式: 'fit-width' | 'fit-height' | 'fit-both' | 'original'
 *   fitPercent   - 缩放百分比 (20-100, 默认 100)
 *   transition   - 翻页过渡: 'fade' | 'slide' | 'none'
 *   current      - 当前页 index（用于过渡动画判断）
 *   index        - 本页 index
 *   scrollMode   - 是否滚动模式
 *   onLoad       - 加载完成回调
 *   onError      - 加载失败回调
 */
export default function PageImage({ src, fitMode, fitPercent, transition, current, index, onLoad, onError, scrollMode }) {
  const { loaded, error } = useLazyImage(src)
  useEffect(() => { if (loaded) onLoad?.() }, [loaded])
  useEffect(() => { if (error) onError?.() }, [error])

  const isCurrent = index === current
  let cls = scrollMode ? 'reader-page-slot-scroll' : 'reader-page-slot '
  if (!scrollMode) {
    if (transition === 'fade') cls += isCurrent ? 'page-fade-in' : 'page-hidden'
    else if (transition === 'slide') {
      if (isCurrent) cls += 'page-slide-center'
      else if (index < current) cls += 'page-slide-left'
      else cls += 'page-slide-right'
    } else cls += isCurrent ? '' : 'page-hidden'
  }

  const pct = (fitPercent ?? 100) / 100
  let imgStyle = { display: 'block' }
  let slotStyle = {}
  if (fitMode === 'fit-width') {
    imgStyle = { ...imgStyle, width: `${pct * 100}%`, height: 'auto', margin: '0 auto' }
    slotStyle = { alignItems: 'flex-start', justifyContent: 'center' }
  } else if (fitMode === 'fit-height') {
    imgStyle = { ...imgStyle, width: 'auto', height: scrollMode ? '100vh' : '100%', margin: '0 auto' }
    slotStyle = { alignItems: 'center', justifyContent: 'center' }
  } else if (fitMode === 'fit-both') {
    imgStyle = { ...imgStyle, maxWidth: `${pct * 100}%`, maxHeight: scrollMode ? '100vh' : '100%', width: 'auto', height: 'auto', margin: '0 auto' }
    slotStyle = { alignItems: 'center', justifyContent: 'center' }
  } else if (fitMode === 'original') {
    imgStyle = { ...imgStyle, width: 'auto', height: 'auto', margin: '0 auto' }
    slotStyle = { alignItems: 'center', justifyContent: 'flex-start' }
  }

  return (
    <div className={cls} style={slotStyle}>
      {!loaded && !error && <div className="reader-page-loading"><div className="reader-spinner" /></div>}
      {error && <div className="reader-page-error">加载失败</div>}
      {loaded && <img src={src} alt={`${index + 1}`} draggable={false} style={imgStyle}
        onLoad={() => onLoad?.()} />}
    </div>
  )
}
