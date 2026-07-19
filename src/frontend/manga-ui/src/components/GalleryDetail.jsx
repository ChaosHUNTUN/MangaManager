import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { getLocalCoverUrl, fetchGalleryMetaTags, translateEHTags } from '../api'

const CATEGORY_COLORS = {
  doujinshi: '#F44336', manga: '#FF9800', 'artist cg': '#FBC02D',
  'game cg': '#4CAF50', western: '#8BC34A', 'non-h': '#2196F3',
  imageset: '#9C27B0', cosplay: '#E91E63', 'asian porn': '#795548',
  misc: '#607D8B', private: '#607D8B', other: '#607D8B'
}
const getCategoryColor = (cat) => CATEGORY_COLORS[(cat || '').toLowerCase()] || '#607D8B'
const formatSize = (b) => b > 1e9 ? (b / 1e9).toFixed(1) + ' GB' : b > 1e6 ? (b / 1e6).toFixed(0) + ' MB' : b + ' B'

/**
 * 画廊详情弹窗
 * Props:
 *   detail           - 画廊详情对象
 *   tagTranslations  - 标签翻译映射
 *   nsTranslations   - namespace 翻译映射
 *   filtered         - 当前筛选后的画廊列表（用于传递阅读列表）
 *   albumConfig      - 自定义专辑配置
 *   galleries        - 所有画廊数据（用于判断是否在自动分配专辑中）
 *   onClose          - 关闭回调
 *   onEditTags       - 编辑标签回调 (gid)
 *   onAddToAlbum     - 添加到专辑回调 ({ gid, title, tags, matchedAlbums })
 */
