// 漫画管理 API

import { API_BASE, request } from './client'

export async function fetchMangaList(search, tagIds, page = 1, pageSize = 50) {
  const params = new URLSearchParams()
  if (search) params.set('search', search)
  if (tagIds?.length) params.set('tags', tagIds.join(','))
  params.set('page', String(page))
  params.set('pageSize', String(pageSize))
  const json = await request(`/api/manga?${params.toString()}`)
  return json.data || { items: [], total: 0 }
}

export async function fetchMangaDetail(id) {
  const json = await request(`/api/manga/${id}`)
  return json.data
}

export async function scanDirectory(dir, clientId) {
  return request('/api/manga/scan', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ directory: dir, clientId })
  })
}

export function subscribeScanProgress(clientId, onProgress) {
  const es = new EventSource(`${API_BASE}/api/manga/scan/progress/${clientId}`)
  es.onmessage = (e) => {
    try {
      const data = JSON.parse(e.data)
      onProgress(data)
      if (data.isComplete) es.close()
    } catch {}
  }
  // EventSource 默认自动重连，不要无条件 close
  es.onerror = () => {
    if (es.readyState === EventSource.CLOSED) return // 已关闭
    // readyState === CONNECTING 时 EventSource 会自动重试，无需操作
  }
  return es
}

export async function renameManga(mangaId, newName) {
  return request(`/api/manga/${mangaId}/rename`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ newName })
  })
}

export async function deleteManga(mangaId, deleteFolder = false) {
  return request(`/api/manga/${mangaId}?deleteFolder=${deleteFolder}`, {
    method: 'DELETE'
  })
}
