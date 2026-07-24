// 本地画廊 API

import { API_BASE, request } from './client'

export async function fetchLocalGalleries() {
  const json = await request('/api/local/galleries')
  return json.data || []
}

export async function fetchLocalGalleryMetas() {
  const json = await request('/api/local/galleries/meta')
  return json.data || []
}

export async function fetchLocalGalleriesPaged({ group, search, sort, page = 1, pageSize = 20, albumGids, albumOrder } = {}) {
  const json = await request('/api/local/galleries/paged', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ group, search, sort, page, pageSize, albumGids, albumOrder })
  })
  return json.data || { items: [], total: 0, totalPages: 0, page: 1, pageSize: 20 }
}

export async function fetchLocalGalleriesRandom(count = 20) {
  const json = await request(`/api/local/galleries/random?count=${count}`)
  return json.data || { items: [], total: 0, totalPages: 0 }
}

export async function fetchLocalGalleryGroups() {
  const json = await request('/api/local/groups')
  return json.data || []
}

export async function fetchLocalGalleryDetail(gid) {
  const json = await request(`/api/local/gallery/${gid}`)
  return json.data
}

export async function fetchLocalGalleryPages(gid) {
  const json = await request(`/api/local/gallery/${gid}/pages`)
  return json.data || []
}

export async function fetchLocalGalleryPagesAbortable(gid, signal) {
  const json = await request(`/api/local/gallery/${gid}/pages`, { signal })
  return json.data || []
}

export function getLocalCoverUrl(gid) {
  return `${API_BASE}/api/local/gallery/${gid}/cover`
}

export function getLocalPageUrl(gid, pageIndex) {
  return `${API_BASE}/api/local/gallery/${gid}/page/${pageIndex}`
}

export async function deleteLocalGallery(gid) {
  return request(`/api/local/gallery/${gid}`, { method: 'DELETE' })
}

export async function redownloadLocalGallery(gid, title, token) {
  const params = new URLSearchParams()
  if (title) params.set('title', title)
  if (token) params.set('token', token)
  return request(`/api/local/gallery/${gid}/redownload?${params.toString()}`, { method: 'POST' })
}

export async function batchRedownloadLocalGalleries(gids) {
  const json = await request('/api/local/redownload-batch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ gids })
  })
  return json.data
}

export async function checkDownloaded(gids) {
  const json = await request('/api/local/check-downloaded', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ gids })
  })
  return json.data || []
}

export async function importLocalGallery({ sourceDir, title, category, language, artists, groups, otherTags, copyFiles }) {
  const json = await request('/api/local/import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sourceDir, title, category, language, artists, groups, otherTags, copyFiles: copyFiles ?? true })
  })
  return json.data
}

export async function fetchGalleryMetaTags(gid) {
  try {
    const json = await request(`/api/local/gallery/${gid}/meta-tags`)
    return json.data || {}
  } catch { return {} }
}

export async function updateGalleryMetaTags(gid, { tags, title, category, language }) {
  return request(`/api/local/gallery/${gid}/meta-tags`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tags, title, category, language })
  })
}

export async function browseDirectory(path) {
  const json = await request(`/api/filesystem/browse?path=${encodeURIComponent(path || '')}`)
  return json.data || []
}

export async function batchImportGalleries(parentDir, copyFiles = true) {
  const json = await request('/api/local/batch-import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ parentDir, copyFiles })
  })
  return json.data
}

export async function fetchLocalGalleryGids({ group, search, sort, albumGids, albumOrder } = {}) {
  const json = await request('/api/local/galleries/gids', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ group, search, sort, albumGids, albumOrder })
  })
  return json.data || []
}
