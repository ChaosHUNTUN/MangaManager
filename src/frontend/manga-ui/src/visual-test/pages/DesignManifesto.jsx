import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence, useScroll, useTransform } from 'framer-motion';
import {
  BookOpen, Palette, Droplets, Type, MousePointer, Zap,
  Eye, Layers, Sparkles, ArrowRight, Check, GripVertical,
  PanelLeft, Columns, Maximize2, Minimize2, Moon, Sun,
  Frame, Grid3X3
} from 'lucide-react';
import { Switch, Slider, Button as AntButton, Tag } from 'antd';

// ─────── 设计哲学 ───────
const PHILOSOPHY = {
  core: [
    {
      title: '暗色为骨',
      desc: '纯黑画布 (#000) 上叠加微妙的表面层级，让内容成为唯一的光源。不是"加了暗色模式的亮色设计"，而是原生暗色。',
      icon: Moon,
      tokens: ['--canvas: #000000', '--surface: #0d0d14', '--surface-high: #14141f'],
    },
    {
      title: '玻璃为衣',
      desc: '面板、弹窗、顶栏均采用毛玻璃材质。半透明背景 + backdrop-blur 创造深度层次，而不是堆叠边框。',
      icon: Droplets,
      tokens: ['glass-bg: rgba(13,13,20,0.88)', 'blur(20px) saturate(1.2)', 'glass-highlight inset 分割线'],
    },
    {
      title: '薰衣草紫',
      desc: '主色调 #8b7aa0 — 低饱和薰衣草紫。安静、中性、不带攻击性。辅以 #5a8a8a 极客青作为信息强调。',
      icon: Palette,
      tokens: ['--accent: #8b7aa0', '--accent-teal: #5a8a8a', '--accent-bg: rgba(139,122,160,0.10)'],
    },
    {
      title: '线条优先',
      desc: 'Lucide React 1.5px 描边线性图标。拒绝面性图标（Ant Design Icons Outlined 作为备选）。线性在暗色背景下更轻盈。',
      icon: Sparkles,
      tokens: ['lucide-react 为主图标库', '24×24 基座, 16×16 列表', '@ant-design/icons 用于 antd 配套'],
    },
    {
      title: '克制动效',
      desc: 'cubic-bezier(0.16, 1, 0.3, 1) 缓出曲线。60-350ms。无弹跳、无弹性、无旋转。动效服务于空间关系，不喧宾夺主。',
      icon: Zap,
      tokens: ['ease-out: (0.16, 1, 0.3, 1)', 'instant 60ms / normal 180ms', 'prefers-reduced-motion 全部归零'],
    },
    {
      title: '留白呼吸',
      desc: '4px 基础单位。最小间距 2px，最大 40px。卡片间距 16px。让内容呼吸，不是填满屏幕。',
      icon: Grid3X3,
      tokens: ['space scale: 2-4-8-12-16-20-24-32-40', 'card gap: 16px', 'content max-width: 1400px'],
    },
  ],
};

