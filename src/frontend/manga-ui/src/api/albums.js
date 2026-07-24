// 专辑配置 API

import { request } from './client'

export async function fetchAlbumConfig() {
  try {
    const json = await request('/api/albums')
    return json.data || {}
  } catch { return null }
}

export async function saveAlbumConfig(config) {
  return request('/api/albums', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config)
  })
}

export async function renameAlbum(key, name) {
  return request(`/api/albums/${encodeURIComponent(key)}/rename`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name })
  })
}

export async function fetchAlbumDetail(key) {
  try {
    const json = await request(`/api/albums/${encodeURIComponent(key)}`)
    return json.data
  } catch { return null }
}

export async function fetchAlbumSummary() {
  try {
    const json = await request('/api/albums/summary')
    return json.data || []
  } catch { return [] }
}

export async function fetchAlbumDetailV2(key) {
  try {
    const json = await request(`/api/albums/${encodeURIComponent(key)}/detail`)
    return json.data
  } catch { return null }
}

export async function updateAlbum(key, { name, color }) {
  return request(`/api/albums/${encodeURIComponent(key)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, color })
  })
}
