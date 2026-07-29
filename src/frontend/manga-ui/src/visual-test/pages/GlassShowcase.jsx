import React from 'react';
import { motion } from 'framer-motion';
import { Droplets, Layers } from 'lucide-react';

const GLASS_COLORS = [
  { label: 'accent-op5', color: 'rgba(139,122,160,0.5)' },
  { label: 'teal-op5', color: 'rgba(90,138,138,0.5)' },
  { label: 'purple-op4', color: 'rgba(120, 80, 160, 0.4)' },
  { label: 'blue-op4', color: 'rgba(60, 100, 180, 0.4)' },
];

export default function GlassShowcase() {
  return (
    <div className="vt-page">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
        <div className="vt-page-header">
          <h1>毛玻璃特效</h1>
          <p>backdrop-filter 毛玻璃效果 — 模态框 / 弹窗 / 通知 / 侧边面板 的基础视觉层</p>
        </div>

        {/* 基础毛玻璃面板 */}
        <div className="vt-section">
          <h2 className="vt-section-title">基础玻璃面板</h2>
          <p className="vt-section-desc">不同 blur 值和透明度的组合效果 — 背景色通过下方渐变带透出</p>

          {[
            { blur: 'blur(10px)', opacity: 0.7 },
            { blur: 'blur(20px)', opacity: 0.88 },
            { blur: 'blur(30px)', opacity: 0.95 },
            { blur: 'blur(40px)', opacity: 0.98 },
          ].map((config, i) => (
            <div key={i} style={{ marginBottom: 'var(--space-4)' }}>
              <h4 style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginBottom: 'var(--space-2)' }}>
                {config.blur} · opacity: {config.opacity}
              </h4>
              <div className="vt-glass-demo">
                <div className="vt-glass-bg" />
                <div className="vt-glass-bg-dots" />
                <div className="vt-glass-panel-demo" style={{
                  backdropFilter: `${config.blur} saturate(1.2)`,
                  WebkitBackdropFilter: `${config.blur} saturate(1.2)`,
                  background: `color-mix(in srgb, var(--glass-bg) ${Math.round(config.opacity * 100)}%, transparent)`,
                  width: '80%',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <Droplets size={28} style={{ color: 'var(--accent)' }} />
                    <div>
                      <div style={{ fontSize: 'var(--text-sm)', fontWeight: 'var(--weight-semibold)' }}>
                        玻璃面板示例
                      </div>
                      <div style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-muted)', marginTop: 2 }}>
                        {config.blur} 模糊 · 保留背景透过感
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* 玻璃层叠 */}
        <div className="vt-section">
          <h2 className="vt-section-title">多层玻璃堆叠</h2>
          <p className="vt-section-desc">模拟弹窗→模态框→背景 的多层 glass morphism 叠加效果</p>

          <div className="vt-glass-demo" style={{ minHeight: 300 }}>
            <div className="vt-glass-bg" />
            <div className="vt-glass-bg-dots" />

            {/* 背景层 */}
            <div style={{
              position: 'relative', background: 'var(--glass-bg-light)',
              backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
              border: '1px solid var(--glass-border)',
              borderRadius: 'var(--radius-lg)', padding: 24, width: '90%',
            }}>
              <div style={{ color: 'var(--text-muted)', fontSize: 'var(--text-xs)' }}>应用背景层</div>

              {/* 中间层 */}
              <div style={{
                marginTop: 16, background: 'var(--glass-bg)',
                backdropFilter: 'blur(16px) saturate(1.1)',
                WebkitBackdropFilter: 'blur(16px) saturate(1.1)',
                border: '1px solid var(--glass-border)',
                boxShadow: 'inset 0 1px 0 var(--glass-highlight)',
                borderRadius: 'var(--radius-md)', padding: 20,
              }}>
                <div style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-xs)' }}>模态框背景层</div>

                {/* 最前层 */}
                <div style={{
                  marginTop: 12, background: 'color-mix(in srgb, var(--glass-bg) 95%, transparent)',
                  backdropFilter: 'blur(24px) saturate(1.2)',
                  WebkitBackdropFilter: 'blur(24px) saturate(1.2)',
                  border: '1px solid var(--accent-border)',
                  boxShadow: 'inset 0 1px 0 var(--glass-highlight)',
                  borderRadius: 'var(--radius-md)', padding: 20,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Layers size={18} style={{ color: 'var(--accent)' }} />
                    <span style={{ fontSize: 'var(--text-sm)', fontWeight: 'var(--weight-semibold)' }}>
                      前端弹窗面板
                    </span>
                  </div>
                  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', marginTop: 8 }}>
                    blur(24px) · saturate(1.2) · glass-highlight 顶部分割线
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 应用场景 */}
        <div className="vt-section">
          <h2 className="vt-section-title">现有应用场景</h2>
          <div className="vt-demo-grid-2">
            <div className="vt-demo-card">
              <h3>阅读器顶栏</h3>
              <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-xs)' }}>
                `glass-bg: rgba(13,13,20,0.88)` + `blur(20px)` + `saturate(1.2)`
              </p>
              <div style={{
                height: 44, display: 'flex', alignItems: 'center', padding: '0 12px',
                background: 'var(--glass-bg)',
                backdropFilter: 'blur(20px) saturate(1.2)',
                WebkitBackdropFilter: 'blur(20px) saturate(1.2)',
                border: '1px solid var(--glass-border)',
                borderRadius: 'var(--radius-sm)',
                justifyContent: 'space-between',
                marginTop: 8,
              }}>
                <span style={{ fontSize: 'var(--text-xs)', color: 'var(--accent)' }}>← 返回</span>
                <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-primary)' }}>漫画标题</span>
                <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>12/224</span>
              </div>
            </div>
            <div className="vt-demo-card">
              <h3>批量操作栏</h3>
              <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-xs)' }}>
                `glass-bg` + `blur(20px)` + `glass-highlight` inset
              </p>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 12, padding: 12, marginTop: 8,
                background: 'var(--glass-bg)',
                backdropFilter: 'blur(20px) saturate(1.2)',
                WebkitBackdropFilter: 'blur(20px) saturate(1.2)',
                border: '1px solid var(--glass-border)',
                boxShadow: 'inset 0 1px 0 var(--glass-highlight)',
                borderRadius: 'var(--radius-md)',
              }}>
                <span style={{ fontSize: 'var(--text-xs)', color: 'var(--accent)', fontWeight: 600 }}>
                  已选 5 部
                </span>
                <button className="btn-sm active">下载</button>
                <button className="btn-sm">添加到专辑</button>
                <button className="btn-danger">删除</button>
              </div>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
