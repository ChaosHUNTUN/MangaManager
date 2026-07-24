// 下载管理 API

import { request } from './client'

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
