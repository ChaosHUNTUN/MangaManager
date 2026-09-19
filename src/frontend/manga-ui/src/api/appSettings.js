// 运行时设置 API（库目录 / 代理 / 重扫）

import { request } from './client'

/** 运行时设置 + 当前状态（含库目录是否已配置、是否存在、子目录数） */
export async function fetchAppSettings() {
  const json = await request('/api/settings/app')
  return json.data
}

/**
 * 保存运行时设置；字段为 undefined 表示不变。
 * rescan=true 时后端会启动追加式重扫（只增改不删）
 */
export async function saveAppSettings({ downloadDir, proxy, rescan } = {}) {
  const json = await request('/api/settings/app', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ downloadDir, proxy, rescan })
  })
  return json
}

/** 手动触发追加式重扫 */
export async function rescanLibrary() {
  const json = await request('/api/settings/app/rescan', { method: 'POST' })
  return json
}

/** 运行状态汇总（库规模 / 数据一致性指标 / 下载队列 / 存储目录），供设置页诊断展示 */
export async function fetchServerStatus() {
  const json = await request('/api/status')
  return json.data
}
