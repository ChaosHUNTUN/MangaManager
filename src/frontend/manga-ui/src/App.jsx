import { useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import LocalGallery from './pages/LocalGallery'
import ReaderRedirect from './pages/ReaderRedirect'
import EHentai from './pages/EHentai'
import ReaderLocal from './pages/ReaderLocal'
import DownloadMonitor from './pages/DownloadMonitor'
import NotFound from './pages/NotFound'
import { API_BASE } from './api'
import './App.css'

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
        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  )
}
