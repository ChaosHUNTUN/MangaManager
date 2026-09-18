import { memo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { BookOpen, Eye, FileText, Check, Trash2 } from 'lucide-react'
import { getLocalCoverUrl } from '../api'
import { getCategoryColor, CATEGORY_COLORS_CARD as CATEGORY_COLORS } from '../constants/colors'
import { formatSize, formatCount } from '../utils/format'

/**
 * GalleryCard — 画廊卡片 (视觉测试平台 CardsShowcase 验证模式)
 *
 * 改进点:
 *  - framer-motion 卡片悬浮/点击微动效
 *  - 封面加载 spinner
 *  - 悬停操作按钮 (whileHover 替代手动 onMouseEnter/Leave)
 *  - 专辑归属 badge (动态颜色)
 */
const GalleryCard = memo(({
 g, isSel, isHovered, dragGid, albumInfo,   batchMode, onCardClick, onDragMouseDown, onOpenDetail, onOpenReader, onDelete
}) => {
  const [coverLoaded, setCoverLoaded] = useState(false)
  const [coverError, setCoverError] = useState(false)
  const showOverlay = isHovered && !batchMode

  // ── 移动端左滑操作（阅读/删除）：触摸跟踪 + 吸附展开/收起 ──
  const ACTION_W = 72
  const openX = -ACTION_W * 2
  const [swipeX, setSwipeX] = useState(0)
  const [swiping, setSwiping] = useState(false)
  const [open, setOpen] = useState(false)
  const touchRef = useRef({ startX: 0, startY: 0, active: false, panning: false, dx: 0 })
  const suppressClickRef = useRef(false)

  const closeSwipe = () => { setOpen(false); setSwipeX(0) }

  const onTouchStart = (e) => {
    if (batchMode) return
    const t = e.touches[0]
    touchRef.current = { startX: t.clientX, startY: t.clientY, active: true, panning: false, dx: 0 }
  }
  const onTouchMove = (e) => {
    const s = touchRef.current
    if (!s.active || batchMode) return
    const t = e.touches[0]
    const dx = t.clientX - s.startX
    const dy = t.clientY - s.startY
    s.dx = dx
    if (!s.panning) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return
      if (Math.abs(dx) > Math.abs(dy)) s.panning = true   // 水平手势接管
      else { s.active = false; return }                    // 纵向滚动交给页面
    }
    const base = open ? openX : 0
    setSwipeX(Math.min(0, Math.max(openX, base + dx)))
    setSwiping(true)
    suppressClickRef.current = true
  }
  const onTouchEnd = () => {
    const s = touchRef.current
    if (!s.active) return
    s.active = false
    setSwiping(false)
    const shouldOpen = open ? s.dx <= 40 : s.dx < -30
    setOpen(shouldOpen)
    setSwipeX(shouldOpen ? openX : 0)
  }

  return (
    <motion.div
      className="gallery-card"
      whileHover={!batchMode ? { y: -1, scale: 1.005 } : {}}
      whileTap={!batchMode ? { scale: 0.995 } : {}}
      onMouseDown={!batchMode ? e => onDragMouseDown(g.gid, e) : undefined}
      onClick={(e) => {
        // 滑动后吞掉随后的 click，避免误触打开详情
        if (suppressClickRef.current) { suppressClickRef.current = false; e.stopPropagation(); return }
        onCardClick()
      }}
      style={{
        background: 'var(--surface-card)',
        borderRadius: 'var(--radius-md)',
        overflow: 'hidden',
        cursor: batchMode ? 'default' : 'pointer',
        border: `1px solid ${isSel ? 'var(--error)' : showOverlay ? 'var(--border-active)' : 'var(--border-card)'}`,
        position: 'relative',
        opacity: dragGid === g.gid ? 0.5 : 1,
      }}>
      {/* 左滑操作层（移动端；阅读 / 删除） */}
      {!batchMode && (
        <div style={{ position: 'absolute', top: 0, bottom: 0, right: 0, width: -openX, display: 'flex', zIndex: 1 }}>
          <button onClick={(e) => { e.stopPropagation(); closeSwipe(); onOpenReader?.(g.gid) }}
            style={{ flex: 1, border: 'none', background: 'var(--accent-teal)', color: '#fff', fontSize: 'var(--text-xs)', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
            <BookOpen size={14} /> 阅读
          </button>
          <button onClick={(e) => { e.stopPropagation(); closeSwipe(); onDelete?.(g) }}
            style={{ flex: 1, border: 'none', background: 'var(--error)', color: '#fff', fontSize: 'var(--text-xs)', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
            <Trash2 size={14} /> 删除
          </button>
        </div>
      )}
      {/* 可滑动内容层 */}
      <div
        onTouchStart={onTouchStart} onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd} onTouchCancel={onTouchEnd}
        style={{
          position: 'relative', zIndex: 2, background: 'var(--surface-card)',
          transform: `translateX(${swipeX}px)`,
          transition: swiping ? 'none' : 'transform 0.2s ease-out',
          touchAction: 'pan-y',
        }}>

      {/* 批量模式选中标记 */}
      {batchMode && (
        <div style={{
          position: 'absolute', top: 6, left: 6, zIndex: 10,
          width: 20, height: 20, borderRadius: 'var(--radius-xs)',
          background: isSel ? 'var(--error)' : 'var(--overlay-bg)',
          border: `1px solid ${isSel ? 'var(--error)' : 'var(--divider)'}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'var(--canvas)', fontSize: 'var(--text-2xs)', fontWeight: 'var(--weight-bold)',
        }}>
          {isSel ? <Check size={10} /> : ''}
        </div>
      )}

      {/* 专辑色条 */}
      {albumInfo && !batchMode && (
        <div title={albumInfo.name} style={{
          position: 'absolute', top: 0, left: 0, right: 0, zIndex: 9,
          height: 2, background: albumInfo.color,
          opacity: 0.5, pointerEvents: 'none',
        }} />
      )}

      {/* 封面区 */}
      <div style={{
        position: 'relative', width: '100%', paddingBottom: '138%',
        background: 'var(--surface-high)',
      }}>
        {/* 加载态 / 错误态 */}
        {!coverLoaded && !coverError && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex',
            alignItems: 'center', justifyContent: 'center', color: 'var(--text-dim)' }}>
            <BookOpen size={28} />
          </div>
        )}
        {coverError && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex',
            alignItems: 'center', justifyContent: 'center',
            color: 'var(--text-dim)', fontSize: 'var(--text-sm)' }}>
            <FileText size={28} />
          </div>
        )}
        <img src={getLocalCoverUrl(g.gid, g.lastModified)} alt={g.title}
          draggable={false}
          style={{
            position: 'absolute', inset: 0, width: '100%', height: '100%',
            objectFit: 'cover',
            cursor: batchMode ? 'default' : 'pointer',
            opacity: coverLoaded ? 1 : 0,
            transition: 'opacity var(--duration-normal) var(--ease-out)',
          }}
          loading="lazy"
          onLoad={() => setCoverLoaded(true)}
          onError={() => setCoverError(true)} />

        {/* 悬停操作层 */}
        {showOverlay && !coverError && (
          <div onMouseDown={e => e.stopPropagation()} style={{
            position: 'absolute', inset: 0, display: 'flex', alignItems: 'flex-end',
            justifyContent: 'center', gap: 'var(--space-2)',
            padding: 'var(--space-2)',
            background: 'linear-gradient(transparent 60%, var(--overlay-bg))',
            zIndex: 5,
          }}>
            <motion.button
              whileHover={{ background: 'var(--accent-bg-hover)' }}
              onClick={e => { e.stopPropagation(); onOpenDetail(g.gid) }}
              style={{
                padding: '4px 10px', borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--divider)',
                background: 'var(--overlay-bg)',
                color: 'var(--canvas)', fontSize: 'var(--text-2xs)',
                fontWeight: 'var(--weight-semibold)', cursor: 'pointer',
                backdropFilter: 'blur(6px)', display: 'flex',
                alignItems: 'center', gap: 4,
              }}>
              <Eye size={12} /> 详情
            </motion.button>
            <motion.button
              whileHover={{ background: 'var(--accent-teal-bg-hover)' }}
              onClick={e => { e.stopPropagation(); onOpenReader(g.gid) }}
              style={{
                padding: '4px 10px', borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--divider)',
                background: 'var(--overlay-bg)',
                color: 'var(--canvas)', fontSize: 'var(--text-2xs)',
                fontWeight: 'var(--weight-semibold)', cursor: 'pointer',
                backdropFilter: 'blur(6px)', display: 'flex',
                alignItems: 'center', gap: 4,
              }}>
              <BookOpen size={12} /> 阅读
            </motion.button>
          </div>
        )}
      </div>

      {/* 信息区 */}
      <div style={{ padding: '6px 8px 8px' }}>
        {/* 专辑标签 (动态颜色, 需内联) */}
        {albumInfo && !batchMode && (
          <div title={albumInfo.name} style={{
            display: 'inline-block', padding: '2px 7px', marginBottom: 3,
            borderRadius: 'var(--radius-xs)',
            background: `${albumInfo.color}35`,
            color: albumInfo.color,
            border: `1px solid ${albumInfo.color}80`,
            fontSize: 'var(--text-3xs)', fontWeight: 'var(--weight-bold)',
            maxWidth: '100%', overflow: 'hidden',
            textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {albumInfo.name}
          </div>
        )}

        {/* 标题 */}
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

        {/* 元数据 */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          marginTop: 'var(--space-1)',
          color: 'var(--text-muted)', fontSize: 'var(--text-2xs)',
        }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-3xs)' }}>
            {formatCount(g.fileCount)}P · {formatSize(g.totalSize)}
          </span>
          {g.rating > 0 && (
            <span style={{ color: 'var(--warning)', fontSize: 'var(--text-2xs)' }}>
              ★ {g.rating.toFixed(1)}
            </span>
          )}
        </div>
      </div>
      </div>
    </motion.div>
  )
})

GalleryCard.displayName = 'GalleryCard'

export { GalleryCard, getCategoryColor, formatSize, CATEGORY_COLORS }
export default GalleryCard
