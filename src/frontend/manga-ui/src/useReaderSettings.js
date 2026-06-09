import { useState, useEffect, useCallback, useRef } from 'react'
import { fetchReaderSettings, saveReaderSettings } from './api'

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

/**
 * 阅读器设置 hook
 * - 首次调用从数据库加载，存入模块缓存
 * - 后续调用直接使用缓存
 * - 修改时先更新缓存，退出时同步到数据库
 */
export function useReaderSettings() {
  const [settings, setSettings] = useState(cachedSettings || DEFAULTS)
  const dirtyRef = useRef(false)

  // 首次加载
  useEffect(() => {
    if (cachedSettings) return
    if (!cachePromise) {
      cachePromise = fetchReaderSettings().then(data => {
        if (data) cachedSettings = { ...DEFAULTS, ...data }
        else cachedSettings = { ...DEFAULTS }
        return cachedSettings
      })
    }
    cachePromise.then(s => setSettings(s))
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

  // 退出时同步到数据库
  const flush = useCallback(() => {
    if (dirtyRef.current && cachedSettings) {
      dirtyRef.current = false
      saveReaderSettings(cachedSettings)
    }
  }, [])

  // 页面关闭/刷新时自动保存
  useEffect(() => {
    const onUnload = () => { if (dirtyRef.current && cachedSettings) saveReaderSettings(cachedSettings) }
    window.addEventListener('beforeunload', onUnload)
    return () => window.removeEventListener('beforeunload', onUnload)
  }, [])

  // 导航离开时保存（React Router）
  useEffect(() => {
    return () => { flush() }
  }, [])

  return { settings, updateSetting, updateSettings, flush }
}
