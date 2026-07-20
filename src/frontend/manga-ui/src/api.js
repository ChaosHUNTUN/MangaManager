// 动态检测 API 地址：开发模式(localhost:5173) → localhost:5000，否则同源
export const API_BASE = (() => {
  const { hostname, port } = window.location
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return `http://${hostname}:5000`
  }
  return ''  // 生产模式后端托管前端，同源
})()

async function request(path, options = {}) {
  const url = `${API_BASE}${path}`
  const { signal, ...fetchOptions } = options

  let lastError = null
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url, { ...fetchOptions, signal })
      if (!res.ok) {
        const text = await res.text()
        let msg = `请求失败 (${res.status})`
        try { msg = JSON.parse(text).message || msg } catch {}
        throw new Error(msg)
      }
      return res.json()
    } catch (e) {
      lastError = e
      if (signal?.aborted) throw e  // 用户主动取消，不重试
      if (attempt === 0) await new Promise(r => setTimeout(r, 500))
    }
  }
  throw lastError
}

// === 漫画 ===
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
  es.onerror = () => es.close()
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

// === 标签 ===
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

// === 文件系统浏览 ===
export async function fetchDrives() {
  const json = await request('/api/filesystem/drives')
  return json.data || []
}

export async function fetchDirectory(path) {
  const url = `/api/filesystem/dirs?path=${encodeURIComponent(path)}`
  const json = await request(url)
  return json.data || []
}

// === E-Hentai 网络源 ===
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

// === 下载管理器 ===
export async function fetchDownloadTasks() {
  const json = await request('/api/download/tasks')
  return json.data || []
}
export async function fetchActiveDownloadTasks() {
  const json = await request('/api/download/tasks/active')
  return json.data || []
}
export async function fetchDownloadTask(gid) {
  const json = await request(`/api/download/tasks/${gid}`)
  return json.data
}
export async function addDownloadTask(gid, token, title, coverUrl) {
  return request('/api/download/tasks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ gid, token, title, coverUrl })
  })
}
export async function pauseDownloadTask(gid) {
  return request(`/api/download/tasks/${gid}/pause`, { method: 'POST' })
}
export async function resumeDownloadTask(gid) {
  return request(`/api/download/tasks/${gid}/resume`, { method: 'POST' })
}
export async function removeDownloadTask(gid) {
  return request(`/api/download/tasks/${gid}`, { method: 'DELETE' })
}
export async function restartDownloadTask(gid) {
  return request(`/api/download/tasks/${gid}/restart`, { method: 'POST' })
}
export async function restartAllFailedTasks() {
  const json = await request('/api/download/tasks/restart-all-failed', { method: 'POST' })
  return json.data
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

// === 阅读 ===
export function getCoverUrl(mangaId) {
  return `${API_BASE}/api/cover/${mangaId}`
}

export function getPageUrl(mangaId, pageIndex) {
  return `${API_BASE}/api/reader/manga/${mangaId}/page/${pageIndex}`
}

// === 本地画廊 ===
export async function fetchLocalGalleries() {
  const json = await request('/api/local/galleries')
  return json.data || []
}

/// 获取轻量元数据列表（仅 gid+artists+groups+category+language）
export async function fetchLocalGalleryMetas() {
  const json = await request('/api/local/galleries/meta')
  return json.data || []
}

/// 分页获取画廊摘要（POST body 传参，避免 albumGids 过长导致 414 URI Too Long）
export async function fetchLocalGalleriesPaged({ group, search, sort, page = 1, pageSize = 20, albumGids, albumOrder } = {}) {
  const json = await request('/api/local/galleries/paged', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ group, search, sort, page, pageSize, albumGids, albumOrder })
  })
  return json.data || { items: [], total: 0, totalPages: 0, page: 1, pageSize: 20 }
}

/// 随机抽取 N 部作品
export async function fetchLocalGalleriesRandom(count = 20) {
  const json = await request(`/api/local/galleries/random?count=${count}`)
  return json.data || { items: [], total: 0, totalPages: 0 }
}

/// 获取侧边栏自动分组信息
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

/// 可取消版本（用于阅读器快速切换时取消旧请求）
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

// 导入外部作品
export async function importLocalGallery({ sourceDir, title, category, language, artists, groups, otherTags, copyFiles }) {
  const json = await request('/api/local/import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sourceDir, title, category, language, artists, groups, otherTags, copyFiles: copyFiles ?? true })
  })
  return json.data
}

// 获取/更新作品的 meta 标签
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

// 浏览文件夹（调用后端 API）
export async function browseDirectory(path) {
  const json = await request(`/api/filesystem/browse?path=${encodeURIComponent(path || '')}`)
  return json.data || []
}

// 批量导入：扫描父目录下所有子文件夹
export async function batchImportGalleries(parentDir, copyFiles = true) {
  const json = await request('/api/local/batch-import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ parentDir, copyFiles })
  })
  return json.data
}

// ==================== 阅读进度 ====================
export async function fetchReadingProgress(gid) {
  try {
    const json = await request(`/api/readingprogress/${gid}`)
    return json.data?.pageIndex ?? 0
  } catch { return 0 }
}

/// 可取消版本
export async function fetchReadingProgressAbortable(gid, signal) {
  try {
    const json = await request(`/api/readingprogress/${gid}`, { signal })
    return json.data?.pageIndex ?? 0
  } catch { return 0 }
}

export async function saveReadingProgress(items) {
  if (!items || items.length === 0) return
  try {
    await request('/api/readingprogress', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(items)
    })
  } catch { /* 静默失败，不影响阅读体验 */ }
}

// ==================== 阅读器设置 ====================
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

// ==================== 专辑配置 ====================
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

/// 获取单个专辑详情（含关联标签及翻译）
export async function fetchAlbumDetail(key) {
  try {
    const json = await request(`/api/albums/${encodeURIComponent(key)}`)
    return json.data  // 含 key, name, color, count, gidCount, createdAt, updatedAt, keyTag, gids
  } catch { return null }
}

/// 获取当前筛选条件下的完整有序 gid 列表（供阅读器跨作品导航）
export async function fetchLocalGalleryGids({ group, search, sort, albumGids, albumOrder } = {}) {
  const json = await request('/api/local/galleries/gids', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ group, search, sort, albumGids, albumOrder })
  })
  return json.data || []
}

/// 查询所有专辑简略信息（key, name, color, count, createdAt）
export async function fetchAlbumSummary() {
  try {
    const json = await request('/api/albums/summary')
    return json.data || []
  } catch { return [] }
}

/// 根据 Key 查询专辑详细信息（简略信息 + gid 列表 + keyTag）
export async function fetchAlbumDetailV2(key) {
  try {
    const json = await request(`/api/albums/${encodeURIComponent(key)}/detail`)
    return json.data
  } catch { return null }
}

/// 更新专辑属性（名称、颜色）
export async function updateAlbum(key, { name, color }) {
  return request(`/api/albums/${encodeURIComponent(key)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, color })
  })
}
