import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { fetchReaderSettings, saveReaderSettings } from '../../api/reader';

/**
 * 阅读器核心状态机 (单页模式, 移除双页)
 *
 * 状态: currentPage, direction, flow, fit, zoom, background, padding,
 *       uiVisible, slideshowActive, slideshowInterval, scrollSpeed
 */

const DEFAULTS = {
  direction: 'vertical',
  flow: 'paginated',
  readingOrder: 'ltr',   // 横向阅读顺序：ltr=左→右，rtl=右→左（漫画）
  fit: 'both',
  zoom: 1.0,
  background: 0,
  padding: 0,
  slideshowActive: false,
  slideshowInterval: 5,
  scrollSpeed: 120,
};

const BGS = ['var(--canvas)', '#000000', '#f5eddc'];

// 阅读偏好本地持久化：记住方向/模式/缩放/背景等，跨会话保持
const STORAGE_KEY = 'manga-reader-settings-v1';
const PERSISTED_KEYS = ['direction', 'flow', 'readingOrder', 'fit', 'zoom', 'background', 'padding', 'slideshowInterval', 'scrollSpeed'];

function loadSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) || {};
      const merged = { ...DEFAULTS };
      for (const k of PERSISTED_KEYS) if (k in parsed) merged[k] = parsed[k];
      // 兼容旧版把 direction 存成 rtl/ltr 的记录 → 归一化为滚动方向
      if (merged.direction === 'rtl' || merged.direction === 'ltr') merged.direction = 'vertical';
      return merged;
    }
  } catch { /* ignore malformed storage */ }
  return { ...DEFAULTS };
}

function persistSettings(s) {
  try {
    const out = {};
    for (const k of PERSISTED_KEYS) out[k] = s[k];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(out));
  } catch { /* ignore quota/private-mode errors */ }
}

function getAvailableArea(viewportW, viewportH, padding, chrome) {
  const top = chrome?.top ?? 44;
  const bottom = chrome?.bottom ?? 36;
  const h = viewportH - top - bottom;
  const p = Math.round(h * padding / 100);
  return { width: viewportW - p * 2, height: h - p * 2 };
}

/** 零扭曲 — 宽高使用同一个 scale */
export function getImageLayout(imgW, imgH, viewportW, viewportH, fit, zoom, padding = 0, chrome) {
  if (!imgW || !imgH) return { width: 0, height: 0, scale: 1, overflowX: false, overflowY: false };
  const avail = getAvailableArea(viewportW, viewportH, padding, chrome);
  let fitScale = 1;
  switch (fit) {
    case 'both':    fitScale = Math.min(avail.width / imgW, avail.height / imgH); break;
    case 'width':   fitScale = avail.width / imgW; break;
    case 'height':  fitScale = avail.height / imgH; break;
    case 'original': fitScale = 1; break;
    default:        fitScale = Math.min(avail.width / imgW, avail.height / imgH);
  }
  const scale = fitScale * zoom;
  return {
    width: Math.round(imgW * scale),
    height: Math.round(imgH * scale),
    scale,
    overflowX: imgW * scale > avail.width,
    overflowY: imgH * scale > avail.height,
  };
}

/** @deprecated 不再使用, 保留兼容视觉测试平台 */
export const getSpreadLayout = getImageLayout;

