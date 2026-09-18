import { useRef, useEffect, useCallback, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { PageCanvas } from './PageCanvas';
import { createSwipeDetector } from './gestureUtils';
import { getImageLayout } from './useReaderEngine';

/** 画廊容器内边距（与下方 .r-gallery 的 padding 保持一致） */
const GALLERY_PAD = 8

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
  const scrollBoxRef = useRef(null);
  const setImgDim = useCallback((i, w, h) => {
    setDimsMap(prev => {
      const cur = prev[i];
      if (cur && cur.w === w && cur.h === h) return prev;
      return { ...prev, [i]: { w, h } };
    });
  }, []);

  // 实测视口尺寸：宽度需扣除画廊容器内边距，否则"适应宽度"会比可视区宽出 2×padding
  const [box, setBox] = useState({ w: 0, h: 0 });
  const vpRef = useRef(null);
  useEffect(() => {
    const el = vpRef.current;
    if (!el) return;
    const measure = () => setBox({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    ro?.observe(el);
    window.addEventListener('resize', measure);
    return () => { ro?.disconnect(); window.removeEventListener('resize', measure); };
  }, []);

  const chromeTop = viewport?.top ?? 44;
  const chromeBottom = viewport?.bottom ?? 36;
  // 实测可用区域：扣画廊内边距 + HUD/底栏高度。
  // 下面 .r-gallery 的 padding 使用同一组值，保证「算出来的尺寸」与「实际摆放位置」一致，
  // 否则图片会按整屏居中而被工具栏遮住下沿（高度看起来"没适应"）
  const availW = Math.max(0, (box.w || viewport?.w || window.innerWidth) - GALLERY_PAD * 2);
  const availH = Math.max(0, (box.h || viewport?.h || window.innerHeight) - chromeTop - chromeBottom);

  // 用图片自然尺寸 + fit/zoom 计算实际显示尺寸（零扭曲）
  const dims = dimsMap[currentPage];
  const layout = dims?.w && dims?.h
    ? getImageLayout(dims.w, dims.h, availW, availH, fit, zoom, padding, { top: 0, bottom: 0 })
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

  // 手势结束的统一处理（鼠标指针路径与触摸事件路径共用）
  const finishSwipe = useCallback((clientX, clientY) => {
    const r = swipeRef.current?.onUp(clientX, clientY);
    if (!r || r.action === 'click' || r.action === 'cancel') return;
    suppressClickRef.current = true;

    // 内容溢出时（放大 / 适应宽度下页面高于视口），滑动优先用于平移：
    // 只有滚动已到达对应边界，才把这次滑动用于翻页，避免两种手势互相吃掉
    if (needScroll) {
      const sc = scrollBoxRef.current;
      if (!sc) return;
      const forward = r.action === 'next';
      const axisY = r.axis === 'y';
      const pos = axisY ? sc.scrollTop : sc.scrollLeft;
      const view = axisY ? sc.clientHeight : sc.clientWidth;
      const total = axisY ? sc.scrollHeight : sc.scrollWidth;
      const atStart = pos <= 2;
      const atEnd = pos + view >= total - 2;
      if (forward && !atEnd) return;
      if (!forward && !atStart) return;
    }

    if (r.axis === primaryAxis) {
      if (r.action === 'next') goForward();
      else goBack();
    } else {
      if (r.action === 'next') onNextGallery?.();
      else onPrevGallery?.();
    }
  }, [goForward, goBack, primaryAxis, onPrevGallery, onNextGallery, needScroll]);

  // 鼠标：走指针事件。触摸不走这里——内容溢出时浏览器接管平移会触发 pointercancel，
  // 指针流被取消后收不到 pointerup，滑动就判不出来（表现为"只能点击翻页"）
  const handlePointerDown = useCallback((e) => {
    if (e.pointerType && e.pointerType !== 'mouse') return;
    suppressClickRef.current = false
    swipeRef.current?.onDown(e.clientX, e.clientY);
  }, []);
  const handlePointerMove = useCallback((e) => {
    if (e.pointerType && e.pointerType !== 'mouse') return;
    swipeRef.current?.onMove(e.clientX, e.clientY);
  }, []);
  const handlePointerUp = useCallback((e) => {
    if (e.pointerType && e.pointerType !== 'mouse') return;
    finishSwipe(e.clientX, e.clientY);
  }, [finishSwipe]);

  // 触摸：touch 事件不会因浏览器接管平移而取消，所以"内容溢出"时滑动翻页同样可用
  useEffect(() => {
    const el = vpRef.current;
    if (!el) return;
    const onStart = (e) => {
      const t = e.touches?.[0]; if (!t) return;
      suppressClickRef.current = false;
      swipeRef.current?.onDown(t.clientX, t.clientY);
    };
    const onMove = (e) => {
      const t = e.touches?.[0]; if (t) swipeRef.current?.onMove(t.clientX, t.clientY);
    };
    const onEnd = (e) => {
      const t = e.changedTouches?.[0]; if (t) finishSwipe(t.clientX, t.clientY);
    };
    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchmove', onMove, { passive: true });
    el.addEventListener('touchend', onEnd, { passive: true });
    el.addEventListener('touchcancel', onEnd, { passive: true });
    return () => {
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchmove', onMove);
      el.removeEventListener('touchend', onEnd);
      el.removeEventListener('touchcancel', onEnd);
    };
  }, [finishSwipe]);

  // 滑动触发翻页后，吞掉随后的 click，避免热区再次翻页（双翻页）
  const handleClickCapture = useCallback((e) => {
    if (suppressClickRef.current) {
      e.stopPropagation();
      suppressClickRef.current = false;
    }
  }, []);

  return (
    <div className="r-viewport" ref={vpRef}
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
          <div className="r-gallery" style={{
            paddingLeft: GALLERY_PAD, paddingRight: GALLERY_PAD,
            paddingTop: chromeTop, paddingBottom: chromeBottom,
          }}>
            <div ref={scrollBoxRef} style={{
              width: '100%', height: '100%',
              overflow: needScroll ? 'auto' : 'hidden',
              // 未溢出：禁用浏览器默认触摸手势，让指针事件完整送达 -> 滑动翻页可靠
              // 已溢出：交还原生平移，滑动用于查看超出部分
              touchAction: needScroll ? 'pan-x pan-y' : 'none',
              overscrollBehavior: 'contain',
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
