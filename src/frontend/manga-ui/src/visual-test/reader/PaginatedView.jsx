import React, { useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { PageCanvas } from './PageCanvas';
import { createSwipeDetector } from './gestureUtils';

/** PaginatedView — 翻页模式 (纯单页) */
export default function PaginatedView({
  images, currentPage, totalPages,
  flipDirRef, viewport, padding = 0,
  goForward, goBack, setUiVisible, uiVisible,
}) {
  const imgDimsRef = useRef({});
  const setImgDim = (i, w, h) => { imgDimsRef.current[i] = { w, h }; };
  const vh = (viewport?.h || window.innerHeight) - 44 - 36;
  const marginPx = Math.round(vh * padding / 100);

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
  }, [goForward, goBack]);

  return (
    <div className="r-viewport"
      onPointerDown={handlePointerDown} onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}>
      {/* 点击区 */}
      {!uiVisible && <>
        <div className="r-flip-area prev" onClick={goBack} />
        <div className="r-flip-area next" onClick={goForward} />
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
            <div style={{ width: '100%', height: '100%' }}>
              <PageCanvas
                name={images[currentPage]} index={currentPage}
                total={totalPages}                 width="100%" height="100%" margin={marginPx}
                shadow={false} onLoad={(w, h) => setImgDim(currentPage, w, h)} />
            </div>
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
