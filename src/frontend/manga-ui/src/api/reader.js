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
    return json.data?.pageIndex ?? 0
  } catch { return 0 }
}

export async function fetchReadingProgressAbortable(gid, signal) {
  try {
    const json = await request(`/api/readingprogress/${gid}`, { signal })
    return json.data?.pageIndex ?? 0
  } catch (e) {
    if (signal?.aborted || e?.name === 'AbortError') throw e
    return 0
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
    return json.data || null
  } catch { return null }
}

export async function saveReaderSettings(settings) {
  try {
    await request('/api/settings/reader', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings)
    })
  } catch { /* 静默失败 */ }
}
