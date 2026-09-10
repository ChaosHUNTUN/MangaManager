import { useState, useEffect, useCallback } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Folder, AlertCircle, Settings as SettingsIcon } from 'lucide-react'
import { fetchAppSettings, saveAppSettings } from '../api'
import DirectoryPicker from './DirectoryPicker'

const DISMISS_KEY = 'mm-setup-dismissed'

/**
 * 首次配置引导：后端未检测到用户设置的库目录时弹出，引导选择目录并保存。
 * 已配置且目录可访问时不打扰；本次会话内可「暂不设置」。
 */
export default function FirstRunSetup() {
  const { pathname } = useLocation()
  const [state, setState] = useState(null)
  const [dismissed, setDismissed] = useState(() => sessionStorage.getItem(DISMISS_KEY) === '1')
  const [pickerOpen, setPickerOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    try { setState(await fetchAppSettings()) } catch { setState(null) }
  }, [])

  useEffect(() => { load() }, [load])

  const pick = async (dir) => {
    setPickerOpen(false)
    setSaving(true); setError('')
    try {
      await saveAppSettings({ downloadDir: dir, rescan: true })
      await load()
    } catch (e) { setError(e.message) }
    setSaving(false)
  }

  const dismiss = () => {
    sessionStorage.setItem(DISMISS_KEY, '1')
    setDismissed(true)
  }

  // 阅读器（全屏）与设置页自身不打扰
  if (pathname.startsWith('/reader') || pathname.startsWith('/settings')) return null
  // 尚未加载完成 / 已忽略 / 已配置且目录可用 → 不显示
  if (dismissed || !state) return null
  if (state.downloadDirConfigured && state.downloadDirExists) return null

  return (
    <>
      <div style={{
        position: 'fixed', inset: 0, zIndex: 150, background: 'rgba(0,0,0,0.6)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
      }}>
        <div style={{
          background: 'var(--glass-bg)', backdropFilter: 'blur(20px) saturate(1.2)',
          border: '1px solid var(--glass-border)', borderRadius: 'var(--radius-lg)',
          width: 'min(520px, 100%)', padding: 'var(--space-5)',
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <Folder size={18} />
            <h2 style={{ fontSize: 'var(--text-md)', fontWeight: 600, margin: 0 }}>指定你的画廊目录</h2>
          </div>

          <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', lineHeight: 1.7, marginTop: 0 }}>
            还没有检测到你设置的库目录。指定一个「每个作品一个子文件夹」的根目录后，
            本地画廊就能扫描、阅读与管理其中的作品。
          </p>

          {!state.downloadDirConfigured && state.fallbackDownloadDir && (
            <p style={{ fontSize: 'var(--text-2xs)', color: 'var(--warning)', display: 'flex', gap: 6, alignItems: 'flex-start' }}>
              <AlertCircle size={13} style={{ flexShrink: 0, marginTop: 2 }} />
              <span>当前未配置，使用内置默认路径：<code>{state.fallbackDownloadDir}</code>（位于程序目录下，重建/清理时容易丢失）</span>
            </p>
          )}
          {state.downloadDirConfigured && !state.downloadDirExists && (
            <p style={{ fontSize: 'var(--text-2xs)', color: 'var(--error)' }}>
              已配置的目录当前不可访问：<code>{state.downloadDir}</code>
            </p>
          )}
          {error && <p style={{ fontSize: 'var(--text-2xs)', color: 'var(--error)' }}>{error}</p>}

          <div style={{ display: 'flex', gap: 8, marginTop: 'var(--space-4)', flexWrap: 'wrap' }}>
            <button className="btn-sm" onClick={() => setPickerOpen(true)} disabled={saving}
              style={{ borderColor: 'var(--accent-border)', color: 'var(--accent)' }}>
              <Folder size={13} /> {saving ? '保存中…' : '选择目录'}
            </button>
            <button className="btn-sm" onClick={dismiss}>暂不设置</button>
            <Link to="/settings" className="btn-sm" onClick={dismiss}
              style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <SettingsIcon size={13} /> 前往设置页
            </Link>
          </div>
        </div>
      </div>

      <DirectoryPicker
        open={pickerOpen}
        title="选择画廊目录"
        hint="选中「每个作品一个子文件夹」的父目录；选定后会立即保存并后台扫描。"
        onSelect={pick}
        onClose={() => setPickerOpen(false)}
      />
    </>
  )
}
