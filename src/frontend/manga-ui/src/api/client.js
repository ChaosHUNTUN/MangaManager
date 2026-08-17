// API 客户端核心：基础 URL + 请求封装

export const API_BASE = ''

export async function request(path, options = {}) {
  const url = `${API_BASE}${path}`
  const { signal, ...fetchOptions } = options

  // 仅对幂等的读操作自动重试；POST/PUT/DELETE 因网络抖动重试可能造成重复执行，只尝试一次
  const method = (fetchOptions.method || 'GET').toUpperCase()
  const maxAttempts = (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') ? 2 : 1

  let lastError = null
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
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
      if (signal?.aborted) throw e
      if (attempt < maxAttempts - 1) await new Promise(r => setTimeout(r, 500))
    }
  }
  throw lastError
}
