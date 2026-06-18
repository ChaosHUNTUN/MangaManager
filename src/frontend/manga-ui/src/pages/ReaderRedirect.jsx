import { useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { API_BASE } from '../api'

/**
 * 防腐层：将旧版 /reader/:id 路由重定向到统一阅读器 /reader-local/:gid
 * 通过后端转换端点获取虚拟 gid，实现 UI 层统一
 */
export default function ReaderRedirect() {
  const { id } = useParams()
  const navigate = useNavigate()

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(`${API_BASE}/api/manga/${id}/as-local-gallery`)
        if (!res.ok) throw new Error('作品不存在')
        const json = await res.json()
        if (cancelled) return
        navigate(`/reader-local/${json.data.gid}`, { replace: true })
      } catch {
        if (!cancelled) navigate('/', { replace: true })
      }
    })()
    return () => { cancelled = true }
  }, [id, navigate])

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh', color: '#888' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: '1.5rem', marginBottom: 8 }}>📖</div>
        <div>正在加载阅读器...</div>
      </div>
    </div>
  )
}
