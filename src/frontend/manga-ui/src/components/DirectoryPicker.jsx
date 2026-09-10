import { useState, useEffect, useCallback } from 'react'
import { fetchDrives, fetchDirectory } from '../api'
import { Folder, HardDrive, ArrowUp, Check, X, AlertCircle } from 'lucide-react'

/**
 * 目录选择器（模态）——浏览驱动器与子目录，选定后回调绝对路径。
 * 依赖后端 /api/filesystem/drives 与 /api/filesystem/dirs。
 */
export default function DirectoryPicker({ open, title = '选择目录', hint = '', initialPath = '', onSelect, onClose }) {
  const [path, setPath] = useState(initialPath || '')
  const [items, setItems] = useState([])
  const [parent, setParent] = useState(null)
  const [hasImages, setHasImages] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async (p) => {
    setLoading(true); setError('')
    try {
      if (!p) {
        const drives = await fetchDrives()
        setItems((drives || []).map(d => ({ name: d.name, path: d.path, isDir: true })))
        setParent(null); setHasImages(false)
      } else {
        const data = await fetchDirectory(p)
        setItems((data?.directories || []).map(d => ({
          name: d.name, path: d.path, isDir: true, hasImages: !!d.hasImages
        })))
        setParent(data?.parent || null)
        setHasImages(!!data?.hasImages)
      }
    } catch (e) {
      setError(e.message || '目录读取失败')
      setItems([])
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    if (!open) return
    setPath(initialPath || '')
    load(initialPath || '')
  }, [open, initialPath, load])

  if (!open) return null

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.55)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: 'var(--glass-bg)', backdropFilter: 'blur(20px) saturate(1.2)',
        border: '1px solid var(--glass-border)', borderRadius: 'var(--radius-lg)',
        width: 'min(560px, 100%)', maxHeight: '80dvh', display: 'flex', flexDirection: 'column',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04)',
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '12px 16px', borderBottom: '1px solid var(--divider)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 'var(--text-sm)', fontWeight: 600 }}>
            <Folder size={15} /> {title}
          </div>
          <button className="btn-sm" onClick={onClose} style={{ padding: '2px 6px' }}><X size={13} /></button>
        </div>

        {hint && (
          <div style={{ padding: '8px 16px', fontSize: 'var(--text-2xs)', color: 'var(--text-muted)', borderBottom: '1px solid var(--divider)' }}>
            {hint}
          </div>
        )}

        <div style={{
          display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px',
          borderBottom: '1px solid var(--divider)', flexShrink: 0,
        }}>
          <button className="btn-sm" disabled={!path} onClick={() => { const p = parent; setPath(p || ''); load(p || '') }}
            style={{ whiteSpace: 'nowrap' }}>
            <ArrowUp size={12} /> 上级
          </button>
          <div style={{
            flex: 1, minWidth: 0, fontSize: 'var(--text-2xs)', fontFamily: 'var(--font-mono)',
            color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }} title={path || '此电脑'}>
            {path || '此电脑（选择驱动器）'}
          </div>
          {hasImages && (
            <span title="该目录直接包含图片文件" style={{ fontSize: 'var(--text-3xs)', color: 'var(--warning)', whiteSpace: 'nowrap' }}>
              <AlertCircle size={11} /> 含图片
            </span>
          )}
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: 8, minHeight: 120 }}>
          {loading && <div style={{ padding: 12, fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>读取中…</div>}
          {!loading && error && (
            <div style={{ padding: 12, fontSize: 'var(--text-xs)', color: 'var(--error)' }}>{error}</div>
          )}
          {!loading && !error && items.length === 0 && (
            <div style={{ padding: 12, fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>没有可进入的子目录</div>
          )}
          {!loading && items.map(it => (
            <div key={it.path} style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '7px 8px',
              borderRadius: 'var(--radius-xs)', cursor: 'pointer',
            }}
              onMouseEnter={e => { e.currentTarget.style.background = 'var(--surface-hover)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}>
              <button className="btn-sm" style={{ padding: '2px 6px', border: 'none', background: 'transparent', flex: 1, minWidth: 0, justifyContent: 'flex-start', textAlign: 'left' }}
                onClick={() => { setPath(it.path); load(it.path) }} title={it.path}>
                {path ? <Folder size={13} /> : <HardDrive size={13} />}
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.name}</span>
                {it.hasImages && <span title="含图片文件" style={{ color: 'var(--warning)', flexShrink: 0 }}>●</span>}
              </button>
            </div>
          ))}
        </div>

        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
          padding: '12px 16px', borderTop: '1px solid var(--divider)', flexShrink: 0,
        }}>
          <span style={{ fontSize: 'var(--text-3xs)', color: 'var(--text-muted)' }}>
            提示：库根目录应为「每个作品一个子文件夹」的父目录
          </span>
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="btn-sm" onClick={onClose}>取消</button>
            <button className="btn-sm" disabled={!path}
              onClick={() => onSelect?.(path)}
              style={{ borderColor: 'var(--accent-border)', color: 'var(--accent)' }}>
              <Check size={13} /> 选择此目录
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