// ─────── 视觉对比：这 vs 这不是我们的风格 ───────
const DO_DONT = [
  {
    type: 'do',
    title: '毛玻璃模态框',
    description: 'blur(20px) 半透明，inset highlight 顶线',
    sample: (
      <div style={{
        background: 'var(--glass-bg)', backdropFilter: 'blur(20px) saturate(1.2)',
        border: '1px solid var(--glass-border)', borderRadius: 10,
        boxShadow: 'inset 0 1px 0 var(--glass-highlight)',
        padding: '20px 24px', width: 220, textAlign: 'center',
      }}>
        <div style={{ fontSize: 14, color: '#c8c4cc', fontWeight: 600 }}>作品详情</div>
        <div style={{ fontSize: 11, color: '#8b8594', marginTop: 6 }}>幽灵般的深度层次</div>
      </div>
    ),
  },
  {
    type: 'dont',
    title: '纯色硬边框弹窗',
    description: 'opaque background + heavy border — 扁平且突兀',
    sample: (
      <div style={{
        background: '#1a1a2e', border: '2px solid #333',
        borderRadius: 8, padding: '20px 24px', width: 220, textAlign: 'center',
      }}>
        <div style={{ fontSize: 14, color: '#fff', fontWeight: 600 }}>作品详情</div>
        <div style={{ fontSize: 11, color: '#999', marginTop: 6 }}>沉重的实体面板</div>
      </div>
    ),
  },
  {
    type: 'do',
    title: '微妙的边框语言',
    description: 'var(--divider) 分割线 — 暗示而非宣告',
    sample: (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: 220 }}>
        {['Manga 145部', 'Doujinshi 89部', 'Artbook 34部'].map((row, i) => (
          <div key={i} style={{
            padding: '10px 14px', background: 'var(--surface-high)', borderRadius: 5,
            border: '1px solid var(--divider)', fontSize: 12, color: 'var(--text-primary)',
          }}>
            {row}
          </div>
        ))}
      </div>
    ),
  },
  {
    type: 'dont',
    title: '高对比度边框',
    description: '#333 solid border — 生硬的分割感',
    sample: (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: 220 }}>
        {['Manga 145部', 'Doujinshi 89部', 'Artbook 34部'].map((row, i) => (
          <div key={i} style={{
            padding: '10px 14px', background: '#1a1a2e', borderRadius: 5,
            border: '2px solid #444', fontSize: 12, color: '#fff',
          }}>
            {row}
          </div>
        ))}
      </div>
    ),
  },
  {
    type: 'do',
    title: '线性图标体系',
    description: 'Lucide 1.5px stroke · 统一 · 轻盈',
    sample: (
      <div style={{ display: 'flex', gap: 20, justifyContent: 'center' }}>
        {[BookOpen, Eye, Check, GripVertical].map((Icon, i) => (
          <Icon key={i} size={20} style={{ color: '#8b7aa0' }} />
        ))}
      </div>
    ),
  },
  {
    type: 'dont',
    title: 'Emoji 作为图标',
    description: '📥 📖 📂 🗑️ — 风格破碎、廉价感',
    sample: (
      <div style={{ display: 'flex', gap: 16, justifyContent: 'center', fontSize: 20 }}>
        <span>📥</span><span>📖</span><span>📂</span><span>🗑️</span>
      </div>
    ),
  },
];

// ─────── 调色板展示 ───────
const PALETTE = [
  { name: 'Canvas', hex: '#000000', role: '底色 — 阅读器背景' },
  { name: 'Surface', hex: '#0d0d14', role: '基础表面 — 侧边栏' },
  { name: 'Surface High', hex: '#14141f', role: '抬升表面 — 卡片' },
  { name: 'Surface Hover', hex: '#181828', role: '悬浮态 — 交互反馈' },
  { name: 'Accent', hex: '#8b7aa0', role: '主色调 — 按钮、链接、选中' },
  { name: 'Accent Teal', hex: '#5a8a8a', role: '辅助色 — 信息、进度' },
  { name: 'Text Primary', hex: '#c8c4cc', role: '正文 — 标题、卡片标题' },
  { name: 'Text Secondary', hex: '#8b8594', role: '辅助文本 — 元数据' },
  { name: 'Text Muted', hex: '#5a5461', role: '弱化文本 — 标签、提示' },
];

// ─────── 字号/间距/时长可视化 ───────
const TYPO_SCALE = [
  { label: '3xs', size: '12px', usage: '脚注、辅助信息' },
  { label: '2xs', size: '13px', usage: '标签、时间戳' },
  { label: 'xs', size: '14px', usage: '卡片标题、按钮' },
  { label: 'sm', size: '15px', usage: '导航、副标题' },
  { label: 'base', size: '16px', usage: '正文段落' },
  { label: 'md', size: '18px', usage: '区块标题' },
  { label: 'lg', size: '20px', usage: '弹窗标题' },
  { label: 'xl', size: '23px', usage: '页面标题' },
  { label: '2xl', size: '30px', usage: 'Hero 标题' },
];

