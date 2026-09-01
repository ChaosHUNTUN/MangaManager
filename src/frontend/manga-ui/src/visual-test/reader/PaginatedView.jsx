import { useRef, useEffect, useCallback, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { PageCanvas } from './PageCanvas';
import { createSwipeDetector } from './gestureUtils';
import { getImageLayout } from './useReaderEngine';

/** PaginatedView — 翻页模式 (纯单页) */
export default function PaginatedView({
  images, currentPage, totalPages,
  viewport, padding = 0, fit = 'both', zoom = 1,
  direction = 'horizontal', readingOrder = 'ltr', goForward, goBack, uiVisible,
  onPrevGallery, onNextGallery,
}) {
  const isVertical = direction === 'vertical';
  // 横向 RTL（漫画）：物理左侧=下一页、右侧=上一页
  const rtlHorizontal = !isVertical && readingOrder === 'rtl';
  const [dimsMap, setDimsMap] = useState({});
  const setImgDim = useCallback((i, w, h) => {
    setDimsMap(prev => {
      const cur = prev[i];
      if (cur && cur.w === w && cur.h === h) return prev;
      return { ...prev, [i]: { w, h } };
    });
  }, []);

  // getImageLayout 内部会再扣除 HUD/工具栏高度，这里必须传原始视口尺寸
  const vw = viewport?.w || window.innerWidth;
  const vh = viewport?.h || window.innerHeight;

  // 用图片自然尺寸 + fit/zoom 计算实际显示尺寸（零扭曲）
  const dims = dimsMap[currentPage];
  const layout = dims?.w && dims?.h
    ? getImageLayout(dims.w, dims.h, vw, vh, fit, zoom, padding, { top: viewport?.top ?? 44, bottom: viewport?.bottom ?? 36 })
    : null;
  const needScroll = layout ? (layout.overflowX || layout.overflowY) : false;

  // 手势
  const swipeRef = useRef(null);
  const suppressClickRef = useRef(false);
  useEffect(() => {
    const d = createSwipeDetector();
    swipeRef.current = d;
  }, []);
  // 主轴滑动 = 翻页；交叉轴滑动 = 作品导航
  const primaryAxis = isVertical ? 'y' : 'x';

  const handlePointerDown = useCallback((e) => {
    suppressClickRef.current = false
    swipeRef.current?.onDown(e.clientX, e.clientY);
  }, []);
  const handlePointerMove = useCallback((e) => {
    swipeRef.current?.onMove(e.clientX, e.clientY);
  }, []);
  const handlePointerUp = useCallback((e) => {
    const r = swipeRef.current?.onUp(e.clientX, e.clientY);
    if (!r || r.action === 'click' || r.action === 'cancel') return;
    suppressClickRef.current = true;
    if (r.axis === primaryAxis) {
      if (r.action === 'next') goForward();
      else goBack();
    } else {
      if (r.action === 'next') onNextGallery?.();
      else onPrevGallery?.();
    }
  }, [goForward, goBack, primaryAxis, onPrevGallery, onNextGallery]);
  // 滑动触发翻页后，吞掉随后的 click，避免热区再次翻页（双翻页）
  const handleClickCapture = useCallback((e) => {
    if (suppressClickRef.current) {
      e.stopPropagation();
      suppressClickRef.current = false;
    }
  }, []);

  return (
    <div className="r-viewport"
      onPointerDown={handlePointerDown} onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp} onClickCapture={handleClickCapture}>
      {/* 点击区 */}
      {!uiVisible && <>
        <div className={`r-flip-area prev ${isVertical ? 'vertical' : ''}`} onClick={rtlHorizontal ? goForward : goBack} />
        <div className={`r-flip-area next ${isVertical ? 'vertical' : ''}`} onClick={rtlHorizontal ? goBack : goForward} />
      </>}

      <AnimatePresence mode="wait">
        <motion.div key={currentPage}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0 }}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: '100%', height: '100%', gap: 0 }}>
          <div className="r-gallery" style={{ padding: 8 }}>
            <div style={{
              width: '100%', height: '100%',
              overflow: needScroll ? 'auto' : 'hidden',
              display: 'flex',
              alignItems: needScroll && layout?.overflowY ? 'flex-start' : 'center',
              justifyContent: needScroll && layout?.overflowX ? 'flex-start' : 'center',
            }}>
              <div style={{
                width: layout ? `${layout.width}px` : '100%',
                height: layout ? `${layout.height}px` : '100%',
                flexShrink: 0,
              }}>
              <PageCanvas
                name={images[currentPage]} index={currentPage}
                total={totalPages}
                width="100%" height="100%" margin={0}
                shadow={false} onLoad={(w, h) => setImgDim(currentPage, w, h)} />
              </div>
            </div>
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
