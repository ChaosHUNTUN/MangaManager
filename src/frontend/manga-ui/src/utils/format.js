/**
 * 通用工具函数
 */

export const formatSize = (b) => {
  if (b == null) return '—'
  return b > 1e9 ? (b / 1e9).toFixed(1) + ' GB' 
    : b > 1e6 ? (b / 1e6).toFixed(0) + ' MB' 
    : b + ' B'
}

export const formatCount = (n) => {
  if (n == null) return '—'
  return n > 9999 ? (n / 1000).toFixed(1) + 'k' : String(n)
}
