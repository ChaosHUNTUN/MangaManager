// API 客户端核心：基础 URL + 请求封装

export const API_BASE = ''

export async function request(path, options = {}) {
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
      if (signal?.aborted) throw e
      if (attempt === 0) await new Promise(r => setTimeout(r, 500))
    }
  }
  throw lastError
}
