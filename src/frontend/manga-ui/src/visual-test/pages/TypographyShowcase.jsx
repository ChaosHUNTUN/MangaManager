import React from 'react';
import { motion } from 'framer-motion';
import { Type, AlignJustify } from 'lucide-react';

const TYPOGRAPHY_ITEMS = [
  { var: '--text-3xs', size: '12px', name: '3xs', sample: '超小字号 — 脚注/辅助信息' },
  { var: '--text-2xs', size: '13px', name: '2xs', sample: '极小字号 — 标签/时间戳' },
  { var: '--text-xs', size: '14px', name: 'xs', sample: '小号 — 卡片标题/按钮/正文辅助' },
  { var: '--text-sm', size: '15px', name: 'sm', sample: '中小号 — 卡片标题/导航/按钮' },
  { var: '--text-base', size: '16px', name: 'base', sample: '基准 — 正文段落默认尺寸' },
  { var: '--text-md', size: '18px', name: 'md', sample: '中号 — 区块标题/模态框标题' },
  { var: '--text-lg', size: '20px', name: 'lg', sample: '大号 — 弹窗标题/强调区域' },
  { var: '--text-xl', size: '23px', name: 'xl', sample: '特大 — 页面标题' },
  { var: '--text-2xl', size: '30px', name: '2xl', sample: '超大 — Hero 标题' },
];

const WEIGHTS = [
  { value: 400, name: 'Regular (400)' },
  { value: 500, name: 'Medium (500)' },
  { value: 600, name: 'Semibold (600)' },
  { value: 700, name: 'Bold (700)' },
];

const FONT_FAMILIES = [
  { name: 'Inter (Sans)', family: 'var(--font-sans)', sample: 'ABCDEFGHIJ あいうえお 汉字' },
  { name: 'JetBrains Mono', family: 'var(--font-mono)', sample: 'ABCDEFGHIJ 0123456789' },
];

export default function TypographyShowcase() {
  return (
    <div className="vt-page">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
        <div className="vt-page-header">
          <h1>字体排版</h1>
          <p>tokens.css 字号阶梯 / 字重 / 行高 / 字体家族 — 9 级字号系统可视化</p>
        </div>

        {/* 字号阶梯 */}
        <div className="vt-section">
          <h2 className="vt-section-title">字号阶梯 (9 级)</h2>
          <p className="vt-section-desc">从 12px (3xs) 到 30px (2xl) 的完整字号层级</p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            {TYPOGRAPHY_ITEMS.map(item => (
              <div key={item.var} className="vt-type-sample">
                <div style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end',
                  marginBottom: 'var(--space-2)'
                }}>
                  <div className="label">
                    {item.var} · {item.size} · {item.name}
                  </div>
                  <div style={{
                    fontSize: '10px', color: 'var(--text-muted)',
                    fontFamily: 'var(--font-mono)',
                  }}>
                    {item.size}
                  </div>
                </div>
                <div style={{ fontSize: `var(${item.var})`, color: 'var(--text-primary)' }}>
                  {item.sample}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 字重对比 */}
        <div className="vt-section">
          <h2 className="vt-section-title">字重对比</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            {WEIGHTS.map(w => (
              <div key={w.value} className="vt-type-sample">
                <div className="label">font-weight: {w.value} — {w.name}</div>
                <div style={{
                  fontSize: 'var(--text-lg)', fontWeight: w.value,
                  color: 'var(--text-primary)',
                }}>
                  MangaManager 漫画管理器
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 字体家族 */}
        <div className="vt-section">
          <h2 className="vt-section-title">字体家族</h2>
          <div className="vt-demo-grid-2">
            {FONT_FAMILIES.map(font => (
              <div key={font.name} className="vt-demo-card">
                <h3>{font.name}</h3>
                <div style={{
                  fontFamily: font.family, fontSize: 'var(--text-md)',
                  color: 'var(--text-primary)', wordBreak: 'break-all',
                  lineHeight: 1.6,
                }}>
                  {font.sample}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 行高对比 */}
        <div className="vt-section">
          <h2 className="vt-section-title">行高对比</h2>
          <div className="vt-demo-grid-2">
            {[
              { var: '--leading-xs', value: '1.4', label: '紧凑 — 标题适用' },
              { var: '--leading-sm', value: '1.45', label: '较紧 — 卡片标题' },
              { var: '--leading-base', value: '1.55', label: '基准 — 正文段落' },
            ].map(lh => (
              <div key={lh.var} className="vt-demo-card">
                <div className="label" style={{ marginBottom: 8 }}>
                  {lh.var} = {lh.value} — {lh.label}
                </div>
                <div style={{
                  fontSize: 'var(--text-sm)', lineHeight: `var(${lh.var})`,
                  color: 'var(--text-secondary)',
                }}>
                  吾輩は猫である。名前はまだ無い。どこで生れたかとんと見当がつかぬ。何でも薄暗いじめじめした所でニャーニャー泣いていた事だけは記憶している。吾輩はここで始めて人間というものを見た。
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 实际应用 */}
        <div className="vt-section">
          <h2 className="vt-section-title">实际排版示例</h2>
          <div className="vt-demo-card" style={{ padding: 'var(--space-6)' }}>
            {/* 页面标题 */}
            <div style={{
              fontSize: 'var(--text-xl)', fontWeight: 'var(--weight-bold)',
              color: 'var(--text-primary)', marginBottom: 4,
            }}>
              画廊详情
            </div>
            <div style={{
              fontSize: 'var(--text-xs)', color: 'var(--text-muted)',
              marginBottom: 24,
            }}>
              共 290 部作品 · 最后更新: 2026-07-28
            </div>

            {/* 信息区 */}
            <div style={{
              display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12,
              marginBottom: 24,
            }}>
              {['作品名', '上传者', '页数', '文件大小', '评分', '语言'].map(label => (
                <div key={label} style={{
                  background: 'var(--surface)', padding: '12px 16px',
                  borderRadius: 'var(--radius-sm)',
                }}>
                  <div style={{
                    fontSize: '10px', color: 'var(--text-muted)',
                    textTransform: 'uppercase', letterSpacing: 0.5,
                  }}>
                    {label}
                  </div>
                  <div style={{
                    fontSize: 'var(--text-sm)', fontWeight: 'var(--weight-semibold)',
                    color: 'var(--text-primary)', marginTop: 4,
                  }}>
                    {label === '作品名' ? '進撃の巨人' : label === '上传者' ? 'tony' : label === '页数' ? '224p' : label === '文件大小' ? '156MB' : label === '评分' ? '★ 4.8' : '日文'}
                  </div>
                </div>
              ))}
            </div>

            {/* 标签区 */}
            <div style={{
              background: 'var(--surface)', padding: 16, borderRadius: 'var(--radius-sm)',
            }}>
              <div style={{
                fontSize: '10px', color: 'var(--text-muted)',
                textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8,
              }}>
                标签
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {['artist:tony', 'language:japanese', 'female:eren yeager'].map(tag => (
                  <span key={tag} className="badge badge-accent">{tag}</span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
