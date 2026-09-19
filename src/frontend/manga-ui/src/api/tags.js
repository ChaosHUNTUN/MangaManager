// 标签管理 API

import { request } from './client'

export async function fetchAllTags(category) {
  const url = category
    ? `/api/tag?category=${encodeURIComponent(category)}`
    : '/api/tag'
  const json = await request(url)
  return json.data || []
}

export async function fetchTagCategories() {
  const json = await request('/api/tag/categories')
  return json.data || []
}

export async function createTag(name, color, category) {
  return request('/api/tag', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, color, category })
  })
}

export async function updateTag(id, updates) {
  return request(`/api/tag/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates)
  })
}

/** 删除标签；force=false 时后端会拒绝删除仍有关联作品的标签 */
export async function deleteTag(id, force = false) {
  return request(`/api/tag/${id}${force ? '?force=true' : ''}`, { method: 'DELETE' })
}

/** 清理空标签（无任何作品关联） */
export async function cleanupEmptyTags() {
  return request('/api/tag/cleanup-empty', { method: 'POST' })
}

export async function mergeTags(fromId, intoId) {
  return request('/api/tag/merge', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fromId, intoId })
  })
}

export async function fetchTagOrder(tagId) {
  const json = await request(`/api/tag/${tagId}/order`)
  return json.data || { tagId, gids: null }
}

export async function saveTagOrder(tagId, gids) {
  return request(`/api/tag/${tagId}/order`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ gids })
  })
}
