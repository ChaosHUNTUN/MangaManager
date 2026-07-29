import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button as AntButton, ConfigProvider } from 'antd';
import { Download, BookOpen, FolderOpen, Trash2 } from 'lucide-react';
import { useAntdTheme } from '../antdTheme';

const BTN_VARIANTS = [
  { name: 'btn-primary', label: 'primary', css: 'btn-primary' },
  { name: 'btn-green', label: 'green', css: 'btn-green' },
  { name: 'btn-outline', label: 'outline', css: 'btn-outline' },
  { name: 'btn-sm', label: 'sm', css: 'btn-sm' },
  { name: 'btn-danger', label: 'danger', css: 'btn-danger' },
  { name: 'btn-ghost', label: 'ghost', css: 'btn-ghost' },
];

export default function ButtonsShowcase() {
  const antdThemeConfig = useAntdTheme();
  const [loading, setLoading] = useState({});

  const toggleLoading = (key) => {
    setLoading(prev => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <div className="vt-page">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
        <div className="vt-page-header">
          <h1>按钮系统</h1>
          <p>现有 CSS 按钮类 vs Ant Design Button — 变体、尺寸、状态和加载态对比</p>
        </div>

        {/* 现有 CSS 按钮 */}
        <div className="vt-section">
          <h2 className="vt-section-title">现有 CSS 按钮类（App.css）</h2>
          <p className="vt-section-desc">基于 tokens.css 设计令牌的 6 种按钮变体</p>

          {/* 默认态 */}
          <div className="vt-demo-card" style={{ marginBottom: 'var(--space-4)' }}>
            <h3>默认状态</h3>
            <div className="vt-row vt-row-gap-lg">
              <button className="btn-primary">Primary 按钮</button>
              <button className="btn-green">Success 按钮</button>
              <button className="btn-outline">Outline 按钮</button>
              <button className="btn-sm">Small 按钮</button>
              <button className="btn-danger">Danger 按钮</button>
              <button className="btn-ghost">Ghost 按钮</button>
            </div>
          </div>

          {/* 禁用态 */}
          <div className="vt-demo-card" style={{ marginBottom: 'var(--space-4)' }}>
            <h3>禁用状态</h3>
            <div className="vt-row vt-row-gap-lg">
              <button className="btn-primary" disabled>Primary</button>
              <button className="btn-green" disabled>Success</button>
              <button className="btn-outline" disabled>Outline</button>
              <button className="btn-sm" disabled>Small</button>
              <button className="btn-danger" disabled>Danger</button>
            </div>
          </div>

          {/* 图标 + 文字 */}
          <div className="vt-demo-card">
            <h3>带图标</h3>
            <p style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-muted)', margin: '0 0 var(--space-3)' }}>
              全局规则：button:has(svg) 自动应用 inline-flex / gap:6px，svg 继承按钮字号
            </p>
            <div className="vt-row vt-row-gap-lg">
              <button className="btn-primary">
                <Download /> 下载选中
              </button>
              <button className="btn-green">
                <BookOpen /> 开始阅读
              </button>
              <button className="btn-outline">
                <FolderOpen /> 导入漫画
              </button>
              <button className="btn-danger">
                <Trash2 /> 删除
              </button>
            </div>
            <div style={{ marginTop: 'var(--space-3)' }}>
              <button className="btn-sm">
                <Download /> Small with icon
              </button>
            </div>
          </div>
        </div>

        {/* Ant Design 按钮 */}
        <div className="vt-section">
          <h2 className="vt-section-title">Ant Design Button</h2>
          <p className="vt-section-desc">ConfigProvider 暗色主题 + 6 种 type + 5 种 size</p>

          <ConfigProvider theme={antdThemeConfig}>
            {/* Type 变体 */}
            <div className="vt-demo-card" style={{ marginBottom: 'var(--space-4)' }}>
              <h3>Type 变体</h3>
              <div className="vt-row vt-row-gap-lg">
                <AntButton type="primary">Primary</AntButton>
                <AntButton type="default">Default</AntButton>
                <AntButton type="dashed">Dashed</AntButton>
                <AntButton type="text">Text</AntButton>
                <AntButton type="link">Link</AntButton>
              </div>
            </div>

            {/* 尺寸 */}
            <div className="vt-demo-card" style={{ marginBottom: 'var(--space-4)' }}>
              <h3>尺寸对比</h3>
              <div className="vt-row vt-row-gap-lg" style={{ alignItems: 'center' }}>
                <AntButton type="primary" size="small">Small</AntButton>
                <AntButton type="primary" size="middle">Middle</AntButton>
                <AntButton type="primary" size="large">Large</AntButton>
                <AntButton type="primary" style={{ height: 48, padding: '0 32px', fontSize: 18 }}>
                  Custom
                </AntButton>
              </div>
            </div>

            {/* 加载态 */}
            <div className="vt-demo-card" style={{ marginBottom: 'var(--space-4)' }}>
              <h3>加载状态</h3>
              <div className="vt-row vt-row-gap-lg">
                <AntButton type="primary" loading={loading.p1} onClick={() => toggleLoading('p1')}>
                  {loading.p1 ? '下载中...' : '开始下载'}
                </AntButton>
                <AntButton loading={loading.d} onClick={() => toggleLoading('d')}>
                  {loading.d ? '保存中...' : '保存'}
                </AntButton>
                <AntButton type="dashed" loading={loading.ds} onClick={() => toggleLoading('ds')}>
                  {loading.ds ? '加载中...' : '加载更多'}
                </AntButton>
                <AntButton danger loading={loading.dg} onClick={() => toggleLoading('dg')}>
                  {loading.dg ? '删除中...' : '删除'}
                </AntButton>
              </div>
            </div>

            {/* 危险 + 图标 */}
            <div className="vt-demo-card">
              <h3>危险 + 图标</h3>
              <div className="vt-row vt-row-gap-lg">
                <AntButton type="primary" danger>Primary Danger</AntButton>
                <AntButton danger>Default Danger</AntButton>
                <AntButton type="text" danger>Text Danger</AntButton>
                <AntButton type="link" danger>Link Danger</AntButton>
              </div>
            </div>
          </ConfigProvider>
        </div>
      </motion.div>
    </div>
  );
}
