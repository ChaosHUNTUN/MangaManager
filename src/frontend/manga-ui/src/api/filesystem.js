// 文件系统浏览 API

import { request } from './client'

export async function fetchDrives() {
  const json = await request('/api/filesystem/drives')
  return json.data || []
}

export async function fetchDirectory(path) {
  const url = `/api/filesystem/dirs?path=${encodeURIComponent(path)}`
  const json = await request(url)
  return json.data || []
}
