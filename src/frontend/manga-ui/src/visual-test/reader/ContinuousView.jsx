import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getImageLayout } from './useReaderEngine';

/**
 * ContinuousView — 滚动模式
 *
 * 画廊 + 画框结构: .r-gallery > .r-frame × N
 * direction='horizontal' → 画廊横向延伸, 画框纵向撑满
 * direction='vertical'   → 画廊纵向延伸, 画框横向撑满
 *
 * fit/zoom 通过 getImageLayout 计算每帧实际尺寸（零扭曲）。
 * 滚动时通过 onScroll 跟踪当前页（onPageChange），外部 currentPage 变化则滚动到对应帧。
 */
const IMAGE_URL = (name) => {
  if (!name) return name;
  if (name.startsWith('http') || name.startsWith('/api')) return name;
  return `/local-images/${encodeURIComponent(name)}`;
};

const Frame = React.memo(function Frame({ name, index, total, layout, isHoriz, marginPx, onImgLoad, intrinsic }) {
  const hasLayout = !!layout;
  return (
    <div className="r-frame" style={{
      flexShrink: 0, position: 'relative', minHeight: 0,
      width: hasLayout ? layout.width : (isHoriz ? 'auto' : '100%'),
      height: hasLayout ? layout.height : (isHoriz ? '100%' : 'auto'),
      padding: marginPx, boxSizing: 'border-box',
      overflow: 'hidden',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      // 窗口化渲染：离屏帧跳过渲染（content-visibility），占位尺寸先撑起完整滚动条，
      // 图片加载后浏览器自动记住真实尺寸（contain-intrinsic-size: auto ...）
      contentVisibility: 'auto',
      containIntrinsicSize: `auto ${intrinsic.w}px ${intrinsic.h}px`,
    }}>
      <img src={IMAGE_URL(name)} alt={`p${index + 1}`} draggable={false}
        loading="lazy" decoding="async"
        style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }}
        onLoad={(e) => onImgLoad(index, e.target.naturalWidth, e.target.naturalHeight)}
        onError={() => {}} />
      <span style={{
        position: 'absolute', bottom: 4, right: 6, zIndex: 2,
        fontSize: 9, fontFamily: 'var(--font-mono)', color: 'var(--text-dim)',
        background: 'var(--glass-bg)', backdropFilter: 'blur(6px)',
        padding: '1px 5px', borderRadius: 'var(--radius-xs)', pointerEvents: 'none',
      }}>{index + 1}/{total}</span>
    </div>
  );
});

