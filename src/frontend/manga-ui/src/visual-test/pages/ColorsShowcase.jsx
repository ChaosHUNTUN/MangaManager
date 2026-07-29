import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Palette, Droplets, Sun, Moon } from 'lucide-react';

const COLOR_GROUPS = [
  {
    title: 'Canvas & 背景层',
    items: [
      { name: '--canvas', value: '#000000', cssVar: 'var(--canvas)' },
      { name: '--surface', value: '#0d0d14', cssVar: 'var(--surface)' },
      { name: '--surface-high', value: '#14141f', cssVar: 'var(--surface-high)' },
      { name: '--surface-card', value: '#12121c', cssVar: 'var(--surface-card)' },
      { name: '--surface-hover', value: '#181828', cssVar: 'var(--surface-hover)' },
    ]
  },
  {
    title: '毛玻璃',
    items: [
      { name: '--glass-bg', value: 'rgba(13,13,20,0.88)', cssVar: 'var(--glass-bg)' },
      { name: '--glass-bg-light', value: 'rgba(20,20,31,0.75)', cssVar: 'var(--glass-bg-light)' },
      { name: '--glass-border', value: 'rgba(255,255,255,0.05)', cssVar: 'var(--glass-border)' },
      { name: '--glass-border-hover', value: 'rgba(255,255,255,0.09)', cssVar: 'var(--glass-border-hover)' },
      { name: '--glass-highlight', value: 'rgba(255,255,255,0.03)', cssVar: 'var(--glass-highlight)' },
    ]
  },
  {
    title: '文本层级',
    items: [
      { name: '--text-primary', value: '#c8c4cc', cssVar: 'var(--text-primary)' },
      { name: '--text-secondary', value: '#8b8594', cssVar: 'var(--text-secondary)' },
      { name: '--text-muted', value: '#5a5461', cssVar: 'var(--text-muted)' },
      { name: '--text-dim', value: '#3a3540', cssVar: 'var(--text-dim)' },
    ]
  },
  {
    title: '主色调',
    items: [
      { name: '--accent', value: '#8b7aa0', cssVar: 'var(--accent)' },
      { name: '--accent-teal', value: '#5a8a8a', cssVar: 'var(--accent-teal)' },
      { name: '--accent-bg', value: 'rgba(139,122,160,0.10)', cssVar: 'var(--accent-bg)' },
      { name: '--accent-bg-hover', value: 'rgba(139,122,160,0.16)', cssVar: 'var(--accent-bg-hover)' },
      { name: '--accent-border', value: 'rgba(139,122,160,0.30)', cssVar: 'var(--accent-border)' },
    ]
  },
  {
    title: '语义色',
    items: [
      { name: '--error', value: '#b06060', cssVar: 'var(--error)' },
      { name: '--success', value: '#6b8b6b', cssVar: 'var(--success)' },
      { name: '--warning', value: '#a08050', cssVar: 'var(--warning)' },
    ]
  },
  {
    title: '边框系统',
    items: [
      { name: '--divider', value: 'rgba(255,255,255,0.05)', cssVar: 'var(--divider)' },
      { name: '--border-subtle', value: 'rgba(255,255,255,0.06)', cssVar: 'var(--border-subtle)' },
      { name: '--border-card', value: 'rgba(255,255,255,0.05)', cssVar: 'var(--border-card)' },
      { name: '--border-input', value: 'rgba(255,255,255,0.08)', cssVar: 'var(--border-input)' },
      { name: '--border-active', value: 'rgba(255,255,255,0.14)', cssVar: 'var(--border-active)' },
    ]
  },
];

const CATEGORY_COLORS = [
  { name: 'Manga', hex: '#b06060', desc: '漫画' },
  { name: 'Doujinshi', hex: '#a08050', desc: '同人志' },
  { name: 'Artbook', hex: '#6b8b6b', desc: '画集' },
  { name: 'Game CG', hex: '#5a8a8a', desc: '游戏CG' },
  { name: 'Western', hex: '#8b7aa0', desc: '欧美' },
  { name: 'Non-H', hex: '#7088a0', desc: '全年龄' },
  { name: 'Image Set', hex: '#a06880', desc: '图集' },
  { name: 'Cosplay', hex: '#a0a060', desc: 'Cosplay' },
  { name: 'Misc', hex: '#808080', desc: '其他' },
];

