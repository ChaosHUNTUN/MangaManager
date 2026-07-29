import { useState, useEffect, useCallback, useRef } from 'react'
import { fetchReaderSettings, saveReaderSettings } from '../api'

// 默认值
const DEFAULTS = {
  fitMode: 'fit-width',
  fitPercent: 100,
  direction: 'rtl',
  transition: 'fade',
  readMode: 'paged',
  slideInterval: 3,
  scrollSpeed: 200,
  loopMode: false,
}

// 模块级缓存：页面生命周期内只加载一次
let cachedSettings = null
let cachePromise = null

const LS_KEY = 'reader-settings-unsaved'

/**
 * 阅读器设置 hook
 * - 首次调用从数据库加载，存入模块缓存
 * - 后续调用直接使用缓存
 * - 修改时先更新缓存，退出时同步到数据库
 * - beforeunload 时写入 localStorage 防止标签页关闭丢数据
 */
export function useReaderSettings() {
  const [settings, setSettings] = useState(cachedSettings || DEFAULTS)
  const dirtyRef = useRef(false)

  // 首次加载 + 检查 localStorage 是否有上次未保存的数据
  useEffect(() => {
    let cancelled = false
    if (cachedSettings) return
    // 尝试从 localStorage 恢复（beforeunload 应急备份）
    if (!cachePromise) {
      cachePromise = (async () => {
        const fallback = (() => { try { const v = localStorage.getItem(LS_KEY); return v ? JSON.parse(v) : null } catch { return null } })()
        if (fallback) { localStorage.removeItem(LS_KEY); cachedSettings = { ...DEFAULTS, ...fallback }; dirtyRef.current = true; return cachedSettings }
        const data = await fetchReaderSettings()
        if (data) cachedSettings = { ...DEFAULTS, ...data }
        else cachedSettings = { ...DEFAULTS }
        return cachedSettings
      })()
    }
    cachePromise.then(s => { if (!cancelled) setSettings(s) })
    return () => { cancelled = true }
  }, [])

  // 修改单个设置（立即更新缓存 + 状态）
  const updateSetting = useCallback((key, value) => {
    setSettings(prev => {
      const next = { ...prev, [key]: value }
      cachedSettings = next
      dirtyRef.current = true
      return next
    })
  }, [])

  // 批量更新（例如从持久化恢复时）
  const updateSettings = useCallback((patch) => {
    setSettings(prev => {
      const next = { ...prev, ...patch }
      cachedSettings = next
      dirtyRef.current = true
      return next
    })
  }, [])

  // 写入数据库
  const flush = useCallback(() => {
    if (dirtyRef.current && cachedSettings) {
      dirtyRef.current = false
      saveReaderSettings(cachedSettings).catch(() => {})
    }
  }, [])

  // 标签页关闭/刷新时：localStorage 应急备份（XHR 可能被取消）
  useEffect(() => {
    const onUnload = () => {
      if (dirtyRef.current && cachedSettings) {
        try { localStorage.setItem(LS_KEY, JSON.stringify(cachedSettings)) } catch {}
      }
    }
    window.addEventListener('beforeunload', onUnload)
    return () => window.removeEventListener('beforeunload', onUnload)
  }, [])

  // React Router 导航离开时：flush 到数据库
  useEffect(() => {
    return () => { flush() }
  }, [flush])

  return { settings, updateSetting, updateSettings, flush }
}