export default function ContinuousView({
  images, direction, fit = 'both', zoom = 1, viewport, padding = 0,
  scrollerRef, setUiVisible, currentPage, onPageChange, onOffsetChange,
  scrollRestore, onRestoreApplied, readingOrder = 'ltr',
}) {
  const isHoriz = direction === 'horizontal';
  const rtl = isHoriz && readingOrder === 'rtl';
  const chromeTop = viewport?.top ?? 44;
  const chromeBottom = viewport?.bottom ?? 36;

  // 实测滚动容器尺寸：clientWidth 会排除竖向滚动条占位，
  // 否则"适应宽度"会按窗口宽渲染，多出滚动条宽度的假横向溢出
  const [box, setBox] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = scrollerRef?.current;
    if (!el) return;
    const measure = () => setBox({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    ro?.observe(el);
    window.addEventListener('resize', measure);
    return () => { ro?.disconnect(); window.removeEventListener('resize', measure); };
  }, [scrollerRef]);

  const fullH = box.h || viewport?.h || window.innerHeight;
  const fullW = box.w || viewport?.w || window.innerWidth;
  // 滚动区域高度 ≈ 视口 - HUD - 底部栏（与 getImageLayout 同口径）；纵向帧宽=容器宽，横向帧高=容器高
  const scrollerH = Math.max(100, fullH - chromeTop - chromeBottom);
  const marginPx = Math.round(scrollerH * padding / 100);
  const intrinsic = useMemo(() => ({
    w: Math.round(isHoriz ? scrollerH * 0.7 : fullW),
    h: Math.round(scrollerH),
  }), [isHoriz, scrollerH, fullW]);
  const [dimsMap, setDimsMap] = useState({});
  const [dragging, setDragging] = useState(false);
  const movedRef = useRef(false);
  const reportedPageRef = useRef(-1);
  const dragRef = useRef({ down: false, x: 0, y: 0, sl: 0, st: 0 });

  const onImgLoad = useCallback((i, w, h) => {
    setDimsMap(prev => {
      const cur = prev[i];
      if (cur && cur.w === w && cur.h === h) return prev;
      return { ...prev, [i]: { w, h } };
    });
  }, []);

  // 每帧显示尺寸（图片未加载前为 null → 回退 100% 撑满）
  const layouts = useMemo(() => images.map((name, i) => {
    const d = dimsMap[i];
    if (!d?.w || !d?.h) return null;
    return getImageLayout(d.w, d.h, fullW, fullH, fit, zoom, padding, { top: chromeTop, bottom: chromeBottom });
  }), [images, dimsMap, fit, zoom, fullW, fullH, padding, chromeTop, chromeBottom]);

  // 滚动 → 上报当前页（视口中线所在帧）
  //
  // 性能要点（移动端快速滚动卡顿的两大来源）：
  // ① 用 rAF 合并同一帧内的多次 scroll 事件，避免每个事件都做一次布局读取 + setState；
  // ② 从上一次上报的帧索引增量查找，而不是每次都从第 0 帧遍历（长画廊里是 O(N) 次 offsetTop 读取）
  const scrollRafRef = useRef(0);
  const lastScrollTsRef = useRef(0);
  const handleScroll = useCallback(() => {
    lastScrollTsRef.current = Date.now();
    if (scrollRafRef.current) return;
    scrollRafRef.current = requestAnimationFrame(() => {
      scrollRafRef.current = 0;
      const el = scrollerRef.current;
      if (!el || el.children.length === 0 || !onPageChange) return;
      const n = el.children.length;
      const startOf = (i) => (isHoriz ? el.children[i].offsetLeft : el.children[i].offsetTop);
      const sizeOf = (i) => (isHoriz ? el.children[i].offsetWidth : el.children[i].offsetHeight);
      const mid = isHoriz ? el.scrollLeft + el.clientWidth / 2 : el.scrollTop + el.clientHeight / 2;

      // RTL(row-reverse) 下帧偏移是降序的，先判断方向再增量逼近
      const ascending = n < 2 || startOf(1) >= startOf(0);
      let idx = reportedPageRef.current;
      if (idx < 0 || idx >= n) idx = 0;
      if (ascending) {
        while (idx > 0 && mid < startOf(idx)) idx--;
        while (idx < n - 1 && mid >= startOf(idx) + sizeOf(idx)) idx++;
      } else {
        // 降序（row-reverse）：坐标更大 = 索引更小
        while (idx > 0 && mid >= startOf(idx) + sizeOf(idx)) idx--;
        while (idx < n - 1 && mid < startOf(idx)) idx++;
      }

      // 页内偏移（0~1）：当前帧内中线相对位置，供进度保存/恢复
      const start = startOf(idx);
      const size = sizeOf(idx);
      if (size > 0) {
        const offset = Math.min(1, Math.max(0, (mid - start) / size));
        onOffsetChange?.(offset);
      }
      if (idx !== reportedPageRef.current) {
        reportedPageRef.current = idx;
        onPageChange(idx);
      }
    });
  }, [isHoriz, scrollerRef, onPageChange, onOffsetChange]);

  useEffect(() => () => { if (scrollRafRef.current) cancelAnimationFrame(scrollRafRef.current); }, []);

  // 外部跳页（缩略图/Home/End/进度恢复）→ 滚动到对应帧
  // 滚动跟踪写回的 currentPage 与 reported 相等，跳过避免回拉
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el || currentPage == null || !el.children[currentPage]) return;
    if (currentPage === reportedPageRef.current) return;
    // 刚滚动过 → 这次 currentPage 变化是滚动驱动的（快速滚动时 state 会落后于实际位置），
    // 此时若执行 smooth scrollTo 会与惯性滚动打架，表现为"滚到一半被卡住/回拉"
    if (Date.now() - lastScrollTsRef.current < 250) return;
    const c = el.children[currentPage];
    el.scrollTo({
      // 减去容器上内边距，让目标帧顶部落在 HUD 下方而不是被浮层盖住
      left: isHoriz ? c.offsetLeft : el.scrollLeft,
      top: isHoriz ? el.scrollTop : Math.max(0, c.offsetTop - chromeTop),
      behavior: 'smooth',
    });
  }, [currentPage, isHoriz, scrollerRef, dimsMap, chromeTop]);

  // 画廊/方向切换后重置滚动跟踪
  useEffect(() => {
    reportedPageRef.current = -1;
  }, [images, isHoriz, rtl]);

  // 恢复页内偏移：等目标帧有真实尺寸后定位到 帧起点 + offset × 帧尺寸，应用后清空意图
  useEffect(() => {
    if (!scrollRestore) return;
    const el = scrollerRef.current;
    const { pageIndex, offset } = scrollRestore;
    if (!el || !el.children[pageIndex]) return;
    const c = el.children[pageIndex];
    const size = isHoriz ? c.offsetWidth : c.offsetHeight;
    // 帧必须已有真实尺寸（图片加载完成）：content-visibility 占位尺寸不算数，避免按估算落位
    if (!dimsMap[pageIndex] || size < 2) return;
    const start = isHoriz ? c.offsetLeft : c.offsetTop;
    const target = Math.max(0, start + size * (offset ?? 0) - (isHoriz ? 0 : chromeTop));
    el.scrollTo({
      left: isHoriz ? target : el.scrollLeft,
      top: isHoriz ? el.scrollTop : target,
      behavior: 'auto',
    });
    onRestoreApplied?.();
  }, [scrollRestore, isHoriz, scrollerRef, dimsMap, onRestoreApplied, chromeTop]);

  // grab scroll（拖拽结束后不误触 UI 切换：用 moved 标记真实位移）
  const handlePointerDown = useCallback((e) => {
    const el = scrollerRef?.current; if (!el) return;
    const isTouch = e.pointerType !== 'mouse';
    dragRef.current = {
      // 触摸屏交给原生滚动（更顺滑、带惯性）；自定义拖拽滚动仅服务鼠标
      down: !isTouch, touch: isTouch, x: e.clientX, y: e.clientY,
      sl: el.scrollLeft, st: el.scrollTop,
    };
    movedRef.current = false;
    if (!isTouch) setDragging(true);
  }, [scrollerRef]);
  const handlePointerMove = useCallback((e) => {
    const d = dragRef.current;
    if (d.touch) {
      // 触摸：只记录是否真实移动过（用于吞掉滚动后的误点击），滚动本身交给浏览器
      if (Math.abs(e.clientX - d.x) > 6 || Math.abs(e.clientY - d.y) > 6) movedRef.current = true;
      return;
    }
    const el = scrollerRef?.current;
    if (!el || !d.down) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (dx !== 0 || dy !== 0) movedRef.current = true;
    el.scrollTo({ left: d.sl - dx, top: d.st - dy });
  }, [scrollerRef]);
  const handlePointerUp = useCallback(() => {
    dragRef.current.down = false;
    setDragging(false);
  }, []);

  return (
    <div ref={scrollerRef} className={`r-scroller-gallery${dragging ? ' dragging' : ''}`}
      onScroll={handleScroll}
      onPointerDown={handlePointerDown} onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp} onPointerLeave={handlePointerUp} onPointerCancel={handlePointerUp}
      onClick={(e) => { if (!movedRef.current) { e.stopPropagation(); setUiVisible(v => !v); } }}
      style={{
        flex: 1, cursor: 'grab', minHeight: 0,
        overflowX: 'auto',
        overflowY: 'auto',
        // 允许原生触摸平移（否则自定义指针手势会与浏览器滚动竞争，导致滑动失效）
        touchAction: 'pan-x pan-y',
        // 滚到首尾时不触发页面级下拉刷新/橡皮筋
        overscrollBehavior: 'none',
        WebkitOverflowScrolling: 'touch',
        display: 'flex', flexDirection: isHoriz ? (rtl ? 'row-reverse' : 'row') : 'column',
        // 横向 RTL：row-reverse 让第 0 页在最右，向后读往左（保持 LTR 滚动语义，规避浏览器 RTL scrollLeft 差异）
        // 放大后帧可能超出视口：靠边对齐保证溢出部分可滚动到达；未放大时居中
        alignItems: zoom > 1 ? 'flex-start' : 'center', gap: 0,
        // 上下留出 HUD/底栏高度的内边距：否则首帧顶部永远压在 HUD 下、末帧底部压在底栏下（滚到 0 也露不出来）
        paddingTop: chromeTop, paddingBottom: chromeBottom, paddingLeft: 0, paddingRight: 0,
      }}>
      {images.map((name, i) => (
        <Frame key={i} name={name} index={i} total={images.length}
          layout={layouts[i]} isHoriz={isHoriz} marginPx={marginPx}
          onImgLoad={onImgLoad} intrinsic={intrinsic} />
      ))}
    </div>
  );
}
