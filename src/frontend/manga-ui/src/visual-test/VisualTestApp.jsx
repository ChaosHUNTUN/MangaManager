import React, { useState } from 'react';
import { HashRouter, Routes, Route, NavLink, Navigate } from 'react-router-dom';
import {
  Palette, MousePointer2, LayoutGrid, FormInput,
  BarChart3, Atom, Shapes, Layers,
  Sparkles, Zap, Box,
  Type, Droplets
} from 'lucide-react';
import {
  AppstoreOutlined, PictureOutlined, HighlightOutlined,
  DashboardOutlined, ExperimentOutlined
} from '@ant-design/icons';

// 导入所有测试页面
import ColorsShowcase from './pages/ColorsShowcase';
import IconsShowcase from './pages/IconsShowcase';
import ButtonsShowcase from './pages/ButtonsShowcase';
import CardsShowcase from './pages/CardsShowcase';
import FormsShowcase from './pages/FormsShowcase';
import ChartsShowcase from './pages/ChartsShowcase';
import GlassShowcase from './pages/GlassShowcase';
import AnimationsShowcase from './pages/AnimationsShowcase';
import ComponentsShowcase from './pages/ComponentsShowcase';
import TypographyShowcase from './pages/TypographyShowcase';

const NAV_SECTIONS = [
  {
    title: '设计基础',
    items: [
      { path: '/colors', label: '色彩令牌', icon: <Palette size={16} />, antIcon: <HighlightOutlined /> },
      { path: '/typography', label: '字体排版', icon: <Type size={16} /> },
      { path: '/icons', label: '图标系统', icon: <Sparkles size={16} />, antIcon: <PictureOutlined /> },
    ]
  },
  {
    title: 'UI 组件',
    items: [
      { path: '/buttons', label: '按钮系统', icon: <MousePointer2 size={16} /> },
      { path: '/cards', label: '卡片动画', icon: <LayoutGrid size={16} /> },
      { path: '/forms', label: '表单组件', icon: <FormInput size={16} /> },
      { path: '/components', label: 'Antd 全家桶', icon: <Box size={16} />, antIcon: <AppstoreOutlined /> },
    ]
  },
  {
    title: '视觉效果',
    items: [
      { path: '/glass', label: '毛玻璃特效', icon: <Droplets size={16} /> },
      { path: '/animations', label: '动效演示', icon: <Zap size={16} />, antIcon: <ExperimentOutlined /> },
    ]
  },
  {
    title: '数据可视化',
    items: [
      { path: '/charts', label: 'AntV 图表', icon: <BarChart3 size={16} />, antIcon: <DashboardOutlined /> },
    ]
  },
];

export default function VisualTestApp() {
  const [useAntIcon, setUseAntIcon] = useState(false);

  return (
    <HashRouter>
      <div className="vt-root">
        {/* 侧边导航 */}
        <aside className="vt-sidebar">
          <div className="vt-sidebar-header">
            <h2>UI 视觉验证</h2>
            <p>MangaManager Design System</p>
          </div>
          <nav className="vt-sidebar-nav">
            {NAV_SECTIONS.map((section, i) => (
              <div key={i} className="vt-nav-section">
                <div className="vt-nav-section-title">{section.title}</div>
                {section.items.map(item => (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    className={({ isActive }) =>
                      `vt-nav-link${isActive ? ' active' : ''}`
                    }
                  >
                    <span className="vt-nav-icon">
                      {useAntIcon && item.antIcon ? item.antIcon : item.icon}
                    </span>
                    <span>{item.label}</span>
                  </NavLink>
                ))}
              </div>
            ))}
            <div className="vt-nav-section">
              <button
                className="vt-nav-link"
                onClick={() => setUseAntIcon(!useAntIcon)}
                style={{ fontSize: '11px', color: 'var(--text-muted)' }}
              >
                <span className="vt-nav-icon">{useAntIcon ? <Atom size={14} /> : <Shapes size={14} />}</span>
                <span>切换图标库: {useAntIcon ? 'AntD' : 'Lucide'}</span>
              </button>
            </div>
          </nav>
        </aside>

        {/* 主内容区 */}
        <main className="vt-content">
          <Routes>
            <Route path="/" element={<Navigate to="/colors" replace />} />
            <Route path="/colors" element={<ColorsShowcase />} />
            <Route path="/typography" element={<TypographyShowcase />} />
            <Route path="/icons" element={<IconsShowcase />} />
            <Route path="/buttons" element={<ButtonsShowcase />} />
            <Route path="/cards" element={<CardsShowcase />} />
            <Route path="/forms" element={<FormsShowcase />} />
            <Route path="/charts" element={<ChartsShowcase />} />
            <Route path="/glass" element={<GlassShowcase />} />
            <Route path="/animations" element={<AnimationsShowcase />} />
            <Route path="/components" element={<ComponentsShowcase />} />
          </Routes>
        </main>
      </div>
    </HashRouter>
  );
}
