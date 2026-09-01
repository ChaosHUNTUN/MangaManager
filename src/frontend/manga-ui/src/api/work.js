import { request } from './client'

// ===== 作品 × 标签（work_tag 统一表） =====

export async function fetchWorkTags(workId) {
  const json = await request(`/api/work/${workId}/tags`)
  return json.data || []
}

export async function addWorkTags(workId, tagIds) {
  return request(`/api/work/${workId}/tags`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tagIds }),
  })
}

export async function removeWorkTag(workId, tagId) {
  return request(`/api/work/${workId}/tags/${tagId}`, { method: 'DELETE' })
}

// ===== 标签库 =====

export async function searchTags({ q, category, limit = 50 } = {}) {
  const p = new URLSearchParams()
  if (q) p.set('q', q)
  if (category) p.set('category', category)
  p.set('limit', limit)
  const json = await request(`/api/tag/search?${p}`)
  return json.data || []
}

export async function fetchCommonTags(limit = 30) {
  const json = await request(`/api/tag/common?limit=${limit}`)
  return json.data || []
}

export async function fetchTagStats() {
  const json = await request('/api/local/galleries/tag-stats')
  return json.data || []
}

export async function createTag({ name, namespace = 'other', category, color, nameCn }) {
  return request('/api/tag', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, namespace, category, color, nameCn }),
  })
}
