import { memo } from 'react'
import { getLocalCoverUrl } from '../api'
import { IconEye, IconBook } from './Icons'

const CATEGORY_COLORS = {
  doujinshi: '#c06060', manga: '#c08050', 'artist cg': '#b0a050',
  'game cg': '#60a060', western: '#70a050', 'non-h': '#5070a0',
  imageset: '#8050a0', cosplay: '#c06080', 'asian porn': '#907050',
  misc: '#607080', private: '#607080', other: '#607080'
}
const getCategoryColor = (cat) => CATEGORY_COLORS[(cat || '').toLowerCase()] || '#607080'

const formatSize = (b) => b > 1e9 ? (b / 1e9).toFixed(1) + ' GB' : b > 1e6 ? (b / 1e6).toFixed(0) + ' MB' : b + ' B'
const formatCount = (n) => n > 9999 ? (n / 1000).toFixed(1) + 'k' : String(n)

const GalleryCard = memo(({
  g, isSel, isHovered, dragGid, albumInfo, ribbonText,
  batchMode, onCardClick, onDragMouseDown, onOpenDetail, onOpenReader
}) => {
  const showOverlay = isHovered
  return (
    <div className="gallery-card"
      onMouseDown={!batchMode ? e => onDragMouseDown(g.gid, e) : undefined}
      onClick={onCardClick}
      style={{
        background: 'var(--surface-card)',
        borderRadius: 'var(--radius-md)',
        overflow: 'hidden',
        cursor: batchMode ? 'default' : 'pointer',
        border: `1px solid ${isSel ? 'var(--error)' : showOverlay ? 'var(--border-active)' : 'var(--border-card)'}`,
        transition: 'border-color var(--duration-fast) var(--ease-out), transform var(--duration-fast) var(--ease-out)',
        position: 'relative',
        opacity: dragGid === g.gid ? 0.5 : 1,
        transform: showOverlay ? 'translateY(-1px)' : 'none',
      }}>
      {/* 批量模式选中标记 */}
      {batchMode && (
        <div style={{
          position: 'absolute', top: 6, left: 6, zIndex: 10,
          width: 20, height: 20,
          borderRadius: 'var(--radius-xs)',
          background: isSel ? 'var(--error)' : 'rgba(0,0,0,0.55)',
          border: `1px solid ${isSel ? 'var(--error)' : 'rgba(255,255,255,0.12)'}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#fff', fontSize: 'var(--text-2xs)', fontWeight: 'var(--weight-bold)',
        }}>
          {isSel ? '✓' : ''}
        </div>
      )}

      {/* 专辑顶部色条（辅助标识，配合下方 badge） */}
      {albumInfo && !batchMode && (
        <div title={albumInfo.name} style={{
          position: 'absolute', top: 0, left: 0, right: 0, zIndex: 9,
          height: 2,
          background: albumInfo.color,
          opacity: 0.5,
          pointerEvents: 'none',
        }} />
      )}

      {/* 封面区域 — 点击卡片切换 hover（显示操作按钮） */}
      <div style={{
        position: 'relative', width: '100%', paddingBottom: '138%',
        background: 'var(--surface-high)',
      }}>
        <img src={getLocalCoverUrl(g.gid)} alt={g.title}
          draggable={false}
          style={{
            position: 'absolute', inset: 0, width: '100%', height: '100%',
            objectFit: 'cover',
            cursor: batchMode ? 'default' : 'pointer',
            opacity: 0, transition: 'opacity var(--duration-normal) var(--ease-out)',
          }}
          loading="lazy"
          onLoad={e => { e.target.style.opacity = '1' }}
          onError={e => { e.target.style.display = 'none' }} />

        {/* 悬停操作层 — 底部渐变 + 按钮组 */}
        {!batchMode && showOverlay && (
          <div onMouseDown={e => e.stopPropagation()} style={{
            position: 'absolute', inset: 0, display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
            gap: 'var(--space-2)', padding: 'var(--space-2)',
            background: 'linear-gradient(transparent 60%, rgba(0,0,0,0.5))',
            zIndex: 5,
          }}>
            <button onClick={e => { e.stopPropagation(); onOpenDetail(g.gid) }}
              style={{
                padding: '4px 10px', borderRadius: 'var(--radius-sm)',
                border: '1px solid rgba(255,255,255,0.15)',
                background: 'rgba(0,0,0,0.6)',
                color: '#fff', fontSize: 'var(--text-2xs)', fontWeight: 'var(--weight-semibold)',
                cursor: 'pointer', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', gap: 3,
                transition: 'background var(--duration-instant) var(--ease-out)',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(139,122,160,0.35)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'rgba(0,0,0,0.6)' }}>
              <IconEye size={12} /> 详情
            </button>
            <button onClick={e => { e.stopPropagation(); onOpenReader(g.gid) }}
              style={{
                padding: '4px 10px', borderRadius: 'var(--radius-sm)',
                border: '1px solid rgba(255,255,255,0.15)',
                background: 'rgba(0,0,0,0.6)',
                color: '#fff', fontSize: 'var(--text-2xs)', fontWeight: 'var(--weight-semibold)',
                cursor: 'pointer', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', gap: 3,
                transition: 'background var(--duration-instant) var(--ease-out)',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(90,138,138,0.35)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'rgba(0,0,0,0.6)' }}>
              <IconBook size={12} /> 阅读
            </button>
          </div>
        )}
      </div>

      {/* 信息区 — 紧凑排版 */}
      <div style={{ padding: '6px 8px 8px' }}>
        {/* 专辑标签（彩色 badge，一眼识别归属） */}
        {albumInfo && !batchMode && (
          <div title={albumInfo.name} style={{
            display: 'inline-block',
            padding: '2px 7px', marginBottom: 3,
            borderRadius: 'var(--radius-xs)',
            background: albumInfo.color + '35',
            color: albumInfo.color,
            border: `1px solid ${albumInfo.color}80`,
            textShadow: `0 0 1px ${albumInfo.color}50`,
            fontSize: 'var(--text-3xs)',
            fontWeight: 'var(--weight-bold)',
            maxWidth: '100%',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}>
            {albumInfo.name}
          </div>
        )}
        {/* 标题行 + 拖拽手柄 */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--space-1)' }}>
          <div
            title={g.title}
            style={{
              fontSize: 'var(--text-xs)', lineHeight: 1.4, overflow: 'hidden',
              display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
              color: 'var(--text-primary)', fontWeight: 'var(--weight-medium)',
              userSelect: 'none',
            }}>
            {g.title}
          </div>
        </div>

        {/* 元数据行 */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          marginTop: 'var(--space-1)',
          color: 'var(--text-muted)', fontSize: 'var(--text-2xs)',
        }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-3xs)' }}>
            {formatCount(g.fileCount)}P · {formatSize(g.totalSize)}
          </span>
          {g.rating > 0 && (
            <span style={{ color: 'var(--warning)', fontSize: 'var(--text-2xs)' }}>★ {g.rating.toFixed(1)}</span>
          )}
        </div>
      </div>
    </div>
  )
})

GalleryCard.displayName = 'GalleryCard'

export { GalleryCard, getCategoryColor, formatSize, CATEGORY_COLORS }
export default GalleryCard