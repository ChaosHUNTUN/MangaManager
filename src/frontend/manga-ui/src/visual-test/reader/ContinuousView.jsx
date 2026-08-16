import React, { useCallback } from 'react';

/**
 * ContinuousView — 滚动模式
 *
 * 画廊 + 画框结构: .r-gallery > .r-frame × N
 * direction='horizontal' → 画廊横向延伸, 画框纵向撑满
 * direction='vertical'   → 画廊纵向延伸, 画框横向撑满
 */
const IMAGE_URL = (name) => {
  if (!name) return name;
  if (name.startsWith('http') || name.startsWith('/api')) return name;
  return `/local-images/${encodeURIComponent(name)}`;
};

export default function ContinuousView({
  images, direction, zoom = 1, viewport, padding = 0,
  scrollerRef, setUiVisible,
}) {
  const isHoriz = direction === 'horizontal';
  const fullH = viewport?.h || window.innerHeight;
  const fullW = viewport?.w || window.innerWidth;
  const marginPx = Math.round(fullH * padding / 100);

  // grab scroll
  const handlePointerDown = useCallback((e) => {
    const el = scrollerRef?.current; if (!el) return;
    el._dragX = e.clientX; el._dragY = e.clientY;
    el._sl = el.scrollLeft; el._st = el.scrollTop;
    el._down = true;
    el.style.cursor = 'grabbing';
  }, [scrollerRef]);
  const handlePointerMove = useCallback((e) => {
    const el = scrollerRef?.current; if (!el?._down) return;
    el.scrollLeft = el._sl - (e.clientX - el._dragX);
    el.scrollTop  = el._st - (e.clientY - el._dragY);
  }, [scrollerRef]);
  const handlePointerUp = useCallback(() => {
    const el = scrollerRef?.current; if (el) { el._down = false; el.style.cursor = 'grab'; }
  }, [scrollerRef]);

  return (
    <div ref={scrollerRef} className="r-scroller-gallery"
      onPointerDown={handlePointerDown} onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp} onPointerLeave={handlePointerUp}
      onClick={(e) => { if (!scrollerRef?.current?._down) { e.stopPropagation(); setUiVisible(v => !v); } }}
      style={{
        flex: 1, cursor: 'grab', minHeight: 0,
        overflowX: isHoriz ? 'auto' : 'hidden',
        overflowY: isHoriz ? 'hidden' : 'auto',
        display: 'flex', flexDirection: isHoriz ? 'row' : 'column',
        alignItems: 'stretch', gap: 0, padding: 0,
      }}>
        {images.map((name, i) => (
          <div key={i} className="r-frame" style={{
            flexShrink: 0, position: 'relative', minHeight: 0,
            height: isHoriz ? '100%' : undefined,
            width: isHoriz ? undefined : '100%',
            padding: marginPx, boxSizing: 'border-box',
            overflow: 'hidden',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <img src={IMAGE_URL(name)} alt={`p${i + 1}`} draggable={false}
              style={{
                width: '100%', height: '100%',
                objectFit: 'contain',
                display: 'block',
              }}
              onError={() => {}} />
            <span style={{
              position: 'absolute', bottom: 4, right: 6, zIndex: 2,
              fontSize: 9, fontFamily: 'var(--font-mono)', color: 'var(--text-dim)',
              background: 'var(--glass-bg)', backdropFilter: 'blur(6px)',
              padding: '1px 5px', borderRadius: 'var(--radius-xs)', pointerEvents: 'none',
            }}>{i + 1}/{images.length}</span>
          </div>
        ))}
    </div>
  );
}
