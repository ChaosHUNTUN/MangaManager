import { useState, useEffect } from 'react'
import { FolderOpen, Tag, Save } from 'lucide-react'
import { fetchAlbumDetail, updateAlbum } from '../api'

/**
 * 专辑编辑弹窗 — 所有颜色使用 tokens.css 变量
 * ALBUM_PALETTE 是用户可选的颜色选择器, 独立于主题
 */
const ALBUM_PALETTE = [
  '#ef4444', '#f97316', '#f59e0b', '#eab308', '#84cc16', '#22c55e',
  '#10b981', '#14b8a6', '#06b6d4', '#0ea5e9', '#3b82f6', '#6366f1',
  '#8b5cf6', '#a855f7', '#d946ef', '#ec4899', '#f43f5e', '#fb923c',
  '#facc15', '#a3e635', '#34d399', '#2dd4bf', '#38bdf8', '#818cf8'
]

// 颜色映射表 (主题感知)
const T = {
  textPrimary: 'var(--text-primary)',
  textSecondary: 'var(--text-secondary)',
  textMuted: 'var(--text-muted)',
  textDim: 'var(--text-dim)',
  canvas: 'var(--canvas)',
  surface: 'var(--surface)',
  surfaceHigh: 'var(--surface-high)',
  surfaceInput: 'var(--surface-input)',
  borderCard: 'var(--border-card)',
  divider: 'var(--divider)',
  accent: 'var(--accent)',
  warning: 'var(--warning)',
  success: 'var(--success)',
}

