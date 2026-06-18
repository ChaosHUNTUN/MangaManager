import { useState, useEffect } from 'react'
import { fetchAlbumDetail, updateAlbum } from '../api'

/**
 * 专辑编辑弹窗
 * - 查看/编辑专辑名称
 * - 查看/编辑专辑颜色（预设调色板 + 自定义 hex）
 * - 查看专辑关联标签及翻译（只读）
 * - 查看创建时间（只读）
 */
const ALBUM_PALETTE = [
  '#ef4444', '#f97316', '#f59e0b', '#eab308', '#84cc16', '#22c55e',
  '#10b981', '#14b8a6', '#06b6d4', '#0ea5e9', '#3b82f6', '#6366f1',
  '#8b5cf6', '#a855f7', '#d946ef', '#ec4899', '#f43f5e', '#fb923c',
  '#facc15', '#a3e635', '#34d399', '#2dd4bf', '#38bdf8', '#818cf8'
]

export default function AlbumEditModal({ albumKey, albumConfig, onClose, onUpdated }) {
  const [loading, setLoading] = useState(true)
  const [detail, setDetail] = useState(null)
  const [saving, setSaving] = useState(false)

  // 编辑字段
  const [editName, setEditName] = useState('')
  const [editColor, setEditColor] = useState('')

  useEffect(() => {
    (async () => {
      setLoading(true)
      const data = await fetchAlbumDetail(albumKey)
      if (data) {
        setDetail(data)
        setEditName(data.name || albumKey)
        setEditColor(data.color || '#7c3aed')
      } else {
        // 降级：用本地 albumConfig
        const local = albumConfig[albumKey]
        setDetail({
          key: albumKey,
          name: local?.name || albumKey,
          color: local?.color || '#7c3aed',
          gidCount: local?.gids?.length || 0,
          createdAt: local?.createdAt || null,
          updatedAt: local?.updatedAt || null,
          keyTag: null
        })
        setEditName(local?.name || albumKey)
        setEditColor(local?.color || '#7c3aed')
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
    } catch (e) {
      // 失败时保留弹窗，用户可重试
      setSaving(false)
    }
  }

  const formatTime = (iso) => {
    if (!iso) return '未知'
    try { return new Date(iso).toLocaleString('zh-CN') } catch { return iso }
  }

  const hasChanges = editName.trim() !== (detail?.name || albumKey) || editColor !== (detail?.color || '#7c3aed')

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 520, maxHeight: '85vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
        {loading ? (
          <div style={{ padding: 30, textAlign: 'center', color: '#888' }}>加载中...</div>
        ) : (
          <>
            {/* 标题栏 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              <span style={{
                width: 14, height: 14, borderRadius: '50%',
                background: editColor, flexShrink: 0,
                boxShadow: `0 0 6px ${editColor}40`
              }} />
              <h3 style={{ margin: 0, fontSize: '1rem', color: '#e0e0e0', flex: 1 }}>
                📁 编辑专辑
              </h3>
              <button className="btn-sm" onClick={onClose}
                style={{ borderColor: '#444', color: '#888', padding: '2px 8px' }}>✕</button>
            </div>

            {/* 名称编辑 */}
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: '0.75rem', color: '#aaa', display: 'block', marginBottom: 4 }}>专辑名称</label>
              <input type="text" value={editName}
                onChange={e => setEditName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleSave() }}
                style={{
                  width: '100%', padding: '8px 12px', borderRadius: 8,
                  border: `1px solid ${editName.trim() !== (detail?.name || albumKey) ? '#f59e0b' : '#2a2a4a'}`,
                  background: '#0f0f1a', color: '#e0e0e0', fontSize: '0.9rem',
                  outline: 'none', boxSizing: 'border-box'
                }}
                placeholder="专辑名称" />
            </div>

            {/* 颜色选择器 */}
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: '0.75rem', color: '#aaa', display: 'block', marginBottom: 6 }}>专辑颜色</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 8 }}>
                {ALBUM_PALETTE.map(c => (
                  <div key={c}
                    onClick={() => setEditColor(c)}
                    style={{
                      width: 24, height: 24, borderRadius: 6,
                      background: c, cursor: 'pointer',
                      border: editColor === c ? '2px solid #fff' : '2px solid transparent',
                      boxShadow: editColor === c ? `0 0 8px ${c}60` : 'none',
                      transition: 'all 0.15s',
                      transform: editColor === c ? 'scale(1.15)' : 'scale(1)'
                    }}
                    title={c}
                  />
                ))}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: '0.7rem', color: '#666' }}>自定义:</span>
                <input type="color" value={editColor}
                  onChange={e => setEditColor(e.target.value)}
                  style={{ width: 32, height: 28, border: 'none', borderRadius: 4, cursor: 'pointer', background: 'transparent' }} />
                <input type="text" value={editColor}
                  onChange={e => {
                    const v = e.target.value
                    if (v.startsWith('#') && v.length <= 7) setEditColor(v)
                  }}
                  style={{
                    width: 80, padding: '4px 8px', borderRadius: 4,
                    border: '1px solid #2a2a4a', background: '#0f0f1a',
                    color: '#ccc', fontSize: '0.75rem', outline: 'none'
                  }}
                  placeholder="#RRGGBB" />
              </div>
            </div>

            {/* 基本信息 */}
            <div style={{
              background: '#0d0d1a', borderRadius: 8, border: '1px solid #1e1e3a',
              padding: 10, marginBottom: 14, display: 'flex', gap: 20, flexWrap: 'wrap'
            }}>
              <div>
                <div style={{ fontSize: '0.65rem', color: '#666', marginBottom: 2 }}>作品数量</div>
                <div style={{ fontSize: '0.85rem', color: '#ccc', fontWeight: 600 }}>{detail?.gidCount ?? 0}</div>
              </div>
              <div>
                <div style={{ fontSize: '0.65rem', color: '#666', marginBottom: 2 }}>创建时间</div>
                <div style={{ fontSize: '0.78rem', color: '#888' }}>{formatTime(detail?.createdAt)}</div>
              </div>
              <div>
                <div style={{ fontSize: '0.65rem', color: '#666', marginBottom: 2 }}>最后更新</div>
                <div style={{ fontSize: '0.78rem', color: '#888' }}>{formatTime(detail?.updatedAt)}</div>
              </div>
            </div>

            {/* 关键标签（只读） */}
            {detail?.keyTag ? (
              <div style={{ marginBottom: 14 }}>
                <label style={{ fontSize: '0.75rem', color: '#aaa', display: 'block', marginBottom: 6 }}>
                  🏷 关键标签
                </label>
                <div style={{
                  background: '#0d0d1a', borderRadius: 8, border: '1px solid #1e1e3a',
                  padding: 10
                }}>
                  <div style={{ fontSize: '0.68rem', color: '#a78bfa', fontWeight: 600, marginBottom: 4 }}>
                    {detail.keyTag.nsCn || detail.keyTag.ns}
                  </div>
                  <div style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    padding: '4px 12px', borderRadius: 6,
                    background: '#1a1a2e', border: '1px solid #2a2a4a',
                    fontSize: '0.82rem', color: '#e0e0e0'
                  }}>
                    <span style={{ fontWeight: 600 }}>{detail.keyTag.tag}</span>
                    {detail.keyTag.cn && detail.keyTag.cn !== detail.keyTag.tag && (
                      <span style={{ color: '#888', fontSize: '0.7rem' }}>
                        {detail.keyTag.cn}
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: '0.62rem', color: '#555', marginTop: 4 }}>
                    匹配规则: {detail.keyTag.ns}:{detail.keyTag.tag}
                  </div>
                </div>
              </div>
            ) : (
              <div style={{
                marginBottom: 14, padding: 12, textAlign: 'center',
                color: '#555', fontSize: '0.75rem', background: '#0d0d1a',
                borderRadius: 8, border: '1px solid #1e1e3a'
              }}>
                🏷 关键标签：<span style={{ color: '#ccc', fontFamily: 'monospace' }}>{albumKey}</span>
                <div style={{ marginTop: 4, fontSize: '0.62rem' }}>（未找到标签翻译信息）</div>
              </div>
            )}

            {/* 操作按钮 */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
              <button className="btn-sm" onClick={onClose}
                style={{ borderColor: '#444', color: '#888' }}>取消</button>
              <button className="btn-sm" onClick={handleSave}
                disabled={saving || !hasChanges}
                style={{
                  borderColor: hasChanges ? '#10b981' : '#333',
                  color: hasChanges ? '#6ee7b7' : '#555',
                  cursor: hasChanges ? 'pointer' : 'not-allowed'
                }}>
                {saving ? '保存中...' : '💾 保存'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
