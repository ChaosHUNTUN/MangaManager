import { motion, AnimatePresence } from 'framer-motion'
import {
  X, ArrowUpDown, ArrowLeftRight, BookOpen, Rows3,
  ZoomIn, ZoomOut, RotateCcw, Play, Pause, Sun,
} from 'lucide-react'

/** 设置分组行 */
function Row({ label, hint, children }) {
  return (
    <div style={{ marginBottom: 'var(--space-4)' }}>
      <div style={{
        fontSize: 'var(--text-2xs)', color: 'var(--text-muted)', marginBottom: 8,
        display: 'flex', alignItems: 'center', gap: 6,
      }}>
        <span>{label}</span>
        {hint && <span style={{ color: 'var(--text-dim)', fontSize: 'var(--text-3xs)' }}>{hint}</span>}
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>{children}</div>
    </div>
  )
}

/** 选项按钮 */
function Choice({ active, onClick, children, title }) {
  return (
    <button className="btn-sm" onClick={onClick} title={title}
      style={{
        borderColor: active ? 'var(--accent-border)' : 'var(--border-input)',
        color: active ? 'var(--accent)' : 'var(--text-secondary)',
        background: active ? 'var(--accent-bg)' : 'transparent',
        display: 'inline-flex', alignItems: 'center', gap: 5, minHeight: 34,
      }}>
      {children}
    </button>
  )
}

/**
 * 阅读器设置弹窗 —— 集中所有阅读设置，减少工具栏拥挤。
 * 桌面居中；移动端由 mobile.css 的 .modal 规则自动变为底部抽屉。
 */
export default function ReaderSettingsModal({
  open, onClose,
  direction, setDirection,
  flow, setFlow,
  readingOrder, setReadingOrder,
  fit, zoom, setFit, setZoom, zoomIn, zoomOut,
  background, setBackground,
  padding, setPadding,
  slideshowActive, toggleSlideshow,
  slideshowInterval, setSlideshowInterval,
  scrollSpeed, setScrollSpeed,
}) {
  const isPaginated = flow === 'paginated'
  const isHorizontal = direction === 'horizontal'
  const bgName = ['暗色', '纯黑', '纸色'][background] || '暗色'

  const pickFit = (v) => { setFit(v); setZoom(1) }

  return (
    <AnimatePresence>
      {open && (
        <motion.div className="modal-overlay"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          onClick={e => { if (e.target === e.currentTarget) onClose() }}>
          <motion.div className="modal" onClick={e => e.stopPropagation()}
            initial={{ y: 24, opacity: 0.6 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 24, opacity: 0 }}
            style={{ width: 'min(460px, 94vw)', maxHeight: '85dvh', overflowY: 'auto' }}>

            {/* 标题 */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-4)' }}>
              <span style={{ fontWeight: 600, fontSize: 'var(--text-md)' }}>阅读设置</span>
              <button className="btn-sm" onClick={onClose} style={{ padding: '2px 8px' }}><X size={15} /></button>
            </div>

            {/* 阅读方向 */}
            <Row label="阅读方向">
              <Choice active={direction === 'vertical'} onClick={() => setDirection('vertical')}>
                <ArrowUpDown size={14} /> 纵向
              </Choice>
              <Choice active={isHorizontal} onClick={() => setDirection('horizontal')}>
                <ArrowLeftRight size={14} /> 横向
              </Choice>
            </Row>

            {/* 阅读顺序（仅横向） */}
            {isHorizontal && (
              <Row label="阅读顺序" hint="漫画通常为右→左">
                <Choice active={readingOrder === 'ltr'} onClick={() => setReadingOrder('ltr')}>左→右</Choice>
                <Choice active={readingOrder === 'rtl'} onClick={() => setReadingOrder('rtl')}>右→左</Choice>
              </Row>
            )}

            {/* 页面模式 */}
            <Row label="翻页方式">
              <Choice active={isPaginated} onClick={() => setFlow('paginated')}>
                <BookOpen size={14} /> 翻页
              </Choice>
              <Choice active={!isPaginated} onClick={() => setFlow('continuous')}>
                <Rows3 size={14} /> 滚动
              </Choice>
            </Row>

            {/* 适配与缩放 */}
            <Row label="缩放适配">
              <Choice active={fit === 'both'} onClick={() => pickFit('both')} title="整页适应（完整显示一页）">⊡ 整页</Choice>
              <Choice active={fit === 'width'} onClick={() => pickFit('width')} title="适应宽度">⊡W 适宽</Choice>
              <Choice active={fit === 'height'} onClick={() => pickFit('height')} title="适应高度">⊡H 适高</Choice>
              <Choice active={fit === 'original'} onClick={() => pickFit('original')} title="原始尺寸">1:1</Choice>
            </Row>
            <Row label={`缩放 ${Math.round(zoom * 100)}%`}>
              <Choice onClick={zoomOut} title="缩小"><ZoomOut size={14} /></Choice>
              <Choice onClick={zoomIn} title="放大"><ZoomIn size={14} /></Choice>
              <button className="btn-sm" onClick={() => { setZoom(1); setFit('both') }}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 5, minHeight: 34 }}>
                <RotateCcw size={13} /> 重置
              </button>
            </Row>

            {/* 背景 */}
            <Row label="背景色">
              {[0, 1, 2].map(i => (
                <Choice key={i} active={background === i} onClick={() => setBackground(i)}>
                  <Sun size={13} /> {['暗色', '纯黑', '纸色'][i]}
                </Choice>
              ))}
            </Row>

            {/* 页面间距 */}
            <Row label={`页面间距 ${padding}%`}>
              <input type="range" min={0} max={30} step={5} value={padding}
                onChange={e => setPadding(Number(e.target.value))}
                style={{ flex: 1, minWidth: 160 }} />
            </Row>

            {/* 自动阅读 */}
            <Row label="自动阅读">
              <Choice active={slideshowActive} onClick={toggleSlideshow}>
                {slideshowActive ? <><Pause size={14} /> 暂停</> : <><Play size={14} /> 开始</>}
              </Choice>
              {isPaginated ? (
                <span style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 180 }}>
                  <input type="range" min={1} max={60} step={1} value={slideshowInterval}
                    onChange={e => setSlideshowInterval(Number(e.target.value))}
                    style={{ flex: 1 }} />
                  <span style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-muted)', minWidth: 34 }}>{slideshowInterval}s</span>
                </span>
              ) : (
                <span style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 180 }}>
                  <input type="range" min={20} max={1600} step={10} value={scrollSpeed}
                    onChange={e => setScrollSpeed(Number(e.target.value))}
                    style={{ flex: 1 }} />
                  <span style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-muted)', minWidth: 62 }}>{scrollSpeed}px/s</span>
                </span>
              )}
            </Row>

            <div style={{ fontSize: 'var(--text-3xs)', color: 'var(--text-dim)', borderTop: '1px solid var(--divider)', paddingTop: 10, lineHeight: 1.7 }}>
              手机端：沿主方向滑动翻页/滚动，点按画面显示或隐藏工具栏；
              {isPaginated ? '放大后滑动先用于平移，到边缘才翻页。' : '滚动模式下上下滑动浏览。'}
              <br />
              键盘：自动阅读按 <b>[</b> 减慢、<b>]</b> 加快；纵向模式下左右方向键切换作品。当前背景：{bgName}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
