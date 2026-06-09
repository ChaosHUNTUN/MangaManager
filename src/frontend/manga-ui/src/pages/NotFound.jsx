import { Link } from 'react-router-dom'

export default function NotFound() {
  return (
    <div style={{ textAlign: 'center', padding: '80px 20px' }}>
      <h1 style={{ fontSize: '4rem', color: '#7c3aed', marginBottom: 16 }}>404</h1>
      <p style={{ color: '#888', fontSize: '1.1rem', marginBottom: 24 }}>页面不存在</p>
      <Link to="/" style={{
        display: 'inline-block', padding: '10px 24px', borderRadius: 8,
        background: 'linear-gradient(135deg, #7c3aed, #a78bfa)', color: '#fff',
        textDecoration: 'none', fontWeight: 600
      }}>返回首页</Link>
    </div>
  )
}