export default function ColorsShowcase() {
  const [showOnCanvas, setShowOnCanvas] = useState(false);

  return (
    <div className="vt-page">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
        <div className="vt-page-header">
          <h1>色彩系统</h1>
          <p>tokens.css 设计令牌色彩可视化 — 检查对比度 / 层级 / 语义关系</p>
        </div>

        {/* 在线预览 */}
        <div className="vt-section">
          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            <button className="btn-sm active" onClick={() => setShowOnCanvas(false)}>
              <Palette size={14} /> 在面板上预览
            </button>
            <button className="btn-sm" onClick={() => setShowOnCanvas(true)}>
              <Sun size={14} /> 在纯黑画布上预览
            </button>
          </div>

          <div style={{
            padding: showOnCanvas ? 0 : 'var(--space-6)',
            background: showOnCanvas ? '#000' : 'var(--surface)',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--divider)',
          }}>
            {COLOR_GROUPS.map((group, gi) => (
              <div key={gi} style={{ marginBottom: 'var(--space-5)' }}>
                <h3 style={{
                  fontSize: 'var(--text-sm)', fontWeight: 'var(--weight-semibold)',
                  color: 'var(--text-primary)', margin: '0 0 var(--space-3)',
                }}>
                  {group.title}
                </h3>
                <div className="vt-color-grid">
                  {group.items.map(item => (
                    <motion.div
                      key={item.name}
                      className="vt-swatch"
                      whileHover={{ scale: 1.02 }}
                    >
                      <div className="vt-swatch-preview" style={{
                        background: item.value,
                        borderBottom: '1px solid var(--divider)',
                      }} />
                      <div className="vt-swatch-info">
                        <div className="vt-swatch-name">{item.name}</div>
                        <div className="vt-swatch-value">{item.value}</div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 分类颜色 */}
        <div className="vt-section">
          <h2 className="vt-section-title">画廊分类颜色</h2>
          <p className="vt-section-desc">CATEGORY_COLORS_DETAIL — 详情页/弹窗中使用的分类主题色</p>

          <div className="vt-color-grid">
            {CATEGORY_COLORS.map(cat => (
              <motion.div
                key={cat.name}
                className="vt-swatch"
                whileHover={{ scale: 1.02 }}
              >
                <div className="vt-swatch-preview" style={{
                  background: cat.hex,
                }} />
                <div className="vt-swatch-info">
                  <div className="vt-swatch-name">{cat.name}</div>
                  <div style={{
                    fontSize: 'var(--text-2xs)', color: 'var(--text-secondary)', marginTop: 2
                  }}>
                    {cat.desc} · {cat.hex}
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>

        {/* Token 关系图 */}
        <div className="vt-section">
          <h2 className="vt-section-title">Token 层级关系</h2>
          <div className="vt-demo-grid-2">
            <div className="vt-demo-card">
              <h3>Surface 层级递进</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {['--canvas', '--surface', '--surface-card', '--surface-high', '--surface-hover'].map((name, i) => (
                  <div key={name} style={{
                    padding: '12px 16px',
                    background: `var(${name})`,
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--divider)',
                    display: 'flex', justifyContent: 'space-between',
                    alignItems: 'center',
                  }}>
                    <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>{name}</span>
                    <span style={{
                      fontSize: 'var(--text-2xs)', color: 'var(--text-primary)',
                      background: 'var(--accent-bg)', padding: '2px 8px', borderRadius: 'var(--radius-full)',
                    }}>
                      Lv.{i}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="vt-demo-card">
              <h3>Text 层级 (WCAG 对比度)</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {[
                  { text: '文本层级 — Primary', style: { fontSize: 16, color: 'var(--text-primary)' }, ratio: '12.8:1 AAA' },
                  { text: '文本层级 — Secondary', style: { fontSize: 14, color: 'var(--text-secondary)' }, ratio: '6.2:1 AA' },
                  { text: '文本层级 — Muted', style: { fontSize: 13, color: 'var(--text-muted)' }, ratio: '3.8:1' },
                  { text: '文本层级 — Dim', style: { fontSize: 12, color: 'var(--text-dim)' }, ratio: '2.1:1' },
                ].map(item => (
                  <div key={item.ratio} style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '8px 0', borderBottom: '1px solid var(--divider)'
                  }}>
                    <span style={item.style}>{item.text}</span>
                    <span className="badge badge-muted">{item.ratio}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
