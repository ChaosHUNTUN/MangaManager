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

export async function deleteTag(id) {
  return request(`/api/tag/${id}`, { method: 'DELETE' })
}

export async function fetchMangaTags(mangaId) {
  const json = await request(`/api/manga/${mangaId}/tags`)
  return json.data || []
}

export async function setMangaTags(mangaId, tagIds) {
  return request(`/api/manga/${mangaId}/tags`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(tagIds)
  })
}

export async function batchAddTags(mangaIds, tagIds) {
  return request('/api/manga/batch/tags', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mangaIds, tagIds })
  })
}
