import { memo } from 'react'
import { getLocalCoverUrl } from '../api'
import { getCategoryColor, formatSize } from './GalleryCard'

const formatCount = (n) => n > 9999 ? (n / 1000).toFixed(1) + 'k' : String(n)

const GalleryRow = memo(({
  g, isSel, dragGid, albumInfo, ribbonText,
  batchMode, onCardClick, onDragMouseDown, onOpenDetail, onOpenReader
}) => {
  return (
    <div
      onClick={onCardClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 'var(--space-3)',
        padding: '6px 10px',
        background: 'var(--surface-card)',
        borderRadius: 'var(--radius-sm)',
        border: `1px solid ${isSel ? 'var(--error)' : 'var(--border-card)'}`,
        cursor: batchMode ? 'default' : 'pointer',
        transition: 'border-color var(--duration-fast) var(--ease-out), background var(--duration-fast) var(--ease-out)',
        opacity: dragGid === g.gid ? 0.5 : 1,
        position: 'relative', overflow: 'hidden',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.borderColor = isSel ? 'var(--error)' : 'var(--border-active)'
        e.currentTarget.style.background = 'var(--surface-hover)'
      }}
      onMouseLeave={e => {
        e.currentTarget.style.borderColor = isSel ? 'var(--error)' : 'var(--border-card)'
        e.currentTarget.style.background = 'var(--surface-card)'
      }}>
      {/* 专辑标记细线 */}
      {albumInfo && !batchMode && (
        <div style={{
          position: 'absolute', top: 0, left: 0, bottom: 0, width: 3,
          background: albumInfo.color,
          opacity: 0.7,
          pointerEvents: 'none',
        }} />
      )}

      {/* 批量模式复选框 */}
      {batchMode && (
        <div style={{
          width: 18, height: 18, borderRadius: 'var(--radius-xs)', flexShrink: 0,
          background: isSel ? 'var(--error)' : 'rgba(0,0,0,0.4)',
          border: `1px solid ${isSel ? 'var(--error)' : 'rgba(255,255,255,0.12)'}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#fff', fontSize: 'var(--text-2xs)',
        }}>
          {isSel ? '✓' : ''}
        </div>
      )}

      {/* 封面缩略图 */}
      <img src={getLocalCoverUrl(g.gid)} alt=""
        draggable={false}
        onMouseDown={!batchMode ? e => onDragMouseDown(g.gid, e) : undefined}
        style={{
          width: 48, height: 64, objectFit: 'cover', borderRadius: 'var(--radius-xs)',
          flexShrink: 0, background: 'var(--surface-high)',
          cursor: batchMode ? 'default' : 'grab',
        }} />

      {/* 信息区域 */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div
            title={g.title}
            style={{
              fontSize: 'var(--text-sm)', color: 'var(--text-primary)', fontWeight: 'var(--weight-medium)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              userSelect: 'none',
            }}>
            {g.title}
          </div>
        </div>
        <div style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-muted)', marginTop: 2, display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-3xs)' }}>
            {formatCount(g.fileCount)}P · {formatSize(g.totalSize)}
          </span>
          {g.category && (
            <span className="badge"
              style={{ background: getCategoryColor(g.category) + '20', color: getCategoryColor(g.category), borderColor: getCategoryColor(g.category) + '40' }}>
              {g.category}
            </span>
          )}
          {g.language && (
            <span style={{ color: 'var(--text-dim)' }}>{g.language}</span>
          )}
        </div>
      </div>

      {/* 右侧信息 */}
      <div style={{
        fontSize: 'var(--text-2xs)', color: 'var(--text-muted)',
        whiteSpace: 'nowrap', textAlign: 'right', flexShrink: 0,
      }}>
        <div style={{ fontFamily: 'var(--font-mono)' }}>
          {new Date(g.lastModified).toLocaleDateString()}
        </div>
        {g.rating > 0 && (
          <div style={{ color: 'var(--warning)' }}>★ {g.rating.toFixed(1)}</div>
        )}
      </div>
    </div>
  )
})

GalleryRow.displayName = 'GalleryRow'

export default GalleryRow