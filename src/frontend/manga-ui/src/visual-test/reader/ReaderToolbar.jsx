import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, ArrowLeftRight, ArrowRight, ArrowUp, ArrowDown, ArrowUpDown,
  BookOpen, GripHorizontal, Sun, ZoomIn, ZoomOut, Play, Pause, HelpCircle,
} from 'lucide-react';
import ThumbnailStrip from './ThumbnailStrip';

const Btn = React.memo(({ active, onClick, title, icon, compact, disabled }) => (
  <motion.button whileTap={disabled ? undefined : { scale: 0.9 }} onClick={onClick} title={title}
    disabled={disabled}
    className={`r-btn ${active ? 'active' : ''} ${compact ? 'compact' : ''} ${disabled ? 'disabled' : ''}`}>
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
  readingOrder,
  slideshowActive, slideshowInterval,
  // 操作
  setUiVisible, setShowThumbs,
  setDirection, setFlow, setReadingOrder,
  setBgCycled, setPadding, setFitCycled,
  zoomIn, zoomOut,
  toggleSlideshow, setSlideshowInterval, scrollSpeed, setScrollSpeed,
  onPrevGallery, onNextGallery, canPrevGallery, canNextGallery,
  // 图片
  images, pageStep, setCurrentPage,
  onBack,
  showHelp, onToggleHelp,
}) {
  const fitLabel = fit === 'both' ? '⊡' : fit === 'width' ? '⊡W' : fit === 'height' ? '⊡H' : '1:1';
  const bgName = ['暗色', '纯黑', '纸色'][background];
  const isPaginated = flow === 'paginated';
  const isVertical = direction === 'vertical';

  return (
    <>
      {/* Top HUD */}
      <AnimatePresence>
        {uiVisible && (
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }} className="r-hud">
            <button className="r-hud-back" onClick={onBack || (() => window.history.back())}>
              <ArrowLeft size={16} />返回
            </button>
            <div>
              <div className="r-hud-title">{title}</div>
              <div className="r-hud-sub">{currentPage + 1}/{totalPages}</div>
            </div>
            <div style={{ display: 'flex', gap: 4 }}>
              <Btn active={direction === 'horizontal'} onClick={() => setDirection(d => d === 'horizontal' ? 'vertical' : 'horizontal')}
                title={`滚动方向: ${direction === 'horizontal' ? '横向' : '纵向'}`}
                icon={direction === 'horizontal' ? <ArrowLeftRight size={15} /> : <ArrowUpDown size={15} />} />
              <Btn active={showThumbs} onClick={() => { setShowThumbs(v => !v); if (!uiVisible) setUiVisible(true); }}
                title="缩略图" icon={<GripHorizontal size={15} />} />
              {onToggleHelp && (
                <Btn active={showHelp} onClick={onToggleHelp} title="快捷键 (?)"
                  icon={<HelpCircle size={15} />} />
              )}
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
            {/* 进度条（翻页/滚动模式均显示；滚动模式点击滑块跳页） */}
            <div className="r-progress-row" onPointerDown={e => e.stopPropagation()}>
              <input type="range" min={0} max={Math.max(0, totalPages - 1)} step={1}
                value={Math.min(currentPage, Math.max(0, totalPages - 1))}
                onChange={e => setCurrentPage(Number(e.target.value))}
                className="r-progress-slider" title="拖拽快速跳页" />
              <span className="r-progress-label">{currentPage + 1} / {totalPages}</span>
            </div>
            {/* 工具行 */}
            <div className="r-bar-row" onPointerDown={e => e.stopPropagation()}>
              {/* 作品导航（交叉轴图标随方向） */}
              <BtnGroup>
                <Btn compact disabled={!canPrevGallery} onClick={onPrevGallery}
                  title="上一部" icon={isVertical ? <ArrowLeft size={14} /> : <ArrowUp size={14} />} />
                <Btn compact disabled={!canNextGallery} onClick={onNextGallery}
                  title="下一部" icon={isVertical ? <ArrowRight size={14} /> : <ArrowDown size={14} />} />
              </BtnGroup>
              <Sep />
              <BtnGroup>
                <Btn compact active={direction === 'horizontal'} onClick={() => setDirection('horizontal')}
                  title="横向" icon={<ArrowLeftRight size={14} />} />
                <Btn compact active={direction === 'vertical'} onClick={() => setDirection('vertical')}
                  title="纵向" icon={<ArrowUpDown size={14} />} />
                {direction === 'horizontal' && (
                  <motion.button whileTap={{ scale: 0.9 }}
                    className={`r-btn compact ${readingOrder === 'rtl' ? 'active' : ''}`}
                    onClick={() => setReadingOrder(o => o === 'rtl' ? 'ltr' : 'rtl')}
                    title={readingOrder === 'rtl' ? '阅读顺序：右→左（漫画）' : '阅读顺序：左→右'}>
                    <span style={{ fontSize: 'var(--text-2xs)', fontWeight: 600 }}>{readingOrder === 'rtl' ? '右→左' : '左→右'}</span>
                  </motion.button>
                )}
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
                  <span className="r-speed-ctrl" title="翻页间隔">
                    <input type="range" min={1} max={60} step={1} value={slideshowInterval}
                      onChange={e => setSlideshowInterval(Number(e.target.value))}
                      className="r-speed-slider" />
                    <span className="r-speed-label">{slideshowInterval}s</span>
                  </span>
                ) : (
                  <span className="r-speed-ctrl" title="滚动速度">
                    <input type="range" min={20} max={1600} step={10} value={scrollSpeed}
                      onChange={e => setScrollSpeed(Number(e.target.value))}
                      className="r-speed-slider" />
                    <span className="r-speed-label">{scrollSpeed}px/s</span>
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