export default function AlbumEditModal({ albumKey, albumConfig, onClose, onUpdated }) {
  const [loading, setLoading] = useState(true)
  const [detail, setDetail] = useState(null)
  const [saving, setSaving] = useState(false)
  const [editName, setEditName] = useState('')
  const [editColor, setEditColor] = useState('')
  const DEFAULT_COLOR = '#7c3aed'

  useEffect(() => {
    (async () => {
      setLoading(true)
      const data = await fetchAlbumDetail(albumKey)
      if (data) {
        setDetail(data)
        setEditName(data.name || albumKey)
        setEditColor(data.color || DEFAULT_COLOR)
      } else {
        const local = albumConfig[albumKey]
        setDetail({
          key: albumKey, name: local?.name || albumKey,
          color: local?.color || DEFAULT_COLOR,
          gidCount: local?.gids?.length || 0,
          createdAt: local?.createdAt || null,
          updatedAt: local?.updatedAt || null,
          keyTag: null
        })
        setEditName(local?.name || albumKey)
        setEditColor(local?.color || DEFAULT_COLOR)
      }
      setLoading(false)
    })()
  }, [albumKey])

  const handleSave = async () => {
    const name = editName.trim()
    if (!name) return
    setSaving(true)
    try {
      await updateAlbum(albumKey, { name, color: editColor })
      onUpdated?.(albumKey, { name, color: editColor })
      onClose()
    } catch (e) { setSaving(false) }
  }

  const formatTime = (iso) => {
    if (!iso) return '未知'
    try { return new Date(iso).toLocaleString('zh-CN') } catch { return iso }
  }

  const hasChanges = editName.trim() !== (detail?.name || albumKey) || editColor !== (detail?.color || DEFAULT_COLOR)

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 520, maxHeight: '85vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
        {loading ? (
          <div style={{ padding: 30, textAlign: 'center', color: T.textMuted }}>加载中...</div>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              <span style={{ width: 14, height: 14, borderRadius: '50%', background: editColor, flexShrink: 0, boxShadow: `0 0 6px ${editColor}40` }} />
              <h3 style={{ margin: 0, fontSize: '1rem', color: T.textPrimary, flex: 1 }}>
                <FolderOpen size={14} /> 编辑专辑
              </h3>
              <button className="btn-sm" onClick={onClose} style={{ borderColor: T.divider, color: T.textMuted, padding: '2px 8px' }}>✕</button>
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: '0.75rem', color: T.textSecondary, display: 'block', marginBottom: 4 }}>专辑名称</label>
              <input type="text" value={editName} onChange={e => setEditName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') handleSave() }}
                style={{ width: '100%', padding: '8px 12px', borderRadius: 8,
                  border: `1px solid ${editName.trim() !== (detail?.name || albumKey) ? T.warning : T.borderCard}`,
                  background: T.surfaceInput, color: T.textPrimary, fontSize: '0.9rem', outline: 'none', boxSizing: 'border-box' }}
                placeholder="专辑名称" />
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: '0.75rem', color: T.textSecondary, display: 'block', marginBottom: 6 }}>专辑颜色</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 8 }}>
                {ALBUM_PALETTE.map(c => (
                  <div key={c} onClick={() => setEditColor(c)}
                    style={{ width: 24, height: 24, borderRadius: 6, background: c, cursor: 'pointer',
                      border: editColor === c ? `2px solid ${T.canvas}` : '2px solid transparent',
                      boxShadow: editColor === c ? `0 0 8px ${c}60` : 'none',
                      transition: 'all 0.15s',
                      transform: editColor === c ? 'scale(1.15)' : 'scale(1)' }}
                    title={c} />
                ))}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: '0.7rem', color: T.textDim }}>自定义:</span>
                <input type="color" value={editColor} onChange={e => setEditColor(e.target.value)}
                  style={{ width: 32, height: 28, border: 'none', borderRadius: 4, cursor: 'pointer', background: 'transparent' }} />
                <input type="text" value={editColor}
                  onChange={e => { const v = e.target.value; if (v.startsWith('#') && v.length <= 7) setEditColor(v) }}
                  style={{ width: 80, padding: '4px 8px', borderRadius: 4,
                    border: `1px solid ${T.borderCard}`, background: T.surfaceInput,
                    color: T.textPrimary, fontSize: '0.75rem', outline: 'none' }} placeholder="#RRGGBB" />
              </div>
            </div>

            <div style={{ background: T.canvas, borderRadius: 8, border: `1px solid ${T.surfaceHigh}`,
              padding: 10, marginBottom: 14, display: 'flex', gap: 20, flexWrap: 'wrap' }}>
              <div><div style={{ fontSize: '0.65rem', color: T.textDim, marginBottom: 2 }}>作品数量</div>
                <div style={{ fontSize: '0.85rem', color: T.textPrimary, fontWeight: 600 }}>{detail?.gidCount ?? 0}</div></div>
              <div><div style={{ fontSize: '0.65rem', color: T.textDim, marginBottom: 2 }}>创建时间</div>
                <div style={{ fontSize: '0.78rem', color: T.textMuted }}>{formatTime(detail?.createdAt)}</div></div>
              <div><div style={{ fontSize: '0.65rem', color: T.textDim, marginBottom: 2 }}>最后更新</div>
                <div style={{ fontSize: '0.78rem', color: T.textMuted }}>{formatTime(detail?.updatedAt)}</div></div>
            </div>

            {detail?.keyTag ? (
              <div style={{ marginBottom: 14 }}>
                <label style={{ fontSize: '0.75rem', color: T.textSecondary, display: 'block', marginBottom: 6 }}>
                  <Tag size={12} /> 关键标签
                </label>
                <div style={{ background: T.canvas, borderRadius: 8, border: `1px solid ${T.surfaceHigh}`, padding: 10 }}>
                  <div style={{ fontSize: '0.68rem', color: T.accent, fontWeight: 600, marginBottom: 4 }}>
                    {detail.keyTag.nsCn || detail.keyTag.ns}
                  </div>
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 12px', borderRadius: 6,
                    background: T.surface, border: `1px solid ${T.borderCard}`, fontSize: '0.82rem', color: T.textPrimary }}>
                    <span style={{ fontWeight: 600 }}>{detail.keyTag.tag}</span>
                    {detail.keyTag.cn && detail.keyTag.cn !== detail.keyTag.tag && (
                      <span style={{ color: T.textMuted, fontSize: '0.7rem' }}>{detail.keyTag.cn}</span>)}
                  </div>
                  <div style={{ fontSize: '0.62rem', color: T.textDim, marginTop: 4 }}>
                    匹配规则: {detail.keyTag.ns}:{detail.keyTag.tag}
                  </div>
                </div>
              </div>
            ) : (
              <div style={{ marginBottom: 14, padding: 12, textAlign: 'center',
                color: T.textDim, fontSize: '0.75rem', background: T.canvas,
                borderRadius: 8, border: `1px solid ${T.surfaceHigh}` }}>
                <Tag size={12} /> 关键标签：<span style={{ color: T.textPrimary, fontFamily: 'monospace' }}>{albumKey}</span>
                <div style={{ marginTop: 4, fontSize: '0.62rem' }}>（未找到标签翻译信息）</div>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
              <button className="btn-sm" onClick={onClose} style={{ borderColor: T.divider, color: T.textMuted }}>取消</button>
              <button className="btn-sm" onClick={handleSave} disabled={saving || !hasChanges}
                style={{ borderColor: hasChanges ? T.success : T.divider,
                  color: hasChanges ? T.success : T.textDim,
                  cursor: hasChanges ? 'pointer' : 'not-allowed' }}>
                {saving ? '保存中...' : <><Save size={13} /> 保存</>}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
