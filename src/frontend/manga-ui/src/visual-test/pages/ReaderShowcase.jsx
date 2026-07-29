import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useReaderEngine } from '../reader/useReaderEngine';
import PaginatedView from '../reader/PaginatedView';
import ContinuousView from '../reader/ContinuousView';
import ReaderToolbar from '../reader/ReaderToolbar';
import '../reader/reader.css';

const API = '/api/local-images';
const IMG_COUNT_LABEL = 'ENDFIELD';

/**
 * ReaderShowcase — 阅读器入口
 *
 * 职责:
 *   1. 加载图片列表
 *   2. 组装 useReaderEngine + Toolbar + View
 *   3. 处理全局键盘/鼠标事件
 */
export default function ReaderShowcase() {
  const [images, setImages] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [showThumbs, setShowThumbs] = useState(false);
  const uiTimerRef = useRef(null);

  // ── 加载图片列表 ──
  useEffect(() => {
    fetch(API).then(r => r.json()).then(data => {
      const names = Array.isArray(data) ? data.map(d => d.name || d) : [];
      setImages(names);
      setLoaded(true);
    }).catch(() => {
      setImages(Array.from({ length: 10 }, (_, i) => `demo_${i + 1}`));
      setLoaded(true);
    });
  }, []);

  // ── Core Engine ──
  const engine = useReaderEngine(images.length);
  const {
    currentPage, totalPages, layout, direction, flow, fit, zoom,
    background, bgValue, padding, uiVisible,
    slideshowActive, slideshowInterval, scrollSpeed,
    pageStep, canBack, canForward, isCoverAlone, flipDirRef, viewport,
    setCurrentPage, setLayout, setDirection, setFlow, setFit, setZoom,
    setBackground, setPadding, setUiVisible,
    setSlideshowInterval, setScrollSpeed,
    goForward, goBack, goFirst, goLast, setFitCycled, zoomIn, zoomOut, zoomReset,
    setBgCycled, toggleSlideshow, setSlideshowActive,
    scrollerRef,
  } = engine;

  // ── UI 自动隐藏 ──
  const clearTimer = useCallback(() => clearTimeout(uiTimerRef.current), []);
  const startTimer = useCallback(() => {
    clearTimer();
    uiTimerRef.current = setTimeout(() => { setUiVisible(false); setShowThumbs(false); }, 4000);
  }, [setUiVisible, clearTimer]);

  useEffect(() => {
    if (!uiVisible && !showThumbs) return clearTimer();
    startTimer();
    return clearTimer;
  }, [uiVisible, showThumbs, currentPage, startTimer, clearTimer]);

  const handleCenterClick = useCallback(() => {
    setUiVisible(v => !v);
    if (!uiVisible) setShowThumbs(true);
  }, [uiVisible, setUiVisible]);

  // ── 作品级导航 (placeholder, 后续对接真实作品列表) ──
  const onPrevGallery = useCallback(() => console.log('[Reader] prev gallery'), []);
  const onNextGallery = useCallback(() => console.log('[Reader] next gallery'), []);

  // ── 键盘 ──
  useEffect(() => {
    const onKey = (e) => {
      // Ctrl + 数字/滚轮 → 缩放 (不受 flow/direction 影响)
      if (e.ctrlKey || e.metaKey) {
        if (e.key === '=' || e.key === '+') { e.preventDefault(); zoomIn(); }
        else if (e.key === '-') { e.preventDefault(); zoomOut(); }
        return;
      }
      // ←→ 永远翻页
      if (e.key === 'ArrowRight') { e.preventDefault(); goForward(); return; }
      if (e.key === 'ArrowLeft')  { e.preventDefault(); goBack(); return; }
      // ↑↓: paginated → 作品导航; continuous → 滚动
      if (e.key === 'ArrowUp') {
        if (flow === 'paginated') { e.preventDefault(); onPrevGallery(); }
        else if (scrollerRef.current) { e.preventDefault(); scrollerRef.current.scrollTop -= 300; }
        return;
      }
      if (e.key === 'ArrowDown') {
        if (flow === 'paginated') { e.preventDefault(); onNextGallery(); }
        else if (scrollerRef.current) { e.preventDefault(); scrollerRef.current.scrollTop += 300; }
        return;
      }
      // PgUp/PgDn 永远作品导航
      if (e.key === 'PageUp')   { e.preventDefault(); onPrevGallery(); return; }
      if (e.key === 'PageDown') { e.preventDefault(); onNextGallery(); return; }
      // Home/End 永远首尾页
      if (e.key === 'Home') { e.preventDefault(); goFirst(); return; }
      if (e.key === 'End')  { e.preventDefault(); goLast(); return; }
      // 功能键
      if (e.key === 'Tab') { e.preventDefault(); setUiVisible(v => !v); }
      if (e.key === ' ')   { e.preventDefault(); toggleSlideshow(); }
      if (e.key === '0') zoomReset();
      if (e.key === 'f') setFlow(f => f === 'paginated' ? 'continuous' : 'paginated');
      if (e.key === 'd') setDirection(d => d === 'rtl' ? 'ltr' : 'rtl');
      if (e.key === 'l' && ((flow === 'paginated' && direction === 'horizontal') || (flow === 'continuous' && direction === 'vertical')))
          setLayout(l => l === 'auto' ? 'single' : l === 'single' ? 'double' : 'auto');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [goForward, goBack, goFirst, goLast, flow, zoomIn, zoomOut, zoomReset, toggleSlideshow,
    setUiVisible, setFlow, setDirection, setLayout, scrollerRef, onPrevGallery, onNextGallery]);

  // ── 滚轮缩放 ──
  const handleWheel = useCallback((e) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      e.deltaY < 0 ? zoomIn() : zoomOut();
    }
  }, [zoomIn, zoomOut]);

  if (!loaded) return <div className="r-root"><div className="r-img-spinner">Loading...</div></div>;

  return (
    <div className="r-root" style={{ background: bgValue }}
      onClick={(e) => {
        const t = e.target;
        if (t.classList.contains('r-flip-area')) return;
        if (t.closest('.r-hud') || t.closest('.r-bar')) return;
        handleCenterClick();
      }}
      onWheel={handleWheel}>
      {/* Toolbar */}
      <ReaderToolbar
        uiVisible={uiVisible} showThumbs={showThumbs}
        title={IMG_COUNT_LABEL + (images.length ? ` (${images.length})` : '')}
        currentPage={currentPage} totalPages={totalPages}
        layout={layout} direction={direction} flow={flow} fit={fit} zoom={zoom}
        background={background} padding={padding}
        slideshowActive={slideshowActive} slideshowInterval={slideshowInterval}
        setUiVisible={setUiVisible} setShowThumbs={setShowThumbs}
        setLayout={setLayout} setDirection={setDirection} setFlow={setFlow}
        setBgCycled={setBgCycled} setPadding={setPadding} setFitCycled={setFitCycled}
        zoomIn={zoomIn} zoomOut={zoomOut} zoomReset={zoomReset}
        toggleSlideshow={toggleSlideshow} setSlideshowInterval={setSlideshowInterval}
        goForward={goForward} goBack={goBack}
        images={images} pageStep={pageStep} setCurrentPage={setCurrentPage}
      />

      {/* View */}
      {flow === 'paginated' ? (
        <PaginatedView
          images={images} currentPage={currentPage} pageStep={pageStep}
          totalPages={totalPages} layout={layout} direction={direction}
          flow={flow} fit={fit} zoom={zoom} padding={padding}
          isCoverAlone={isCoverAlone} flipDirRef={flipDirRef}
          viewport={viewport}
          goForward={goForward} goBack={goBack}
          setUiVisible={setUiVisible} uiVisible={uiVisible}
        />
      ) : (
        <ContinuousView
          images={images} direction={direction} fit={fit} zoom={zoom}
          padding={padding} viewport={viewport}
          scrollerRef={scrollerRef}
          uiVisible={uiVisible} setUiVisible={setUiVisible}
        />
      )}

      {/* 导航提示 */}
      {!uiVisible && flow === 'paginated' && (
        <div className="r-nav-hint visible">
          ← 上一页 · 下一页 → &nbsp;|&nbsp; ↑↓ 作品切换 &nbsp;|&nbsp; PgUp/PgDn 作品切换 &nbsp;|&nbsp; Home/End 首尾
        </div>
      )}
    </div>
  );
}
