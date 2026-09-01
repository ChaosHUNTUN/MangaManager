import { useEffect, useState } from 'react'

// 竖屏手机 ≤768px；横屏手机宽可达 932px 但高度 ≤500px（否则会被误判为桌面端）
const MOBILE_QUERY = '(max-width: 768px), (max-width: 1024px) and (max-height: 500px)'

/**
 * 响应式移动端检测（跟随窗口变化）
 */
export default function useIsMobile() {
  const [isMobile, setIsMobile] = useState(() => window.matchMedia(MOBILE_QUERY).matches)

  useEffect(() => {
    const mql = window.matchMedia(MOBILE_QUERY)
    const onChange = (e) => setIsMobile(e.matches)
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [])

  return isMobile
}
