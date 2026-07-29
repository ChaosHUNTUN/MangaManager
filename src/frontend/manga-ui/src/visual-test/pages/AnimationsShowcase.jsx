import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Zap, RefreshCw, ChevronDown, X } from 'lucide-react';

export default function AnimationsShowcase() {
  const [key, setKey] = useState(0);
  const [openItems, setOpenItems] = useState(new Set([0, 1, 2, 3, 4]));
  const [toggled, setToggled] = useState({});

  const replay = () => setKey(k => k + 1);

  return (
    <div className="vt-page">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
        <div className="vt-page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h1>动效演示</h1>
            <p>framer-motion 声明式动画 — 入场 / 悬浮 / 点击 / 布局 / 手势 / 列表编排</p>
          </div>
          <motion.button
            className="btn-primary"
            onClick={replay}
            whileTap={{ scale: 0.9 }}
          >
            <RefreshCw size={14} /> 重播全部
          </motion.button>
        </div>

        <AnimatePresence mode="wait">
          <motion.div key={key}>

            {/* 1. 入场动画 */}
            <div className="vt-section">
              <h2 className="vt-section-title">1. 入场动画 — Stagger 交错</h2>
              <p className="vt-section-desc">子元素依次入场，每项延迟 80ms</p>
              <div className="vt-demo-card">
                <div className="vt-anim-stage" style={{ justifyContent: 'flex-start', gap: 12 }}>
                  {[0, 1, 2, 3, 4, 5].map(i => (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, y: 20, scale: 0.8 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      transition={{ delay: i * 0.08, duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                      style={{
                        width: 48, height: 64, background: 'var(--accent-bg)',
                        borderRadius: 'var(--radius-sm)', border: '1px solid var(--accent-border)',
                      }}
                    />
                  ))}
                </div>
              </div>
            </div>

            {/* 2. 悬浮动画 */}
            <div className="vt-section">
              <h2 className="vt-section-title">2. 悬浮动画 — Hover / Tap 反馈</h2>
              <p className="vt-section-desc">hover: scale + shadow / tap: scale 0.95 / whileHover + whileTap</p>
              <div className="vt-demo-card">
                <div className="vt-anim-stage">
                  {[
                    { label: '悬浮放大', hover: { scale: 1.06 }, tap: { scale: 0.95 }, bg: 'var(--accent-bg)', border: 'var(--accent-border)', color: 'var(--accent)' },
                    { label: '悬浮上移', hover: { y: -4 }, tap: { y: 0 }, bg: 'var(--accent-teal-bg)', border: 'rgba(90,138,138,0.3)', color: 'var(--accent-teal)' },
                    { label: '悬浮旋转', hover: { rotate: 5, scale: 1.05 }, tap: { rotate: 0, scale: 0.95 }, bg: 'rgba(176,96,96,0.1)', border: 'rgba(176,96,96,0.3)', color: 'var(--error)' },
                  ].map((item, i) => (
                    <motion.div
                      key={i}
                      whileHover={item.hover}
                      whileTap={item.tap}
                      style={{
                        width: 100, height: 100, display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: item.bg, border: `2px solid ${item.border}`,
                        borderRadius: 'var(--radius-lg)', color: item.color,
                        fontSize: 'var(--text-xs)', fontWeight: 'var(--weight-semibold)',
                        cursor: 'pointer',
                      }}
                    >
                      {item.label}
                    </motion.div>
                  ))}
                </div>
              </div>
            </div>

            {/* 3. Layout 动画 */}
            <div className="vt-section">
              <h2 className="vt-section-title">3. Layout 动画 — 自动测量 + 过渡</h2>
              <p className="vt-section-desc">motion.div + layout prop, 元素大小/位置变化自动平滑过渡</p>
              <div className="vt-demo-card">
                <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                  {['Manga', 'Doujinshi', 'Artbook', 'Game CG', 'Western', 'Non-H'].map(tag => (
                    <motion.button
                      key={tag}
                      layout
                      onClick={() => setToggled(prev => ({ ...prev, [tag]: !prev[tag] }))}
                      className={`btn-sm ${toggled[tag] ? 'active' : ''}`}
                      style={toggled[tag] ? {
                        padding: 'var(--space-1) var(--space-4)',
                        fontSize: 'var(--text-sm)',
                        fontWeight: 'var(--weight-bold)',
                      } : {}}
                    >
                      {tag}
                    </motion.button>
                  ))}
                </div>
              </div>
            </div>

            {/* 4. 展开/折叠 */}
            <div className="vt-section">
              <h2 className="vt-section-title">4. Accordion 展开折叠</h2>
              <p className="vt-section-desc">AnimatePresence + 高度动画，平滑展开/收起内容区域</p>
              <div className="vt-demo-card">
                {['画师作品 (45部)', '社团作品 (23部)', '未分类 (12部)'].map((title, i) => {
                  const isOpen = openItems.has(i);
                  return (
                    <div key={i} style={{ marginBottom: 4 }}>
                      <motion.button
                        onClick={() => {
                          const next = new Set(openItems);
                          isOpen ? next.delete(i) : next.add(i);
                          setOpenItems(next);
                        }}
                        style={{
                          width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                          padding: 'var(--space-2) var(--space-3)', background: 'var(--surface)',
                          border: '1px solid var(--divider)', borderRadius: 'var(--radius-sm)',
                          color: 'var(--text-primary)', cursor: 'pointer', fontSize: 'var(--text-xs)',
                        }}
                      >
                        <span>{title}</span>
                        <motion.span
                          animate={{ rotate: isOpen ? 180 : 0 }}
                          transition={{ duration: 0.2 }}
                        >
                          <ChevronDown size={14} />
                        </motion.span>
                      </motion.button>
                      <AnimatePresence initial={false}>
                        {isOpen && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                            style={{ overflow: 'hidden' }}
                          >
                            <div style={{
                              padding: 'var(--space-3)', background: 'var(--surface-high)',
                              border: '1px solid var(--divider)', borderTop: 'none',
                              borderRadius: '0 0 var(--radius-sm) var(--radius-sm)',
                            }}>
                              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>
                                包含 xxxx 等作品 · 最近更新: 2026-07-28
                              </div>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 5. Modal 弹入弹出 */}
            <div className="vt-section">
              <h2 className="vt-section-title">5. Modal 弹入弹出</h2>
              <p className="vt-section-desc">overlay: fade + panel: scale(0.95→1) + y(20→0)</p>
              <div className="vt-demo-card">
                <div className="vt-anim-stage">
                  <motion.button
                    className="btn-primary"
                    onClick={() => setToggled(prev => ({ ...prev, modal: !prev.modal }))}
                    whileTap={{ scale: 0.9 }}
                  >
                    打开弹窗
                  </motion.button>
                </div>
              </div>
            </div>

            {toggled.modal && (
              <motion.div
                className="modal-overlay"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setToggled(prev => ({ ...prev, modal: false }))}
              >
                <motion.div
                  className="modal"
                  initial={{ opacity: 0, scale: 0.95, y: 10 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: 10 }}
                  transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                  onClick={e => e.stopPropagation()}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h3 style={{ margin: 0 }}>弹窗标题</h3>
                    <motion.button
                      onClick={() => setToggled(prev => ({ ...prev, modal: false }))}
                      style={{
                        background: 'none', border: 'none', color: 'var(--text-secondary)',
                        cursor: 'pointer', padding: 4,
                      }}
                      whileTap={{ scale: 0.8 }}
                    >
                      <X size={18} />
                    </motion.button>
                  </div>
                  <div style={{ marginTop: 16, color: 'var(--text-secondary)', fontSize: 'var(--text-xs)' }}>
                    弹窗内容区域 — AnimatePresence + exit 动画自动处理卸载过渡
                  </div>
                </motion.div>
              </motion.div>
            )}

            {/* 6. 列表动画 */}
            <div className="vt-section">
              <h2 className="vt-section-title">6. 列表编排 — 添加/删除项</h2>
              <p className="vt-section-desc">AnimatePresence 处理列表项增删动画</p>
              <div className="vt-demo-card">
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
                  {['日文', '中文', '已翻译', '全彩', '大容量'].map(tag => (
                    <motion.span
                      key={tag}
                      className="badge badge-accent"
                      layout
                      initial={{ opacity: 0, scale: 0 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0 }}
                      whileHover={{ scale: 1.1 }}
                      style={{ cursor: 'pointer' }}
                      onClick={() => setToggled(prev => ({ ...prev, [tag]: !prev[tag] }))}
                    >
                      {tag} <X size={10} />
                    </motion.span>
                  ))}
                </div>
              </div>
            </div>

            {/* 7. 数字滚动 */}
            <div className="vt-section">
              <h2 className="vt-section-title">7. 数字递增动画</h2>
              <p className="vt-section-desc">spring 物理弹簧模拟数字跳动</p>
              <div className="vt-demo-card">
                <div className="vt-anim-stage" style={{ gap: 40 }}>
                  {[
                    { label: '总作品', value: 290, color: 'var(--accent)' },
                    { label: '本月下载', value: 85, color: 'var(--accent-teal)' },
                    { label: '磁盘占用', value: 47, suffix: 'GB', color: 'var(--warning)' },
                  ].map(stat => (
                    <motion.div key={stat.label} style={{ textAlign: 'center' }} layout>
                      <motion.div
                        style={{ fontSize: 32, fontWeight: 700, color: stat.color }}
                        initial={{ scale: 0.5, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{ type: 'spring', stiffness: 200, damping: 15, delay: 0.1 }}
                      >
                        {stat.value}{stat.suffix || ''}
                      </motion.div>
                      <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: 4 }}>
                        {stat.label}
                      </div>
                    </motion.div>
                  ))}
                </div>
              </div>
            </div>

          </motion.div>
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