// ─────── Component ───────
function SectionHeader({ title, subtitle }) {
  return (
    <div style={{ marginBottom: 40 }}>
      <motion.h2
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true }}
        style={{
          fontSize: 'var(--text-xl)', fontWeight: 'var(--weight-bold)',
          color: 'var(--text-primary)', margin: 0,
        }}
      >
        {title}
      </motion.h2>
      {subtitle && (
        <p style={{
          fontSize: 'var(--text-xs)', color: 'var(--text-secondary)',
          margin: '8px 0 0', lineHeight: 1.6,
        }}>
          {subtitle}
        </p>
      )}
    </div>
  );
}

function DoDontCard({ item }) {
  const isDo = item.type === 'do';
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      style={{
        padding: 24,
        background: isDo ? 'rgba(107,139,107,0.06)' : 'rgba(176,96,96,0.06)',
        border: `1px solid ${isDo ? 'rgba(107,139,107,0.15)' : 'rgba(176,96,96,0.15)'}`,
        borderRadius: 'var(--radius-md)',
      }}
    >
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10,
        fontSize: 'var(--text-sm)', fontWeight: 'var(--weight-semibold)',
        color: isDo ? 'var(--success)' : 'var(--error)',
      }}>
        <Check size={14} />
        {item.title}
      </div>
      <p style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-muted)', margin: '0 0 16px' }}>
        {item.description}
      </p>
      <div style={{ display: 'flex', justifyContent: 'center' }}>
        {item.sample}
      </div>
    </motion.div>
  );
}