export default function GalleryDetail({ detail, tagTranslations, nsTranslations, filtered, albumConfig, galleries, onClose, onEditTags, onAddToAlbum, onOpenReader }) {
  if (!detail) return null

  // 判断当前作品是否已在某个自定义专辑中
  const inCustomAlbum = useMemo(() => {
    if (!albumConfig || !detail) return false
    return Object.values(albumConfig).some(v => (v.gids || []).includes(detail.gid))
  }, [albumConfig, detail])

  // 判断当前作品是否在自动分配分组中（不在任何自定义专辑，但属于某个 artist/group 自动分组）
  const isInAutoGroup = useMemo(() => {
    if (!albumConfig || !detail || !galleries) return false
    // 先检查是否在自定义专辑中
    const albumGids = new Set(Object.values(albumConfig).flatMap(v => v.gids || []))
    if (albumGids.has(detail.gid)) return false
    // 检查画廊是否存在且不在任何自定义专辑中
    const g = galleries.find(g => g.gid === detail.gid)
    if (!g) return false
    const artists = g.artists || []
    const grps = g.groups || []
    // 有 artist 或 group 标签即为有自动分组
    return artists.length > 0 || grps.length > 0
  }, [albumConfig, detail, galleries])

  // 计算当前作品标签匹配的自定义专辑
  const matchedAlbums = useMemo(() => {
    if (!albumConfig || !detail || !inCustomAlbum) return []
    const g = galleries?.find(g => g.gid === detail.gid)
    if (!g) return []
    const tags = [...(g.artists || []), ...(g.groups || [])]
    if (tags.length === 0) return []
    return Object.entries(albumConfig)
      .filter(([key, val]) => {
        // 排除作品已在的专辑
        if ((val.gids || []).includes(detail.gid)) return false
        // 检查 key 是否匹配作品的任一标签
        return tags.some(t => t.toLowerCase() === key.toLowerCase())
      })
      .map(([key, val]) => ({ key, name: val.name || key, count: (val.gids || []).length }))
  }, [albumConfig, detail, galleries, inCustomAlbum])

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal" style={{ maxWidth: 'min(640px, 90vw)', maxHeight: '85vh', overflowY: 'auto', padding: 0 }}>
        <div style={{ position: 'relative', background: 'linear-gradient(180deg, #1a1a3a 0%, #0f0f1a 100%)', padding: '20px 24px 16px', borderBottom: '1px solid #2a2a4a' }}>
          <button className="btn-sm" onClick={onClose} style={{ position: 'absolute', top: 10, right: 10, border: 'none', color: '#888', fontSize: '1.1rem' }}>✕</button>
          <div style={{ display: 'flex', gap: 16 }}>
            <div style={{ flexShrink: 0, width: 140, borderRadius: 8, overflow: 'hidden', border: '1px solid #2a2a4a', background: '#1a1a2e' }}><img src={getLocalCoverUrl(detail.gid)} alt="" style={{ width: '100%', display: 'block' }} /></div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <h3 title={detail.title} style={{ margin: '0 0 4px', fontSize: '1rem', lineHeight: 1.4, color: '#e0e0e0', fontWeight: 600 }}>{detail.title}</h3>
              {detail.titleJpn && <div style={{ fontSize: '0.8rem', color: '#888', marginBottom: 8 }}>{detail.titleJpn}</div>}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                <span style={{ padding: '2px 10px', borderRadius: 10, fontSize: '0.72rem', fontWeight: 600, background: getCategoryColor(detail.category), color: '#fff' }}>{detail.category}</span>
                {detail.language && <span style={{ padding: '2px 10px', borderRadius: 10, fontSize: '0.72rem', background: '#2a2a4a', color: '#aaa' }}>{detail.language}</span>}
                {detail.favoriteCount > 0 && <span style={{ padding: '2px 10px', borderRadius: 10, fontSize: '0.72rem', background: '#f59e0b20', color: '#fbbf24', border: '1px solid #f59e0b40' }}>♥ {detail.favoriteCount}</span>}
              </div>
              <div style={{ fontSize: '0.75rem', color: '#888', lineHeight: 1.6 }}>
                {detail.uploader && <div>上传者: <span style={{ color: '#a78bfa' }}>{detail.uploader}</span></div>}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>GID: {detail.gid} · {detail.fileCount} 页 · {formatSize(detail.totalSize)}<Link to={`/ehentai?open=${detail.gid}${detail.token ? '_' + detail.token : ''}`} onClick={onClose} style={{ fontSize: '0.68rem', color: '#a78bfa', textDecoration: 'none', padding: '1px 8px', borderRadius: 8, border: '1px solid #7c3aed40', background: '#7c3aed10' }} title="在线详情">🔗 在线详情</Link></div>
              </div>
            </div>
          </div>
        </div>
        <div style={{ padding: '12px 24px', borderBottom: '1px solid #1a1a3a', display: 'flex', gap: 24, flexWrap: 'wrap' }}>
          {[{ label: '页数', value: detail.fileCount }, { label: '大小', value: formatSize(detail.totalSize) }, { label: '评分', value: detail.rating !== '0' ? `${detail.rating}${detail.ratingCount > 0 ? ` (${detail.ratingCount})` : ''}` : '-' }, { label: '语言', value: detail.language || '-' }].map((m, i) => (
            <div key={i} style={{ textAlign: 'center', minWidth: 50 }}><div style={{ fontSize: '0.65rem', color: '#666', textTransform: 'uppercase', marginBottom: 2 }}>{m.label}</div><div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#ccc' }}>{m.value}</div></div>
          ))}
        </div>
        {detail.tagGroups?.length > 0 && (
          <div style={{ padding: '12px 24px', borderBottom: '1px solid #1a1a3a' }}>
            {detail.tagGroups.map((grp, gi) => (
              <div key={gi} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 8 }}>
                <span style={{ flexShrink: 0, padding: '2px 10px', borderRadius: 4, background: '#7c3aed20', color: '#a78bfa', fontSize: '0.7rem', fontWeight: 600, lineHeight: '20px', marginTop: 2 }}>{nsTranslations[grp.namespace] || grp.namespace}</span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, flex: 1 }}>{grp.tags.map((t, ti) => <span key={ti} title={t} style={{ padding: '2px 10px', borderRadius: 4, background: '#1a1a3a', color: '#ccc', fontSize: '0.72rem', border: '1px solid #2a2a4a' }}>{tagTranslations[`${grp.namespace}:${t}`] || t}</span>)}</div>
              </div>
            ))}
          </div>
        )}
        <div style={{ padding: '14px 24px', display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Link to={`/reader-local/${detail.gid}`} onClick={() => { try { sessionStorage.setItem('reader-local-context', JSON.stringify({ gids: filtered.map(g => g.gid) })) } catch { } }} className="btn-sm" style={{ textDecoration: 'none', borderColor: '#10b981', color: '#6ee7b7' }}>📖 在线阅读</Link>
            {detail.token && <a href={`https://${detail.isExhentai ? 'exhentai' : 'e-hentai'}.org/g/${detail.gid}/${detail.token}/`} target="_blank" rel="noreferrer" className="btn-sm" style={{ textDecoration: 'none', color: '#a78bfa', borderColor: '#7c3aed' }}>🌐 在 {detail.isExhentai ? 'ExHentai' : 'E-Hentai'} 查看</a>}
            {/* 只在作品未处于任何自定义专辑时显示"添加到专辑" */}
            {!inCustomAlbum && (
              <button className="btn-sm" onClick={() => {
                const tags = []; detail.tagGroups?.forEach(grp => { const ns = grp.namespace.toLowerCase(); if (ns === 'artist' || ns === 'group' || ns === 'other') grp.tags.forEach(t => tags.push({ ns: grp.namespace, tag: t })) })
                onAddToAlbum?.({ gid: detail.gid, title: detail.title, tags, matchedAlbums }); onClose()
              }} style={{ borderColor: '#8b5cf6', color: '#c4b5fd' }}>
                📁 添加到专辑
                {matchedAlbums.length > 0 && <span style={{ marginLeft: 4, fontSize: '0.65rem', color: '#fbbf24' }}>({matchedAlbums.length} 个匹配)</span>}
              </button>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn-sm" onClick={() => { onEditTags?.(detail.gid); onClose() }} style={{ borderColor: '#f59e0b', color: '#fbbf24' }}>✏️ 编辑标签</button>
          </div>
        </div>
      </div>
    </div>
  )
}
