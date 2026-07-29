import { useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route, NavLink, Outlet } from 'react-router-dom'
import LocalGallery from './pages/LocalGallery'
import ReaderRedirect from './pages/ReaderRedirect'
import EHentai from './pages/EHentai'
import ReaderLocal from './pages/ReaderLocal'
import DownloadMonitor from './pages/DownloadMonitor'
import NotFound from './pages/NotFound'
import { API_BASE } from './api'
import './App.css'

// Visual test pages (loaded lazily)
import VTColors from './visual-test/pages/ColorsShowcase'
import VTIcons from './visual-test/pages/IconsShowcase'
import VTButtons from './visual-test/pages/ButtonsShowcase'
import VTCards from './visual-test/pages/CardsShowcase'
import VTForms from './visual-test/pages/FormsShowcase'
import VTCharts from './visual-test/pages/ChartsShowcase'
import VTGlass from './visual-test/pages/GlassShowcase'
import VTAnims from './visual-test/pages/AnimationsShowcase'
import VTComps from './visual-test/pages/ComponentsShowcase'
import VTTypo from './visual-test/pages/TypographyShowcase'
import VTDesign from './visual-test/pages/DesignManifesto'
import VTReader from './visual-test/pages/ReaderShowcase'
import './visual-test/visual-test.css'
import { ThemeProvider, ThemeToggle } from './visual-test/ThemeContext'
import { Palette, Type, MousePointer2, LayoutGrid, FormInput, BarChart3, Droplets, Zap, Box, Sparkles, BookOpen } from 'lucide-react'
import { PictureOutlined } from '@ant-design/icons'

/** 离线降级横幅：后端不可用时显示 */
function OfflineBanner({ onRetry }) {
  return (
    <div style={{
      background: 'linear-gradient(135deg, #7f1d1d, #450a0a)', color: '#fca5a5',
      padding: '10px 20px', textAlign: 'center', fontSize: '0.85rem',
      borderBottom: '1px solid #ef444440', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 12
    }}>
      <span>⚠️ 无法连接到后端服务 (localhost:5000)</span>
      <button onClick={onRetry} style={{
        background: '#ef444420', border: '1px solid #ef444460', color: '#fca5a5',
        padding: '3px 12px', borderRadius: 4, cursor: 'pointer', fontSize: '0.8rem'
      }}>重试</button>
    </div>
  )
}

export default function App() {
  const [offline, setOffline] = useState(false)

  const checkHealth = () => {
    fetch(`${API_BASE}/health`).then(r => {
      setOffline(!r.ok)
    }).catch(() => setOffline(true))
  }

  useEffect(() => { checkHealth() }, [])

  return (
    <BrowserRouter>
      {offline && <OfflineBanner onRetry={checkHealth} />}
      <Routes>
        <Route path="/" element={<LocalGallery />} />
        <Route path="/local" element={<LocalGallery />} />
        <Route path="/reader/:id" element={<ReaderRedirect />} />
        <Route path="/reader-local/:gid" element={<ReaderLocal />} />
        <Route path="/ehentai" element={<EHentai />} />
        <Route path="/downloads" element={<DownloadMonitor />} />

        {/* Visual Test Routes */}
        <Route path="/visual-test/reader" element={<VTReader />} />
        <Route path="/visual-test" element={<VTNav />}>
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

        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  )
}

/** Visual Test sidebar navigation wrapper */
function VTNav() {
  const { pathname } = window.location;
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
  ];

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
              const active = pathname === link.path;
              return (
                <NavLink key={link.path} to={link.path}
                  className={`vt-nav-link${active ? ' active' : ''}`}>
                  <span className="vt-nav-icon">{link.icon}</span>
                  <span>{link.label}</span>
                </NavLink>
              );
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
  );
}
