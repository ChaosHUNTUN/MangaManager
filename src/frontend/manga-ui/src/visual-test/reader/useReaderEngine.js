import { useState, useCallback, useRef, useEffect, useMemo } from 'react';

/**
 * 阅读器核心状态机
 *
 * 状态模型 (扁平, 不交叉派生):
 *   currentPage, pageStep, layout, direction, flow, fit, zoom,
 *   background, padding, uiVisible, slideshowActive, slideshowInterval, scrollSpeed
 *
 * 零扭曲保证:
 *   所有图片使用同一个 scale 作用在 width 和 height 上, 绝不分轴缩放。
 */

const DEFAULTS = {
  layout: 'auto',        // 'auto' | 'single' | 'double'
  direction: 'rtl',       // 'rtl'(日漫) | 'ltr'(西漫)
  flow: 'paginated',      // 'paginated' | 'continuous'
  fit: 'both',            // 'both' | 'width' | 'height' | 'original'
  zoom: 1.0,
  background: 0,          // 0=暗色, 1=纯黑, 2=纸色
  padding: 0,             // 0-30 %
  slideshowActive: false,
  slideshowInterval: 5,   // 秒
  scrollSpeed: 120,       // px/s
};

const BGS = ['var(--canvas)', '#000000', '#f5eddc'];

/** 计算可用区域 */
function getAvailableArea(viewportW, viewportH, padding) {
  const h = viewportH - 44 - 36; // HUD + 工具栏
  const p = Math.round(h * padding / 100);
  return { width: viewportW - p * 2, height: h - p * 2 };
}

/** ─── 零扭曲核心 ─── */
export function getImageLayout(imgW, imgH, viewportW, viewportH, fit, zoom, padding = 0) {
  if (!imgW || !imgH) return { width: 0, height: 0, scale: 1, overflowX: false, overflowY: false };
  const avail = getAvailableArea(viewportW, viewportH, padding);
  let fitScale = 1;
  switch (fit) {
    case 'both':    fitScale = Math.min(avail.width / imgW, avail.height / imgH, 1); break;
    case 'width':   fitScale = avail.width / imgW; break;
    case 'height':  fitScale = avail.height / imgH; break;
    case 'original': fitScale = 1; break;
    default:        fitScale = Math.min(avail.width / imgW, avail.height / imgH, 1);
  }
  const scale = fitScale * zoom;
  const w = Math.round(imgW * scale);
  const h = Math.round(imgH * scale);
  return { width: w, height: h, scale, overflowX: w > avail.width, overflowY: h > avail.height };
}

/** 双页模式每页可用区域
 *  - isCover=true: 封面独自占整页 (width = avail.width)
 *  - 普通双页: 每页占 (avail.width - gutter) / 2
 */
export function getSpreadLayout(imgW, imgH, viewportW, viewportH, fit, zoom, padding, isCover = false) {
  const avail = getAvailableArea(viewportW, viewportH, padding);
  const gutter = 4;
  // 封面单独占整页宽度, 普通双页各占半页
  const pageW = isCover ? avail.width : Math.floor((avail.width - gutter) / 2);
  let fitScale = 1;
  switch (fit) {
    case 'both':    fitScale = Math.min(pageW / imgW, avail.height / imgH, 1); break;
    case 'width':   fitScale = pageW / imgW; break;
    case 'height':  fitScale = avail.height / imgH; break;
    case 'original': fitScale = 1; break;
    default:        fitScale = Math.min(pageW / imgW, avail.height / imgH, 1);
  }
  const scale = fitScale * zoom;
  const w = Math.round(imgW * scale);
  const h = Math.round(imgH * scale);
  return { width: w, height: h, scale, overflowX: w > pageW, overflowY: h > avail.height };
}

