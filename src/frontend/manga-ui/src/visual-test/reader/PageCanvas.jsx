import React, { useState, useCallback } from 'react';
import { Loader } from 'lucide-react';

const IMAGE_URL = (name) => `/local-images/${encodeURIComponent(name)}`;

/** 懒加载图片 — spinner → 淡入 / 失败兜底 */
export const LazyImage = React.memo(function LazyImage({ src, alt, onLoad }) {
  const [state, setState] = useState('loading');
  return (
    <div className="r-img-wrap">
      {state === 'loading' && (
        <div className="r-img-spinner">
          <Loader size={22} className="r-spin" />
        </div>
      )}
      {state === 'error' ? (
        <div className="r-img-error">加载失败</div>
      ) : (
        <img src={src} alt={alt || ''}
          onLoad={(e) => {
            setState('loaded');
            onLoad?.(e.target.naturalWidth, e.target.naturalHeight);
          }}
          onError={() => setState('error')}
          style={{ opacity: state === 'loaded' ? 1 : 0 }} draggable={false}
          className="r-img" />
      )}
    </div>
  );
});

/**
 * 单页画布 — 接收计算好的 {width, height} 直接渲染
 * 零扭曲保证: 不传递任何 aspect-ratio / cover / fill
 */
export const PageCanvas = React.memo(function PageCanvas({
  name, index, total, width, height,
  showPageNum = true, shadow = false, onLoad,
}) {
  if (!width || !height) return null;
  return (
    <div style={{ width, height, flexShrink: 0, position: 'relative', overflow: 'hidden',
      background: 'var(--surface)', boxShadow: shadow ? '0 4px 24px rgba(0,0,0,0.35)' : undefined }}>
      {name ? <LazyImage src={IMAGE_URL(name)} alt={`p${index + 1}`} onLoad={onLoad} /> : (
        <div className="r-placeholder">P{index + 1}</div>
      )}
      {showPageNum && (
        <span className="r-page-num">{index + 1}/{total}</span>
      )}
    </div>
  );
});
