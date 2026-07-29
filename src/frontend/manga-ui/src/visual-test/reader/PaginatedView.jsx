import React, { useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { PageCanvas } from './PageCanvas';
import { getImageLayout, getSpreadLayout } from './useReaderEngine';
import { createSwipeDetector } from './gestureUtils';

/**
 * PaginatedView — 翻页模式 (单页 / 双页)
 *
 * 手势: swipe → 翻页 / 点击左右区
 * 方向: direction='rtl' → 往前翻 = 向左滑; direction='ltr' → 往前翻 = 向右滑
 */
export default function PaginatedView({
  images, currentPage, pageStep, totalPages,
  layout, direction, flow, fit, zoom, padding,
  isCoverAlone, flipDirRef, viewport,
  goForward, goBack, setUiVisible, uiVisible,
}) {
  const imgDimsRef = useRef({});

  // 收集已加载图片的真实尺寸
  const setImgDim = (i, w, h) => {
    imgDimsRef.current[i] = { w, h };
  };

  // 默认 2:3 比例直到真实尺寸加载
  const imgMeta = imgDimsRef.current[currentPage];
  const imgW = imgMeta?.w || 1800;
  const imgH = imgMeta?.h || 1200;

  const vw = viewport?.w || 1920;
  const vh = (viewport?.h || 1080) - 44 - 36; // 减去 HUD + 工具栏

  const singleLayout = getImageLayout(imgW, imgH, vw, vh, fit, zoom, padding);
  // 双页模式: 封面单独占整页, 普通双页各占半页
  const spreadLayout = layout === 'double'
    ? getSpreadLayout(imgW, imgH, vw, vh, fit, zoom, padding, isCoverAlone)
    : singleLayout;
  const dims = layout === 'double' ? spreadLayout : singleLayout;

  const isRTL = direction === 'rtl';

  // 动画变体
  const variants = {
    enter: () => ({ x: isRTL ? 80 : -80, opacity: 0 }),
    center: { x: 0, opacity: 1 },
    exit: () => ({ x: isRTL ? -80 : 80, opacity: 0 }),
  };

  // 手势
  const swipeRef = useRef(null);
  useEffect(() => {
    const d = createSwipeDetector(goForward, goBack);
    swipeRef.current = d;
  }, [goForward, goBack]);

  const handlePointerDown = useCallback((e) => {
    swipeRef.current?.onDown(e.clientX, e.clientY);
  }, []);
  const handlePointerMove = useCallback((e) => {
    swipeRef.current?.onMove(e.clientX, e.clientY);
  }, []);
  const handlePointerUp = useCallback((e) => {
    const result = swipeRef.current?.onUp(e.clientX, e.clientY);
    if (result === 'next') goForward();
    else if (result === 'prev') goBack();
  }, [isRTL, goForward, goBack]);

  const rightPageIndex = Math.min(currentPage + 1, totalPages - 1);
  const hasRightPage = layout === 'double' && !isCoverAlone && rightPageIndex > currentPage;

  return (
    <div className="r-viewport"
      onPointerDown={handlePointerDown} onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}>
      {/* 左右点击区 — ←→ 固定语义，不随 RTL/LTR 翻转 */}
      {!uiVisible && <>
        <div className="r-flip-area prev" onClick={goBack} />
        <div className="r-flip-area next" onClick={goForward} />
      </>}

      <AnimatePresence mode="wait">
        <motion.div key={currentPage}
          custom={flipDirRef.current}
          variants={variants}
          initial="enter" animate="center" exit="exit"
          transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center',
            gap: 0, maxWidth: '100%', maxHeight: '100%' }}>
          {/* 左页 (或单页) */}
          <PageCanvas
            name={images[currentPage]} index={currentPage}
            total={totalPages} width={dims.width} height={dims.height}
            shadow onLoad={(w, h) => setImgDim(currentPage, w, h)} />
          {/* 右页 (双页模式) */}
          {hasRightPage && (
            <>
              <div className="r-gutter"><div className="r-gutter-inner" /></div>
              <PageCanvas
                name={images[rightPageIndex]} index={rightPageIndex}
                total={totalPages} width={dims.width} height={dims.height}
                shadow onLoad={(w, h) => setImgDim(rightPageIndex, w, h)} />
            </>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