// ─────── Hero ───────
function Hero() {
  return (
    <div style={{
      position: 'relative', overflow: 'hidden',
      borderRadius: 'var(--radius-lg)', marginBottom: 60,
      padding: '60px 48px',
      background: 'linear-gradient(135deg, var(--accent-bg) 0%, transparent 60%)',
      border: '1px solid var(--divider)',
    }}>
      {/* Subtle decorative blobs */}
      <div style={{
        position: 'absolute', top: -80, right: -40,
        width: 300, height: 300, borderRadius: '50%',
        background: 'radial-gradient(circle, var(--accent-bg) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />
      <div style={{
        position: 'absolute', bottom: -60, left: -20,
        width: 200, height: 200, borderRadius: '50%',
        background: 'radial-gradient(circle, var(--accent-teal-bg) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        style={{ position: 'relative' }}
      >
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16,
        }}>
          <Sparkles size={14} style={{ color: 'var(--accent)' }} />
          <span style={{
            fontSize: 11, color: 'var(--accent)', fontWeight: 600,
            letterSpacing: 2, textTransform: 'uppercase',
          }}>
            Design Language v1.0
          </span>
        </div>
        <h1 style={{
          fontSize: '38px', fontWeight: 700, color: 'var(--text-primary)',
          margin: 0, lineHeight: 1.2, letterSpacing: '-0.02em',
        }}>
          暗色·玻璃·克制
        </h1>
        <p style={{
          fontSize: 'var(--text-md)', color: 'var(--text-secondary)',
          margin: '16px 0 0', maxWidth: 540, lineHeight: 1.6,
        }}>
          这是 MangaManager 经过三个月迭代后沉淀出的视觉语言——
          不是堆砌组件，不是追逐潮流，
          是在暗色画布上<strong style={{ color: 'var(--accent)' }}>用微妙的透明度</strong>和<strong style={{ color: 'var(--accent-teal)' }}>呼吸的留白</strong>，让漫画内容成为唯一的主角。
        </p>
      </motion.div>
    </div>
  );
}

// ─────── Main ───────
export default function DesignManifesto() {
  const [showAll, setShowAll] = useState(false);

  return (
    <div style={{
      padding: 'var(--space-8) var(--space-10)',
      maxWidth: 1100,
    }}>
      {/* Hero */}
      <Hero />

      {/* 设计哲学 核心原则 */}
      <SectionHeader title="六条核心原则" subtitle="这些不是建议，是设计决策。" />
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
        gap: 16, marginBottom: 60,
      }}>
        {PHILOSOPHY.core.map((p, i) => {
          const Icon = p.icon;
          return (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.05 }}
              style={{
                padding: 24, background: 'var(--surface-high)',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--divider)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <div style={{
                  width: 36, height: 36, borderRadius: 'var(--radius-sm)',
                  background: 'var(--accent-bg)', display: 'flex',
                  alignItems: 'center', justifyContent: 'center',
                  border: '1px solid var(--accent-border)',
                }}>
                  <Icon size={18} style={{ color: 'var(--accent)' }} />
                </div>
                <div style={{ fontSize: 'var(--text-sm)', fontWeight: 'var(--weight-semibold)', color: 'var(--text-primary)' }}>
                  {p.title}
                </div>
              </div>
              <p style={{
                fontSize: 'var(--text-2xs)', color: 'var(--text-secondary)',
                margin: '0 0 14px', lineHeight: 1.6,
              }}>
                {p.desc}
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {p.tokens.map((tok, j) => (
                  <code key={j} style={{
                    fontSize: 10, color: 'var(--accent-teal)', fontFamily: 'var(--font-mono)',
                    padding: '3px 8px', background: 'var(--accent-teal-bg)',
                    borderRadius: 3, border: '1px solid var(--accent-teal-border)',
                    wordBreak: 'break-all',
                  }}>
                    {tok}
                  </code>
                ))}
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Do / Don't */}
      <SectionHeader title="这一这不是我们的风格" subtitle="左栏是我们追求的，右栏是我们拒绝的。" />
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16,
        marginBottom: 60,
      }}>
        {DO_DONT.map((item, i) => (
          <DoDontCard key={i} item={item} />
        ))}
      </div>

      {/* 调色板 */}
      <SectionHeader title="调色板" />
      <div style={{
        display: 'flex', borderRadius: 'var(--radius-md)', overflow: 'hidden',
        border: '1px solid var(--divider)', marginBottom: 60,
      }}>
        {PALETTE.map((c, i) => (
          <div key={i} style={{
            flex: 1, padding: '24px 16px 20px', textAlign: 'center',
            background: c.hex === '#000000' ? c.hex : undefined,
            position: 'relative', minWidth: 90,
          }}>
            <div style={{
              width: 40, height: 40, borderRadius: 'var(--radius-sm)',
              background: c.hex, margin: '0 auto 10px',
              border: c.hex === '#000000' ? '1px solid var(--border-active)' : 'none',
            }} />
            <div style={{
              fontSize: 10, fontWeight: 600, color: '#c8c4cc',
              whiteSpace: 'nowrap',
            }}>
              {c.name}
            </div>
            <div style={{
              fontSize: 9, fontFamily: 'var(--font-mono)',
              color: 'rgba(255,255,255,0.35)', marginTop: 4,
            }}>
              {c.hex}
            </div>
            {showAll && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                style={{
                  fontSize: 9, color: 'rgba(255,255,255,0.25)',
                  marginTop: 6, lineHeight: 1.3,
                }}
              >
                {c.role}
              </motion.div>
            )}
          </div>
        ))}
      </div>
      <div style={{ textAlign: 'center', marginBottom: 60 }}>
        <button className="btn-sm" onClick={() => setShowAll(!showAll)}>
          {showAll ? <><Minimize2 size={12} /> 收起</> : <><Maximize2 size={12} /> 展开语义说明</>}
        </button>
      </div>

      {/* 字号 + 间距 */}
      <SectionHeader title="字号·间距·时长" />
      <div style={{
        display: 'grid', gridTemplateColumns: '1fr 1fr 1fr',
        gap: 16, marginBottom: 60,
      }}>
        {/* 字号 */}
        <div style={{
          padding: 24, background: 'var(--surface-high)',
          borderRadius: 'var(--radius-md)', border: '1px solid var(--divider)',
        }}>
          <div style={{
            fontSize: 'var(--text-sm)', fontWeight: 'var(--weight-semibold)',
            color: 'var(--text-primary)', marginBottom: 16,
          }}>
            字号阶梯
          </div>
          {TYPO_SCALE.map((t, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'baseline', gap: 12,
              padding: '6px 0', borderBottom: '1px solid var(--divider)',
            }}>
              <span style={{
                fontSize: t.size, fontWeight: 500,
                color: 'var(--text-primary)', minWidth: 56,
              }}>
                Aa
              </span>
              <code style={{
                fontSize: 9, color: 'var(--text-muted)',
                fontFamily: 'var(--font-mono)', minWidth: 36,
              }}>
                {t.size}
              </code>
              <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.2)' }}>
                {t.usage}
              </span>
            </div>
          ))}
        </div>

        {/* 间距 */}
        <div style={{
          padding: 24, background: 'var(--surface-high)',
          borderRadius: 'var(--radius-md)', border: '1px solid var(--divider)',
        }}>
          <div style={{
            fontSize: 'var(--text-sm)', fontWeight: 'var(--weight-semibold)',
            color: 'var(--text-primary)', marginBottom: 16,
          }}>
            间距系统 (4px base)
          </div>
          {[2, 4, 8, 12, 16, 20, 24, 32, 40].map((s, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '4px 0',
            }}>
              <div style={{
                width: s, height: 6, background: 'var(--accent-bg)',
                borderRadius: 2, flexShrink: 0,
              }} />
              <code style={{
                fontSize: 9, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)',
              }}>
                {`--space-${['0','1','2','3','4','5','6','8','10'][i]} = ${s}px`}
              </code>
            </div>
          ))}
        </div>

        {/* 时长 */}
        <div style={{
          padding: 24, background: 'var(--surface-high)',
          borderRadius: 'var(--radius-md)', border: '1px solid var(--divider)',
        }}>
          <div style={{
            fontSize: 'var(--text-sm)', fontWeight: 'var(--weight-semibold)',
            color: 'var(--text-primary)', marginBottom: 16,
          }}>
            动效时长 &amp; 用途
          </div>
          {[
            { dur: 60, name: 'instant', use: 'hover颜色变化、checkbox切换' },
            { dur: 120, name: 'fast', use: '按钮按压、tag进入' },
            { dur: 180, name: 'normal', use: '卡片入场、panel展开' },
            { dur: 240, name: 'slow', use: '页面过渡、模态框弹入' },
            { dur: 400, name: 'ambient', use: '背景动画、装饰性渐变' },
          ].map((d, i) => (
            <div key={i} style={{
              padding: '8px 0', borderBottom: '1px solid var(--divider)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{
                  width: d.dur * 0.2, height: 4, background: 'var(--accent)',
                  borderRadius: 2,
                }} />
                <code style={{
                  fontSize: 9, fontFamily: 'var(--font-mono)', color: 'var(--accent)',
                  minWidth: 50,
                }}>
                  {d.dur}ms
                </code>
              </div>
              <div style={{
                fontSize: 9, color: 'rgba(255,255,255,0.2)', marginTop: 4, marginLeft: 2,
              }}>
                {d.use}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 哲学陈述 */}
      <div style={{
        padding: '48px 40px',
        background: 'linear-gradient(135deg, var(--accent-bg), transparent)',
        borderRadius: 'var(--radius-lg)',
        border: '1px solid var(--divider)',
        textAlign: 'center',
        marginBottom: 60,
      }}>
        <Sparkles size={20} style={{ color: 'var(--accent)', marginBottom: 16 }} />
        <p style={{
          fontSize: 'var(--text-md)', color: 'var(--text-secondary)',
          maxWidth: 600, margin: '0 auto', lineHeight: 1.8,
        }}>
          "好的设计是<span style={{ color: 'var(--text-primary)' }}>看不见的</span>。
          它不会跳出来告诉你它有多好看——
          它只是让漫画封面成为页面上<span style={{ color: 'var(--accent)' }}>最亮的东西</span>，
          让你的手指自然地停在阅读按钮上，
          让你在凌晨两点翻开下一页时，
          <span style={{ color: 'var(--accent-teal)' }}>黑色背景不会刺到眼睛</span>。"
        </p>
        <div style={{
          fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: 16,
        }}>
          — MangaManager Design Language, v1.0
        </div>
      </div>
    </div>
  );
}
