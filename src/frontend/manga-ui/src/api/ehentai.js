// E-Hentai API + 标签翻译/屏蔽

import { API_BASE, request } from './client'

// === Cookie / 连通性 ===
export async function checkEHConnectivity() {
  const json = await request('/api/ehentai/connectivity')
  return json.data
}
export async function fetchEHentaiCookie() {
  const json = await request('/api/ehentai/cookie')
  return json.data
}
export async function updateEHentaiCookie(cookie) {
  return request('/api/ehentai/cookie', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(cookie)
  })
}
export async function validateEHentaiCookie() {
  return request('/api/ehentai/validate', { method: 'POST' })
}

// === 画廊搜索 / 详情 ===
export async function fetchEHGalleries(search, page = 0, exhentai = false, nextCursor = null, filters = {}) {
  const params = new URLSearchParams()
  if (search) params.set('search', search)
  params.set('page', String(page))
  if (exhentai) params.set('exhentai', 'true')
  if (nextCursor) params.set('nextCursor', nextCursor)
  if (filters.categoryMask) params.set('categoryMask', String(filters.categoryMask))
  if (filters.minRating) params.set('minRating', String(filters.minRating))
  if (filters.pageFrom) params.set('pageFrom', String(filters.pageFrom))
  if (filters.pageTo) params.set('pageTo', String(filters.pageTo))
  if (filters.advSearch) params.set('advSearch', String(filters.advSearch))
  if (filters.popular) params.set('popular', 'true')
  const json = await request(`/api/ehentai/galleries?${params.toString()}`)
  return json.data
}

export async function fetchEHGalleryDetail(gid, token) {
  const json = await request(`/api/ehentai/gallery/${gid}/${token}`)
  return json.data
}

export async function fetchEHGalleryPages(gid, token) {
  const json = await request(`/api/ehentai/gallery/${gid}/${token}/pages`)
  return json.data
}

export async function downloadEHGallery(gid, token, title) {
  const params = title ? `?title=${encodeURIComponent(title)}` : ''
  return request(`/api/download/gallery/${gid}/${token}${params}`, { method: 'POST' })
}

export async function translateEHSearch(q) {
  const json = await request(`/api/ehentai/search/translate?q=${encodeURIComponent(q)}`)
  return json.data
}

export function getEHImageProxyUrl(url) {
  return `${API_BASE}/api/ehentai/image?url=${encodeURIComponent(url)}`
}

// === 标签翻译 ===
export async function suggestEHTags(query, limit = 30) {
  const json = await request(`/api/ehentai/tags/suggest?q=${encodeURIComponent(query)}&limit=${limit}`)
  return json.data || []
}

export async function translateEHTags(tags) {
  return request('/api/ehentai/tags/translate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tags })
  })
}

// === 标签屏蔽 ===
export async function fetchBlockedTags() {
  const json = await request('/api/ehentai/blocked-tags')
  return json.data || []
}

export async function addBlockedTag(tag) {
  return request('/api/ehentai/blocked-tags', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tag })
  })
}

export async function removeBlockedTag(tag) {
  return request('/api/ehentai/blocked-tags', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tag })
  })
}
