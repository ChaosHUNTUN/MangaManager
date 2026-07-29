import React, { useRef, useEffect, useCallback } from 'react';
import { Loader } from 'lucide-react';

/**
 * ContinuousView — 滚动模式
 *
 * direction='horizontal' → flex-row, 每个图 item 撑满滚动容器高度
 * direction='vertical'   → flex-column, 每个图 item 撑满滚动容器宽度
 *
 * 不依赖估算尺寸, 容器固定为滚动区高度/宽度, 图片用 object-fit:contain 自然等比填充
 */
const IMAGE_URL = (name) => `/local-images/${encodeURIComponent(name)}`;

export default function ContinuousView({
  images, direction, fit, zoom, padding, viewport,
  scrollerRef, uiVisible: _uiVisible, setUiVisible,
}) {
  const isHoriz = direction === 'horizontal';
  const vh = (viewport?.h || 1080) - 44 - 36;
  const vw = viewport?.w || 1920;
  const padPx = Math.round((isHoriz ? vh : vw) * padding / 100);

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
    <div ref={scrollerRef}
      onPointerDown={handlePointerDown} onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp} onPointerLeave={handlePointerUp}
      onClick={(e) => { if (!scrollerRef?.current?._down) { e.stopPropagation(); setUiVisible(v => !v); } }}
      style={{
        flex: 1, overflow: 'auto', display: 'flex', cursor: 'grab',
        flexDirection: isHoriz ? 'row' : 'column',
        alignItems: isHoriz ? 'stretch' : 'center',
        justifyContent: isHoriz ? 'flex-start' : 'center',
        padding: padPx,
        gap: 4,
      }}>
      {images.map((name, i) => (
        <ContinuousImg key={i} name={name} index={i} total={images.length}
          isHoriz={isHoriz} containerWidth={vw} containerHeight={vh}
          fit={fit} zoom={zoom} />
      ))}
    </div>
  );
}

/** 单图 — 容器固定 height/width, 图片 object-fit:contain 自然填充 */
function ContinuousImg({ name, index, total, isHoriz, containerWidth, containerHeight, fit, zoom }) {
  const [loaded, setLoaded] = React.useState(false);
  const [dim, setDim] = React.useState({ w: 0, h: 0 });

  // 容器尺寸: horizontal → 高度撑满; vertical → 宽度撑满
  // 缩放: zoom 调整容器尺寸
  const containerStyle = isHoriz
    ? {
        flexShrink: 0,
        height: containerHeight * zoom,
        width: 'auto',
        marginRight: 4,
      }
    : {
        flexShrink: 0,
        width: containerWidth * zoom,
        height: dim.h ? (dim.h / dim.w) * containerWidth * zoom : 'auto',
        marginBottom: 4,
      };

  // 图片样式: 撑满容器, object-fit:contain 等比缩放
  const imgStyle = isHoriz
    ? { height: '100%', width: 'auto', objectFit: 'contain' }
    : { width: '100%', height: '100%', objectFit: 'contain' };

  return (
    <div style={{ ...containerStyle, position: 'relative', background: 'var(--surface)' }}>
      {!loaded && (
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', alignItems: 'center',
          justifyContent: 'center', color: 'var(--text-muted)',
        }}>
          <Loader size={20} style={{ animation: 'r-spin 1s linear infinite' }} />
        </div>
      )}
      {name ? (
        <img src={IMAGE_URL(name)} alt={`p${index + 1}`} draggable={false}
          style={{ ...imgStyle, opacity: loaded ? 1 : 0, transition: 'opacity 0.25s',
            display: 'block' }}
          onLoad={(e) => { setLoaded(true); setDim({ w: e.target.naturalWidth, h: e.target.naturalHeight }); }}
          onError={() => setLoaded(true)} />
      ) : null}
      <span style={{
        position: 'absolute', bottom: 4, right: 6, zIndex: 2,
        fontSize: 9, fontFamily: 'var(--font-mono)', color: 'var(--text-dim)',
        background: 'var(--glass-bg)', backdropFilter: 'blur(6px)',
        padding: '1px 5px', borderRadius: 'var(--radius-xs)', pointerEvents: 'none',
      }}>{index + 1}/{total}</span>
    </div>
  );
}
