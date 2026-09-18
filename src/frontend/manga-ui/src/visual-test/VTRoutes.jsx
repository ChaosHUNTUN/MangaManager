/**
 * 视觉验证（设计系统展示）路由 —— 仅开发环境加载。
 *
 * 这些页面依赖 antd / @ant-design/charts / @ant-design/icons，体量很大且与业务无关；
 * App.jsx 通过 `import.meta.env.DEV` + React.lazy 引入本模块，
 * 生产构建时该分支会被静态替换为 false 并摇树移除，相关依赖不会进入产物。
 */
import { NavLink, Outlet, Route, Routes } from 'react-router-dom'
import { PictureOutlined } from '@ant-design/icons'
import {
  Palette, Type, MousePointer2, LayoutGrid, FormInput, BarChart3,
  Droplets, Zap, Box, Sparkles, BookOpen,
} from 'lucide-react'
import { ThemeProvider, ThemeToggle } from './ThemeContext'
import './visual-test.css'

import VTColors from './pages/ColorsShowcase'
import VTIcons from './pages/IconsShowcase'
import VTButtons from './pages/ButtonsShowcase'
import VTCards from './pages/CardsShowcase'
import VTForms from './pages/FormsShowcase'
import VTCharts from './pages/ChartsShowcase'
import VTGlass from './pages/GlassShowcase'
import VTAnims from './pages/AnimationsShowcase'
import VTComps from './pages/ComponentsShowcase'
import VTTypo from './pages/TypographyShowcase'
import VTDesign from './pages/DesignManifesto'
import VTReader from './pages/ReaderShowcase'

/** Visual Test sidebar navigation wrapper */
function VTNav() {
  const { pathname } = window.location
  const links = [
    { path: '/visual-test/design', label: '设计语言', icon: <Sparkles size={15} /> },
    { path: '/visual-test/colors', label: '色彩令牌', icon: <Palette size={15} /> },
    { path: '/visual-test/typography', label: '字体排版', icon: <Type size={15} /> },
    { path: '/visual-test/icons', label: '图标系统', icon: <PictureOutlined /> },
    { path: '/visual-test/buttons', label: '按钮系统', icon: <MousePointer2 size={15} /> },
    { path: '/visual-test/cards', label: '卡片动画', icon: <LayoutGrid size={15} /> },
    { path: '/visual-test/forms', label: '表单组件', icon: <FormInput size={15} /> },
    { path: '/visual-test/charts', label: 'AntV 图表', icon: <BarChart3 size={15} /> },
    { path: '/visual-test/glass', label: '毛玻璃特效', icon: <Droplets size={15} /> },
    { path: '/visual-test/animations', label: '动效演示', icon: <Zap size={15} /> },
    { path: '/visual-test/components', label: 'Antd 全家桶', icon: <Box size={15} /> },
    { path: '/visual-test/reader', label: '阅读器设计', icon: <BookOpen size={15} /> },
  ]

  return (
    <ThemeProvider>
      <div className="vt-root">
        <aside className="vt-sidebar">
          <div className="vt-sidebar-header">
            <h2>UI 视觉验证</h2>
            <p>MangaManager Design System</p>
          </div>
          <nav className="vt-sidebar-nav">
            {links.map(link => {
              const active = pathname === link.path
              return (
                <NavLink key={link.path} to={link.path}
                  className={`vt-nav-link${active ? ' active' : ''}`}>
                  <span className="vt-nav-icon">{link.icon}</span>
                  <span>{link.label}</span>
                </NavLink>
              )
            })}
          </nav>
          <div style={{ padding: 'var(--space-2)', borderTop: '1px solid var(--divider)' }}>
            <ThemeToggle />
          </div>
        </aside>
        <main className="vt-content">
          <Outlet />
        </main>
      </div>
    </ThemeProvider>
  )
}

/** 挂载在 /visual-test/* 下：内部路径相对于该前缀 */
export default function VTRoutes() {
  return (
    <Routes>
      <Route path="reader" element={<VTReader />} />
      <Route element={<VTNav />}>
        <Route index element={<VTDesign />} />
        <Route path="design" element={<VTDesign />} />
        <Route path="colors" element={<VTColors />} />
        <Route path="typography" element={<VTTypo />} />
        <Route path="icons" element={<VTIcons />} />
        <Route path="buttons" element={<VTButtons />} />
        <Route path="cards" element={<VTCards />} />
        <Route path="forms" element={<VTForms />} />
        <Route path="charts" element={<VTCharts />} />
        <Route path="glass" element={<VTGlass />} />
        <Route path="animations" element={<VTAnims />} />
        <Route path="components" element={<VTComps />} />
      </Route>
    </Routes>
  )
}
