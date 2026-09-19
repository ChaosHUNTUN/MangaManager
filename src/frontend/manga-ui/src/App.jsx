import { useState, useEffect, lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import LocalGallery from './pages/LocalGallery'
import EHentai from './pages/EHentai'
import ReaderLocal from './pages/ReaderLocal'
import DownloadMonitor from './pages/DownloadMonitor'
import Settings from './pages/Settings'
import NotFound from './pages/NotFound'
import FirstRunSetup from './components/FirstRunSetup'
import { API_BASE } from './api'
import useIsMobile from './hooks/useIsMobile'
import MobileTabBar from './components/MobileTabBar'
import './App.css'
import './mobile.css'

// 视觉验证页仅在开发环境加载：DEV 为 false 时该分支被静态替换并摇树移除，
// 生产包不会带上 antd / @ant-design/charts / @ant-design/icons
const VTRoutes = import.meta.env.DEV ? lazy(() => import('./visual-test/VTRoutes')) : null

/** 离线降级横幅：后端不可用时显示 */
function OfflineBanner({ onRetry }) {
  return (
    <div style={{
      background: 'linear-gradient(135deg, #7f1d1d, #450a0a)', color: '#fca5a5',
      padding: '10px 20px', textAlign: 'center', fontSize: '0.85rem',
      borderBottom: '1px solid #ef444440', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 12
    }}>
      <span>⚠️ 无法连接到后端服务 (localhost:5208)</span>
      <button onClick={onRetry} style={{
        background: '#ef444420', border: '1px solid #ef444460', color: '#fca5a5',
        padding: '3px 12px', borderRadius: 4, cursor: 'pointer', fontSize: '0.8rem'
      }}>重试</button>
    </div>
  )
}

export default function App() {
  const [offline, setOffline] = useState(false)
  const isMobile = useIsMobile()

  const checkHealth = () => {
    fetch(`${API_BASE}/health`).then(r => {
      setOffline(!r.ok)
    }).catch(() => setOffline(true))
  }

  useEffect(() => { checkHealth() }, [])

  return (
    <BrowserRouter>
      <div className={isMobile ? 'mobile' : ''}>
        {offline && <OfflineBanner onRetry={checkHealth} />}
        <Routes>
          <Route path="/" element={<LocalGallery />} />
          <Route path="/local" element={<LocalGallery />} />
          <Route path="/reader-local/:gid" element={<ReaderLocal />} />
          <Route path="/ehentai" element={<EHentai />} />
          <Route path="/downloads" element={<DownloadMonitor />} />
          <Route path="/settings" element={<Settings />} />

          {/* Visual Test Routes —— 仅开发环境（生产构建下 VTRoutes 为 null，整块被移除） */}
          {VTRoutes && (
            <Route path="/visual-test/*" element={
              <Suspense fallback={null}><VTRoutes /></Suspense>
            } />
          )}

          <Route path="*" element={<NotFound />} />
        </Routes>
        <FirstRunSetup />
        {isMobile && <MobileTabBar />}
      </div>
    </BrowserRouter>
  )
}

