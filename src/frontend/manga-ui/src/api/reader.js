// 阅读器 API：进度 + 设置 + URL 构建器

import { API_BASE, request } from './client'

// === 漫画 URL 构建器 ===
export function getCoverUrl(mangaId) {
  return `${API_BASE}/api/cover/${mangaId}`
}

export function getPageUrl(mangaId, pageIndex) {
  return `${API_BASE}/api/reader/manga/${mangaId}/page/${pageIndex}`
}

// === 阅读进度 ===
export async function fetchReadingProgress(gid) {
  try {
    const json = await request(`/api/readingprogress/${gid}`)
    return json.data || { gid, pageIndex: 0, scrollOffset: null }
  } catch { return { gid, pageIndex: 0, scrollOffset: null } }
}

export async function fetchReadingProgressAbortable(gid, signal) {
  try {
    const json = await request(`/api/readingprogress/${gid}`, { signal })
    return json.data || { gid, pageIndex: 0, scrollOffset: null }
  } catch (e) {
    if (signal?.aborted || e?.name === 'AbortError') throw e
    return { gid, pageIndex: 0, scrollOffset: null }
  }
}

export async function saveReadingProgress(items) {
  if (!items || items.length === 0) return
  try {
    await request('/api/readingprogress', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(items)
    })
  } catch { /* 静默失败 */ }
}

// === 阅读器设置 ===
export async function fetchReaderSettings() {
  try {
    const json = await request('/api/settings/reader')
    return json.data?.data || null   // { data: { direction, flow, ... } }
  } catch { return null }
}

/** 批量标记已读/未读（用于"按标签批量标记"与单作品手动切换） */
export async function markProgressFinished(gids, finished = true) {
  const list = (Array.isArray(gids) ? gids : [gids]).filter(Boolean)
  if (list.length === 0) return null
  const json = await request('/api/readingprogress/mark', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ gids: list, finished })
  })
  return json.data
}

export async function saveReaderSettings(data) {
  try {
    await request('/api/settings/reader', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data })
    })
  } catch { /* 静默失败 */ }
}
