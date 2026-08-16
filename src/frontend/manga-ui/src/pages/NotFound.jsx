import { Link } from 'react-router-dom'

export default function NotFound() {
  return (
    <div style={{ textAlign: 'center', padding: '80px 20px' }}>
      <h1 style={{ fontSize: '4rem', color: 'var(--accent)', marginBottom: 16 }}>404</h1>
      <p style={{ color: 'var(--text-muted)', fontSize: '1.1rem', marginBottom: 24 }}>页面不存在</p>
      <Link to="/" className="btn-primary">返回首页</Link>
    </div>
  )
}
