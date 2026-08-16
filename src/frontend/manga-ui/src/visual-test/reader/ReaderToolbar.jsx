import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, ArrowLeftRight, ArrowUpDown,
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
  direction, flow, fit, zoom, background, padding,
  slideshowActive, slideshowInterval,
  // 操作
  setUiVisible, setShowThumbs,
  setDirection, setFlow,
  setBgCycled, setPadding, setFitCycled,
  zoomIn, zoomOut, zoomReset,
  toggleSlideshow, setSlideshowInterval, scrollSpeed, setScrollSpeed,
  goBack: _goBack, goForward: _goForward,
  // 图片
  images, pageStep, setCurrentPage,
}) {
  const fitLabel = fit === 'both' ? '⊡' : fit === 'width' ? '⊡W' : fit === 'height' ? '⊡H' : '1:1';
  const bgName = ['暗色', '纯黑', '纸色'][background];
  const isPaginated = flow === 'paginated';

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
            ▶ {isPaginated ? `${slideshowInterval}s` : `${scrollSpeed}px/s`}
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
              isCoverAlone={false}
              onJump={setCurrentPage} />
            {/* 进度条 (仅翻页模式, 连续模式由滚动条承担) */}
            {isPaginated && (
              <div className="r-progress-row" onPointerDown={e => e.stopPropagation()}>
                <input type="range" min={0} max={Math.max(0, totalPages - 1)} step={1}
                  value={Math.min(currentPage, Math.max(0, totalPages - 1))}
                  onChange={e => setCurrentPage(Number(e.target.value))}
                  className="r-progress-slider" title="拖拽快速跳页" />
                <span className="r-progress-label">{currentPage + 1} / {totalPages}</span>
              </div>
            )}
            {/* 工具行 */}
            <div className="r-bar-row" onPointerDown={e => e.stopPropagation()}>
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
              {slideshowActive && (
                isPaginated ? (
                  <span className="r-speed-ctrl" title="切换间隔">
                    {[2,3,5,10,15,30].map(s => (
                      <button key={s}
                        className={`r-btn compact ${slideshowInterval===s?'active':''}`}
                        onClick={() => setSlideshowInterval(s)}
                        style={{ fontSize: 9, fontFamily: 'var(--font-mono)', width: 26, height: 22 }}>
                        {s}s
                      </button>
                    ))}
                  </span>
                ) : (
                  <span className="r-speed-ctrl" title="切换速率">
                    {[{v:60,l:'慢'},{v:120,l:'中'},{v:240,l:'快'}].map(s => (
                      <button key={s.v}
                        className={`r-btn compact ${scrollSpeed===s.v?'active':''}`}
                        onClick={() => setScrollSpeed(s.v)}
                        style={{ fontSize: 9, fontFamily: 'var(--font-mono)', width: 26, height: 22 }}>
                        {s.l}
                      </button>
                    ))}
                  </span>
                )
              )}
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
                  className="r-pad-slider" title={`内边距 ${padding}%`} />
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