export function useReaderEngine(totalPages, viewportRef) {
  const [currentPage, setCurrentPage] = useState(0);
  const [layout, setLayout] = useState(DEFAULTS.layout);
  const [direction, setDirection] = useState(DEFAULTS.direction);
  const [flow, setFlow] = useState(DEFAULTS.flow);
  const [fit, setFit] = useState(DEFAULTS.fit);
  const [zoom, setZoom] = useState(DEFAULTS.zoom);
  const [background, setBackground] = useState(DEFAULTS.background);
  const [padding, setPadding] = useState(DEFAULTS.padding);
  const [uiVisible, setUiVisible] = useState(true);
  const [slideshowActive, setSlideshowActive] = useState(DEFAULTS.slideshowActive);
  const [slideshowInterval, setSlideshowInterval] = useState(DEFAULTS.slideshowInterval);
  const [scrollSpeed, setScrollSpeed] = useState(DEFAULTS.scrollSpeed);

  const flipDirRef = useRef(0);
  const [viewport, setViewport] = useState({ w: window.innerWidth, h: window.innerHeight });

  // 监听窗口尺寸变化
  useEffect(() => {
    const onResize = () => setViewport({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // ── 布局约束: 不合理的组合自动修正 ──
  // paginated+vertical → double 无意义 (不应上下堆叠两页翻)
  // continuous+horizontal → double 无意义 (横向滚动每图全高)
  useEffect(() => {
    if (flow === 'paginated' && direction === 'vertical' && layout === 'double') {
      setLayout('single');
    }
    if (flow === 'continuous' && direction === 'horizontal' && layout === 'double') {
      setLayout('single');
    }
  }, [flow, direction, layout]);

  // 衍生
  const pageStep = useMemo(() => layout === 'double' && flow === 'paginated' ? 2 : 1,
    [layout, flow]);
  const N = totalPages;
  const canBack = currentPage > 0;
  const canForward = currentPage + pageStep < N;

  // 封面特殊处理
  const isCoverAlone = layout === 'double' && flow === 'paginated' && currentPage === 0;

  const goForward = useCallback(() => {
    flipDirRef.current = 1;
    setCurrentPage(p => {
      // 封面独占一页: 从 0 到 1, 而非 0 跳 2
      const isCover = layout === 'double' && flow === 'paginated' && p === 0;
      const step = isCover ? 1 : pageStep;
      const next = p + step;
      if (next >= N) {
        if (slideshowActive) setSlideshowActive(false);
        return p;
      }
      return next;
    });
  }, [pageStep, N, slideshowActive, layout, flow]);

  const goBack = useCallback(() => {
    flipDirRef.current = -1;
    setCurrentPage(p => {
      // 从 1 回到 0 (封面), 步退 1 而非 2
      const isCover = layout === 'double' && flow === 'paginated' && p > 0 && p <= pageStep;
      const step = isCover ? p : pageStep; // p=1 时退 1 步到 0, p=pageStep 时退 pageStep 步
      return Math.max(p - step, 0);
    });
  }, [pageStep, layout, flow]);

  const goFirst = useCallback(() => { flipDirRef.current = -1; setCurrentPage(0); }, []);
  const goLast = useCallback(() => {
    flipDirRef.current = 1;
    // 双页模式: 最后一对从倒数第2页开始, 或单独一页
    if (layout === 'double' && flow === 'paginated') {
      if (N <= 1) return;
      const last = N - 1;
      // 倒数第2和第1页成对, 或仅最后一页
      setCurrentPage(last > 0 ? last - 1 : 0);
    } else {
      setCurrentPage(Math.max(0, N - 1));
    }
  }, [N, layout, flow]);

  const setFitCycled = useCallback(() => {
    const order = ['both', 'width', 'height', 'original'];
    const idx = order.indexOf(fit);
    setFit(order[(idx + 1) % order.length]);
    setZoom(1.0);
  }, [fit]);

  const zoomIn = useCallback(() => setZoom(z => Math.min(z + 0.25, 3.0)), []);
  const zoomOut = useCallback(() => setZoom(z => Math.max(z - 0.25, 0.25)), []);
  const zoomReset = useCallback(() => { setZoom(1.0); setFit('both'); }, []);

  const setDirectionCycled = useCallback(() => setDirection(d => d === 'rtl' ? 'ltr' : 'rtl'), []);
  const setFlowCycled = useCallback(() => setFlow(f => f === 'paginated' ? 'continuous' : 'paginated'), []);
  const setLayoutCycled = useCallback(() => {
    setLayout(l => l === 'auto' ? 'single' : l === 'single' ? 'double' : 'auto');
  }, []);
  const setBgCycled = useCallback(() => setBackground(b => (b + 1) % 3), []);

  const fitCycle = fit;
  const bgValue = BGS[background];

  // 幻灯片/自动滚动
  const slideshowRef = useRef(null);
  useEffect(() => {
    if (!slideshowActive) { clearInterval(slideshowRef.current); return; }
    const fn = () => setCurrentPage(p => {
      const next = p + pageStep;
      if (next >= N) { setSlideshowActive(false); return p; }
      return next;
    });
    slideshowRef.current = setInterval(fn, slideshowInterval * 1000);
    return () => clearInterval(slideshowRef.current);
  }, [slideshowActive, slideshowInterval, pageStep, N]);

  const toggleSlideshow = useCallback(() => setSlideshowActive(s => !s), []);

  const scrollerRef = useRef(null);

  return {
    // 状态
    currentPage, totalPages: N, layout, direction, flow, fit, zoom,
    background, bgValue, padding, uiVisible,
    slideshowActive, slideshowInterval, scrollSpeed,
    // 衍生
    pageStep, canBack, canForward, isCoverAlone, flipDirRef, viewport,
    // 操作
    setCurrentPage, setLayout, setDirection, setFlow, setFit, setZoom,
    setBackground, setPadding, setUiVisible,
    setSlideshowInterval, setScrollSpeed,
    goForward, goBack, goFirst, goLast, setFitCycled, zoomIn, zoomOut, zoomReset,
    setDirectionCycled, setFlowCycled, setLayoutCycled, setBgCycled,
    fitCycle, toggleSlideshow, setSlideshowActive,
    scrollerRef,
  };
}
