import { useEffect } from 'react'
import { fetchEHGalleryDetail } from '../api'

/**
 * EHentai 初始加载 Hook
 * — 处理 URL 参数中的直接打开详情
 * — 或进入热门浏览模式
 * — 所有逻辑与 UI 渲染完全隔离
 */
export default function useEHInit({ browse, openDetailViaApi, cookieInfo }) {
  useEffect(() => {
    let cancelled = false

    const init = async () => {
      // 等待异步状态稳定
      await new Promise(r => setTimeout(r, 100))
      if (cancelled) return

      const params = new URLSearchParams(window.location.search)
      const openParam = params.get('open')
      if (openParam) {
        const parts = openParam.split('_')
        const gid = parseInt(parts[0])
        const token = parts.length > 1 ? parts[1] : null
        if (gid && token) {
          window.history.replaceState({}, '', '/ehentai')
          // 委托 detail Hook 完成加载（不直接操作内部状态）
          const detail = await fetchEHGalleryDetail(gid, token)
          if (!cancelled && detail) {
            openDetailViaApi(detail)
          }
          return
        }
      }

      if (cancelled) return
      // 首次加载时使用 forcePopular=true 避免 stale state
      browse('', true, true)
    }

    init()
    return () => { cancelled = true }
  }, [])
}
