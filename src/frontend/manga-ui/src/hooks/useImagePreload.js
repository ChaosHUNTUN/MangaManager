import { useRef, useEffect } from 'react'

const RADIUS = 50
const BATCH_SIZE = 3

/**
 * 阅读器图片预加载 (±50 页半径)
 *
 * 优先级队列: [current, current-1, current+1, current-2, current+2, ...]
 * 用 new Image() 触发浏览器原生缓存, 翻页时直接取缓存
 *
 * gid 变化 → 清空队列 + 中断旧加载 → 重建新队列
 * currentPage 变化 → 重建队列 (已加载的跳过)
 */
export default function useImagePreload(pages, currentPage, currentGid) {
  const loadedRef = useRef(new Set())
  const gidRef = useRef(null)
  const cancelRef = useRef(false)

  useEffect(() => {
    // ── gid 变化: 清空所有状态, 中断旧加载 ──
    if (gidRef.current !== currentGid) {
      gidRef.current = currentGid
      loadedRef.current.clear()
      cancelRef.current = true
    }

    if (!pages.length || Number.isNaN(currentGid)) return

    // ── 构建优先级队列 (当前页由 DOM <img> 加载, 跳过) ──
    // 双向交错但 +1 优先: [4, 6, 3, 7, 2, 8, ...]  → 翻页方向优先
    const queue = []
    for (let d = 1; d <= RADIUS; d++) {
      const prev = currentPage - d
      const next = currentPage + d
      if (next < pages.length) queue.push(next)  // 正向翻页优先
      if (prev >= 0) queue.push(prev)
    }

    // 过滤已加载 / 无效 URL
    const toLoad = queue.filter(i => !loadedRef.current.has(i) && pages[i])
    if (toLoad.length === 0) return

    // ── 启动预加载 (最多 BATCH_SIZE 张并行) ──
    cancelRef.current = false
    let idx = 0
    const cancelled = () => cancelRef.current || gidRef.current !== currentGid

    const loadNext = () => {
      while (idx < toLoad.length && !cancelled()) {
        const pageIdx = toLoad[idx]
        idx++
        const url = pages[pageIdx]
        if (!url) continue

        const img = new Image()
        const done = () => {
          if (!cancelled()) loadedRef.current.add(pageIdx)
          if (!cancelled()) loadNext()
        }
        img.onload = done
        img.onerror = done
        img.src = url
        return // 当前图开始加载，loadNext 由 onload/onerror 回调续接
      }
    }

    for (let i = 0; i < BATCH_SIZE && idx < toLoad.length; i++) {
      loadNext()
    }

    return () => { cancelRef.current = true }
  }, [pages, currentPage, currentGid])
}
