import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, Columns, AlignJustify, ArrowLeftRight, ArrowUpDown,
  BookOpen, GripHorizontal, Sun, ZoomIn, ZoomOut, Maximize, Play, Pause,
} from 'lucide-react';
import ThumbnailStrip from './ThumbnailStrip';

const Btn = React.memo(({ active, onClick, title, icon, compact }) => (
  <motion.button whileTap={{ scale: 0.9 }} onClick={onClick} title={title}
    className={`r-btn ${active ? 'active' : ''} ${compact ? 'compact' : ''}`}>
    {icon}
  </motion.button>
));
const Sep = () => <span className="r-sep" />;
const BtnGroup = React.memo(({ children }) => <div className="r-btn-group">{children}</div>);

export default function ReaderToolbar({
  // 状态
  uiVisible, showThumbs,
  title, currentPage, totalPages,
  layout, direction, flow, fit, zoom, background, padding,
  slideshowActive, slideshowInterval,
  // 操作
  setUiVisible, setShowThumbs,
  setLayout, setDirection, setFlow,
  setBgCycled, setPadding, setFitCycled,
  zoomIn, zoomOut, zoomReset,
  toggleSlideshow, setSlideshowInterval,
  goBack: _goBack, goForward: _goForward,
  // 图片
  images, pageStep, setCurrentPage,
}) {
  const fitLabel = fit === 'both' ? '⊡' : fit === 'width' ? '⊡W' : fit === 'height' ? '⊡H' : '1:1';
  const bgName = ['暗色', '纯黑', '纸色'][background];
  const isPaginated = flow === 'paginated';
  // 单双页有意义: 仅 paginated+horizontal 或 continuous+vertical
  const showLayout = (flow === 'paginated' && direction === 'horizontal')
                  || (flow === 'continuous' && direction === 'vertical');

  return (
    <>
      {/* Top HUD */}
      <AnimatePresence>
        {uiVisible && (
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }} className="r-hud">
            <button className="r-hud-back" onClick={() => window.history.back()}>
              <ArrowLeft size={16} />返回
            </button>
            <div>
              <div className="r-hud-title">{title}</div>
              <div className="r-hud-sub">{currentPage + 1}/{totalPages}</div>
            </div>
            <div style={{ display: 'flex', gap: 4 }}>
              {showLayout && (
                <Btn active={layout === 'single'} onClick={() => setLayout(l => l === 'double' ? 'single' : 'double')}
                  title="单/双页" icon={layout === 'single' ? <AlignJustify size={15} /> : <Columns size={15} />} />
              )}
              <Btn active={direction === 'ltr'} onClick={() => setDirection(d => d === 'rtl' ? 'ltr' : 'rtl')}
                title="阅读方向" icon={direction === 'rtl' ? <ArrowLeftRight size={15} /> : <ArrowLeftRight size={15} style={{transform:'scaleX(-1)'}} />} />
              <Btn active={showThumbs} onClick={() => { setShowThumbs(v => !v); if (!uiVisible) setUiVisible(true); }}
                title="缩略图" icon={<GripHorizontal size={15} />} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Slideshow 指示器 */}
      <AnimatePresence>
        {slideshowActive && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="r-sso-indicator">
            ▶ {isPaginated ? `${slideshowInterval}s` : `${120}px/s`}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Bottom Bar */}
      <AnimatePresence>
        {uiVisible && (
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }} className="r-bar">
            {/* 缩略图 */}
            <ThumbnailStrip
              open={showThumbs} images={images}
              currentPage={currentPage} pageStep={pageStep}
              isCoverAlone={flow === 'paginated' && layout === 'double' && currentPage === 0}
              onJump={(i) => {
                if (flow === 'paginated' && layout === 'double') {
                  // 封面(0)独占, 其余成对: 1-2→1, 3-4→3, 5-6→5...
                  if (i === 0) setCurrentPage(0);
                  else setCurrentPage(((i - 1) / 2 | 0) * 2 + 1);
                } else setCurrentPage(i);
              }} />
            {/* 工具行 */}
            <div className="r-bar-row" onPointerDown={e => e.stopPropagation()}>
              {showLayout && (
                <>
              <BtnGroup>
                <Btn compact active={layout === 'double'} onClick={() => setLayout('double')}
                  title="双页" icon={<Columns size={14} />} />
                <Btn compact active={layout === 'single'} onClick={() => setLayout('single')}
                  title="单页" icon={<AlignJustify size={14} />} />
              </BtnGroup>
              <Sep />
                </>
              )}
              <BtnGroup>
                <Btn compact active={direction === 'horizontal'} onClick={() => setDirection('horizontal')}
                  title="横向" icon={<ArrowLeftRight size={14} />} />
                <Btn compact active={direction === 'vertical'} onClick={() => setDirection('vertical')}
                  title="纵向" icon={<ArrowUpDown size={14} />} />
              </BtnGroup>
              <Sep />
              <BtnGroup>
                <Btn compact active={isPaginated} onClick={() => setFlow('paginated')}
                  title="翻页" icon={<BookOpen size={14} />} />
                <Btn compact active={!isPaginated} onClick={() => setFlow('continuous')}
                  title="滚动" icon={<ArrowUpDown size={14} />} />
              </BtnGroup>
              <Sep />
              <BtnGroup>
                <Btn onClick={zoomOut} title="缩小" icon={<ZoomOut size={14} />} />
                <span style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)',
                  minWidth: 40, textAlign: 'center', cursor: 'pointer', lineHeight: '28px' }}
                  onClick={setFitCycled} title="Fit模式">
                  {fitLabel} {zoom !== 1 ? `${Math.round(zoom * 100)}%` : ''}
                </span>
                <Btn onClick={zoomIn} title="放大" icon={<ZoomIn size={14} />} />
              </BtnGroup>
              <Sep />
              <Btn active={slideshowActive} onClick={toggleSlideshow}
                title={slideshowActive ? '暂停' : isPaginated ? `幻灯片 ${slideshowInterval}s` : '自动滚动'}
                icon={slideshowActive ? <Pause size={14} /> : <Play size={14} />} />
              <Btn active={background > 0} onClick={setBgCycled}
                title={`背景: ${bgName}`} icon={<Sun size={14} />} />
              {/* 间距 */}
              <span className="r-pad-ctrl">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                  strokeWidth="2" style={{ flexShrink: 0, color: 'var(--text-muted)' }}>
                  <rect x="3" y="3" width="18" height="18" rx="2" />
                </svg>
                <input type="range" min={0} max={30} step={5} value={padding}
                  onChange={e => setPadding(Number(e.target.value))}
                  className="r-pad-slider" title={`间距 ${padding}%`} />
                <input type="number" min={0} max={30} step={5} value={padding}
                  onChange={e => { const v = Math.min(30, Math.max(0, Number(e.target.value))); setPadding(v); }}
                  className="r-pad-input" />
                <span style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-muted)', flexShrink: 0 }}>%</span>
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