export function useReaderEngine(totalPages) {
  const [initial] = useState(loadSettings);
  const [currentPage, setCurrentPage] = useState(0);
  const [direction, setDirection] = useState(initial.direction);
  const [flow, setFlow] = useState(initial.flow);
  const [readingOrder, setReadingOrder] = useState(initial.readingOrder === 'rtl' ? 'rtl' : 'ltr');
  const [fit, setFit] = useState(initial.fit);
  const [zoom, setZoom] = useState(initial.zoom);
  const [background, setBackground] = useState(initial.background);
  const [padding, setPadding] = useState(initial.padding);
  const [uiVisible, setUiVisible] = useState(true);
  const [slideshowActive, setSlideshowActive] = useState(DEFAULTS.slideshowActive);
  const [slideshowInterval, setSlideshowInterval] = useState(initial.slideshowInterval);
  const [scrollSpeed, setScrollSpeed] = useState(initial.scrollSpeed);

  // 偏好变更即持久化（不含瞬态 currentPage / uiVisible / slideshowActive）
  const serverReadyRef = useRef(false);   // 后端首轮读取完成后才允许写回，避免挂载瞬间用本地值覆盖服务端
  useEffect(() => {
    const snapshot = { direction, flow, readingOrder, fit, zoom, background, padding, slideshowInterval, scrollSpeed };
    persistSettings(snapshot);
    if (serverReadyRef.current) saveReaderSettings(snapshot);   // 写透后端（静默失败）
  }, [direction, flow, readingOrder, fit, zoom, background, padding, slideshowInterval, scrollSpeed]);

  // 挂载时从后端读取设置并应用（覆盖本地，实现跨浏览器/跨会话同步）；localStorage 仍是首帧快速路径
  useEffect(() => {
    let cancelled = false;
    fetchReaderSettings()
      .then(srv => {
        if (cancelled || !srv || typeof srv !== 'object') return;
        if (typeof srv.direction === 'string') setDirection(srv.direction);
        if (srv.flow === 'paginated' || srv.flow === 'continuous') setFlow(srv.flow);
        if (srv.readingOrder === 'ltr' || srv.readingOrder === 'rtl') setReadingOrder(srv.readingOrder);
        if (['both', 'width', 'height', 'original'].includes(srv.fit)) setFit(srv.fit);
        if (typeof srv.zoom === 'number' && srv.zoom >= 0.25 && srv.zoom <= 3) setZoom(srv.zoom);
        if (typeof srv.background === 'number') setBackground(srv.background);
        if (typeof srv.padding === 'number') setPadding(srv.padding);
        if (typeof srv.slideshowInterval === 'number' && srv.slideshowInterval >= 1) setSlideshowInterval(srv.slideshowInterval);
        if (typeof srv.scrollSpeed === 'number' && srv.scrollSpeed >= 20) setScrollSpeed(srv.scrollSpeed);
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) serverReadyRef.current = true; });
    return () => { cancelled = true; };
  }, []);

  const flipDirRef = useRef(0);
  const [viewport, setViewport] = useState({ w: window.innerWidth, h: window.innerHeight, top: 44, bottom: 36 });

  /** 运行时测量 HUD/底部栏实际高度，替代硬编码 44/36 */
  const updateChrome = useCallback((top, bottom) => {
    setViewport(v => ({
      ...v,
      top: Math.max(0, Math.round(top ?? 44)),
      bottom: Math.max(0, Math.round(bottom ?? 36)),
    }));
  }, []);

  useEffect(() => {
    const onResize = () => setViewport(v => ({ ...v, w: window.innerWidth, h: window.innerHeight }));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const N = totalPages;
  const pageStep = 1;
  const canBack = currentPage > 0;
  const canForward = currentPage + 1 < N;

  const goForward = useCallback(() => {
    flipDirRef.current = 1;
    setCurrentPage(p => {
      const next = p + 1;
      if (next >= N) { if (slideshowActive) setSlideshowActive(false); return p; }
      return next;
    });
  }, [N, slideshowActive]);

  const goBack = useCallback(() => {
    flipDirRef.current = -1;
    setCurrentPage(p => Math.max(p - 1, 0));
  }, []);

  const goFirst = useCallback(() => { flipDirRef.current = -1; setCurrentPage(0); }, []);
  const goLast = useCallback(() => { flipDirRef.current = 1; setCurrentPage(Math.max(0, N - 1)); }, [N]);

  const setFitCycled = useCallback(() => {
    const order = ['both', 'width', 'height', 'original'];
    const idx = order.indexOf(fit);
    setFit(order[(idx + 1) % order.length]);
    setZoom(1.0);
  }, [fit]);

  const zoomIn = useCallback(() => setZoom(z => Math.min(z + 0.25, 3.0)), []);
  const zoomOut = useCallback(() => setZoom(z => Math.max(z - 0.25, 0.25)), []);
  const zoomReset = useCallback(() => { setZoom(1.0); setFit('both'); }, []);
  const setBgCycled = useCallback(() => setBackground(b => (b + 1) % 3), []);

  // ── 幻灯片 — 翻页模式: setInterval 翻页 ──
  const slideshowRef = useRef(null);
  useEffect(() => {
    if (flow !== 'paginated' || !slideshowActive) { clearInterval(slideshowRef.current); return; }
    slideshowRef.current = setInterval(() => {
      setCurrentPage(p => {
        const next = p + 1;
        if (next >= N) { setSlideshowActive(false); return p; }
        return next;
      });
    }, slideshowInterval * 1000);
    return () => clearInterval(slideshowRef.current);
  }, [slideshowActive, slideshowInterval, N, flow]);

  // ── 幻灯片 — 连续滚动模式: rAF 匀速滚动 ──
  const directionRef = useRef(direction);
  directionRef.current = direction;
  useEffect(() => {
    if (flow !== 'continuous' || !slideshowActive) return;
    const el = scrollerRef.current;
    if (!el) return;
    let lastTime = performance.now();
    let rafId;
    const step = (now) => {
      const dt = (now - lastTime) / 1000;
      lastTime = now;
      const px = scrollSpeed * dt;
      const isHoriz = directionRef.current === 'horizontal';
      if (isHoriz) {
        const max = el.scrollWidth - el.clientWidth;
        // row-reverse 布局下前进语义已由布局反转承载：向后读仍是 scrollLeft 增大
        if (el.scrollLeft >= max - 1) { setSlideshowActive(false); return; }
        el.scrollLeft += px;
      } else {
        const max = el.scrollHeight - el.clientHeight;
        if (el.scrollTop >= max - 1) { setSlideshowActive(false); return; }
        el.scrollTop += px;
      }
      rafId = requestAnimationFrame(step);
    };
    rafId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafId);
  }, [slideshowActive, scrollSpeed, flow]);

  const toggleSlideshow = useCallback(() => setSlideshowActive(s => !s), []);
  const scrollerRef = useRef(null);

  return {
    currentPage, totalPages: N, direction, flow, fit, zoom,
    readingOrder,
    background, bgValue: BGS[background], padding, uiVisible,
    slideshowActive, slideshowInterval, scrollSpeed,
    pageStep, canBack, canForward, flipDirRef, viewport,
    setCurrentPage, setDirection, setFlow, setReadingOrder, setFit, setZoom,
    setBackground, setPadding, setUiVisible,
    setSlideshowInterval, setScrollSpeed,
    goForward, goBack, goFirst, goLast,
    setFitCycled, zoomIn, zoomOut, zoomReset, setBgCycled,
    toggleSlideshow, setSlideshowActive,
    scrollerRef, updateChrome,
  };
}
