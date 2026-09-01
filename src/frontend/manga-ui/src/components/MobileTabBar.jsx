import { NavLink, useLocation } from 'react-router-dom'
import { LayoutGrid, Globe, Download } from 'lucide-react'

/**
 * 移动端底部标签栏（独立移动端导航）
 * 阅读器路由下自动隐藏（阅读器全屏）
 */
export default function MobileTabBar() {
  const { pathname } = useLocation()
  const isReader = pathname.startsWith('/reader') || pathname.startsWith('/reader-local')
  if (isReader) return null

  const tabs = [
    { to: '/local', label: '本地', icon: <LayoutGrid size={20} /> },
    { to: '/ehentai', label: '浏览', icon: <Globe size={20} /> },
    { to: '/downloads', label: '下载', icon: <Download size={20} /> },
  ]

  return (
    <nav className="mobile-tabbar">
      {tabs.map(t => (
        <NavLink key={t.to} to={t.to} end={t.to === '/local'}
          className={({ isActive }) => `mobile-tab${isActive ? ' active' : ''}`}>
          {t.icon}
          <span>{t.label}</span>
        </NavLink>
      ))}
    </nav>
  )
}
