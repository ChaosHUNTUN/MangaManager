import { useMemo, useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ExternalLink, BookOpen, Globe, FolderOpen, Edit3 } from 'lucide-react'
import { getLocalCoverUrl } from '../api'
import { getCategoryColorDetail } from '../constants/colors'
import { formatSize } from '../utils/format'
import { fetchWorkTags, removeWorkTag } from '../api/work'
import TagPicker from './TagPicker'
import { FEATURES } from '../config'
const getCategoryColor = getCategoryColorDetail

/**
 * 画廊详情弹窗
 */
export default function GalleryDetail({ detail, tagTranslations, nsTranslations, filtered, albumConfig, galleries, onClose, onEditTags, onAddToAlbum }) {
  const [workTags, setWorkTags] = useState(null)
  const [pickerOpen, setPickerOpen] = useState(false)

  const loadWorkTags = useCallback(async (gid) => {
    try { setWorkTags(await fetchWorkTags(gid)) } catch { }
  }, [])

  useEffect(() => {
    if (!detail?.gid) return
    setWorkTags(null)
    loadWorkTags(detail.gid)
  }, [detail?.gid, loadWorkTags])

  // 注意：早退必须放在所有 Hook 之后（下面 useMemo/useCallback 数量固定），
  // 否则 detail 由空转非空时 Hook 数量变化会触发 React 报错
  const inCustomAlbum = useMemo(() => {
    if (!albumConfig || !detail) return false
    return Object.values(albumConfig).some(v => (v.gids || []).includes(detail.gid))
  }, [albumConfig, detail])

  // 计算匹配的专辑（KeyTag 或 title 模糊匹配）
  const matchedAlbums = useMemo(() => {
    if (!albumConfig || !detail) return []
    const tags = (detail.tags || []).map(t => typeof t === 'string' ? t : t.tag || '').filter(Boolean)
    return Object.entries(albumConfig)
      .filter(([key]) => {
        if (key.includes(':')) {
          // KeyTag 精确匹配
          return tags.some(t => t.toLowerCase() === key.split(':')[1]?.toLowerCase())
        }
        return tags.some(t => t.toLowerCase() === key.toLowerCase())
      })
      .map(([key, val]) => ({ key, name: val.name || key, count: (val.gids || []).length }))
  }, [albumConfig, detail, galleries])

  const handleOpenReader = useCallback(() => {
    try { sessionStorage.setItem('reader-local-context', JSON.stringify({ gids: filtered.map(g => g.gid) })) } catch { }
  }, [filtered])

  const handleAddToAlbum = useCallback(() => {
    onAddToAlbum?.({ gid: detail.gid, title: detail.title, tags: detail.tags || [], matchedAlbums: matchedAlbums })
  }, [detail, onAddToAlbum, matchedAlbums])

  const handleRemoveTag = async (tagId) => {
    try {
      await removeWorkTag(detail.gid, tagId)
      await loadWorkTags(detail.gid)
    } catch { }
  }

  if (!detail) return null

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal" style={{ maxWidth: 'min(640px, 90vw)', maxHeight: '85vh', overflowY: 'auto', padding: 0 }}>
        <div style={{ position: 'relative', background: 'linear-gradient(180deg, var(--surface-elevated) 0%, var(--canvas) 100%)', padding: '20px 24px 16px', borderBottom: '1px solid var(--border-card)' }}>
          <button className="btn-sm" onClick={onClose} style={{ position: 'absolute', top: 10, right: 10, border: 'none', color: 'var(--text-muted)', fontSize: '1.1rem' }}>✕</button>
          <div className="detail-header-layout" style={{ display: 'flex', gap: 16 }}>
            <div style={{ flexShrink: 0, width: 140, borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border-card)', background: 'var(--surface)' }}><img src={getLocalCoverUrl(detail.gid, detail.lastModified)} alt="" style={{ width: '100%', display: 'block' }} /></div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <h3 title={detail.title} style={{ margin: '0 0 4px', fontSize: '1rem', lineHeight: 1.4, color: 'var(--text-primary)', fontWeight: 600 }}>{detail.title}</h3>
              {detail.titleJpn && <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: 8 }}>{detail.titleJpn}</div>}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                <span style={{ padding: '2px 10px', borderRadius: 10, fontSize: '0.72rem', fontWeight: 600, background: getCategoryColor(detail.category), color: 'var(--canvas)' }}>{detail.category}</span>
                {detail.language && <span style={{ padding: '2px 10px', borderRadius: 10, fontSize: '0.72rem', background: 'var(--surface-elevated)', color: 'var(--text-secondary)' }}>{detail.language}</span>}
                {detail.favoriteCount > 0 && <span style={{ padding: '2px 10px', borderRadius: 10, fontSize: '0.72rem', background: 'var(--warning-bg)', color: 'var(--warning)', border: '1px solid var(--warning-border)' }}>♥ {detail.favoriteCount}</span>}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>
                {detail.uploader && <div>上传者: <span style={{ color: 'var(--accent)' }}>{detail.uploader}</span></div>}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>GID: {detail.gid} · {detail.fileCount} 页 · {formatSize(detail.totalSize)}<Link to={`/ehentai?open=${detail.gid}${detail.token ? '_' + detail.token : ''}`} onClick={onClose} style={{ fontSize: '0.68rem', color: 'var(--accent)', textDecoration: 'none', padding: '1px 8px', borderRadius: 8, border: '1px solid var(--accent-border)', background: 'var(--accent-bg)' }} title="在线详情"><ExternalLink size={12} /> 在线详情</Link></div>
              </div>
            </div>
          </div>
        </div>
        <div style={{ padding: '12px 24px', borderBottom: '1px solid var(--border-section)', display: 'flex', gap: 24, flexWrap: 'wrap' }}>
          {[{ label: '页数', value: detail.fileCount }, { label: '大小', value: formatSize(detail.totalSize) }, { label: '评分', value: detail.rating !== '0' ? `${detail.rating}${detail.ratingCount > 0 ? ` (${detail.ratingCount})` : ''}` : '-' }, { label: '语言', value: detail.language || '-' }].map((m, i) => (
            <div key={i} style={{ textAlign: 'center', minWidth: 50 }}><div style={{ fontSize: '0.65rem', color: 'var(--text-dim)', textTransform: 'uppercase', marginBottom: 2 }}>{m.label}</div><div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>{m.value}</div></div>
          ))}
        </div>
        {detail.tagGroups?.length > 0 && (
          <div style={{ padding: '12px 24px', borderBottom: '1px solid var(--border-section)' }}>
            {detail.tagGroups.map((grp, gi) => (
              <div key={gi} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 8 }}>
                <span style={{ flexShrink: 0, padding: '2px 10px', borderRadius: 4, background: 'var(--accent-bg)', color: 'var(--accent)', fontSize: '0.7rem', fontWeight: 600, lineHeight: '20px', marginTop: 2 }}>{nsTranslations[grp.namespace] || grp.namespace}</span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, flex: 1 }}>{grp.tags.map((t, ti) => <span key={ti} title={t} style={{ padding: '2px 10px', borderRadius: 4, background: 'var(--surface-elevated)', color: 'var(--text-primary)', fontSize: '0.72rem', border: '1px solid var(--border-card)' }}>{tagTranslations[`${grp.namespace}:${t}`] || t}</span>)}</div>
              </div>
            ))}
          </div>
        )}
        {/* 作品标签（work_tag 系统，可管理） */}
        <div style={{ padding: '12px 24px', borderBottom: '1px solid var(--border-section)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>标签</span>
            <button className="btn-sm" onClick={() => setPickerOpen(true)}
              style={{ borderColor: 'var(--accent-border)', color: 'var(--accent)' }}>+ 添加</button>
          </div>
          {workTags && workTags.length > 0 ? (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
              {workTags.map(t => (
                <span key={t.id} title={`${t.namespace}:${t.name}`}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 999, fontSize: '0.72rem', background: 'var(--accent-bg)', border: '1px solid var(--accent-border)', color: 'var(--text-secondary)' }}>
                  {t.nameCn || t.name}
                  <span onClick={() => handleRemoveTag(t.id)} style={{ cursor: 'pointer', opacity: 0.6, fontSize: '0.68rem' }}>✕</span>
                </span>
              ))}
            </div>
          ) : (
            <span style={{ fontSize: '0.7rem', color: 'var(--text-dim)' }}>暂无标签</span>
          )}
        </div>
        <div style={{ padding: '14px 24px', display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Link to={`/reader-local/${detail.gid}`} onClick={handleOpenReader} className="btn-sm" style={{ textDecoration: 'none', borderColor: 'var(--success)', color: 'var(--success)' }}><BookOpen size={13} /> 在线阅读</Link>
            {detail.token && <a href={`https://${detail.isExhentai ? 'exhentai' : 'e-hentai'}.org/g/${detail.gid}/${detail.token}/`} target="_blank" rel="noreferrer" className="btn-sm" style={{ textDecoration: 'none', color: 'var(--accent)', borderColor: 'var(--accent)' }}><Globe size={13} /> 在 {detail.isExhentai ? 'ExHentai' : 'E-Hentai'} 查看</a>}
            {FEATURES.enableAlbums && !inCustomAlbum && (
              <button className="btn-sm" onClick={handleAddToAlbum} style={{ borderColor: 'var(--accent-border)', color: 'var(--accent)' }}>
                <FolderOpen size={13} /> 添加到专辑
                {matchedAlbums.length > 0 && <span style={{ marginLeft: 4, fontSize: '0.65rem', color: 'var(--warning)' }}>({matchedAlbums.length} 个匹配)</span>}
              </button>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn-sm" onClick={() => { onEditTags?.(detail.gid); onClose() }} style={{ borderColor: 'var(--warning-border)', color: 'var(--warning)' }}><Edit3 size={13} /> 编辑标签</button>
          </div>
        </div>
      </div>
      {pickerOpen && (
        <TagPicker gid={detail.gid} onClose={() => { setPickerOpen(false); loadWorkTags(detail.gid) }} />
      )}
    </div>
  )
}
