import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import {
  fetchMangaList, fetchAllTags, fetchTagCategories, createTag,
  batchAddTags, scanDirectory, subscribeScanProgress, getCoverUrl,
  fetchDrives, fetchDirectory
} from '../api'

const TAG_COLORS = ['#8b5cf6','#f59e0b','#06b6d4','#ec4899','#10b981','#ef4444','#f97316','#3b82f6','#6366f1','#14b8a6','#d946ef','#84cc16']
const PAGE_SIZE = 48

export default function Home() {
  const [items, setItems] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(false)
  const [allTags, setAllTags] = useState([])
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')
  const [selectedTags, setSelectedTags] = useState([])

  // 批量选择
  const [selectedIds, setSelectedIds] = useState(new Set())
  const [batchMode, setBatchMode] = useState(false)

  // 扫描
  const [showScan, setShowScan] = useState(false)
  const [scanDir, setScanDir] = useState('')
  const [scanning, setScanning] = useState(false)
  const [scanProgress, setScanProgress] = useState(null)
  const [scanError, setScanError] = useState(null)

  // 目录浏览器
  const [dirStack, setDirStack] = useState([])
  const [dirList, setDirList] = useState([])
  const [dirLoading, setDirLoading] = useState(false)
  const [dirCurrent, setDirCurrent] = useState('')

  // 批量标签 modal
  const [showBatchTag, setShowBatchTag] = useState(false)
  const [newTagName, setNewTagName] = useState('')
  const [newTagColor, setNewTagColor] = useState(TAG_COLORS[0])

  const searchTimer = useRef(null)

  useEffect(() => { loadAll() }, [])

  const loadAll = async (s, t, p = 1) => {
    setLoading(true)
    setError(null)
    try {
      const [mangaData, tagData, catData] = await Promise.all([
        fetchMangaList(s, t, p, PAGE_SIZE), fetchAllTags(), fetchTagCategories()
      ])
      if (p === 1) {
        setItems(mangaData.items)
      } else {
        setItems(prev => [...prev, ...mangaData.items])
      }
      setTotal(mangaData.total)
      setPage(p)
      setHasMore(p < mangaData.totalPages)
      setAllTags(tagData)
      setCategories(catData)
    } catch (e) {
      setError(e.message || '加载失败')
    }
    setLoading(false)
  }

  const handleSearch = (v) => {
    setSearch(v)
    clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => loadAll(v, selectedTags, 1), 300)
  }
  const toggleTag = (tagId) => {
    const next = selectedTags.includes(tagId)
      ? selectedTags.filter(id => id !== tagId)
      : [...selectedTags, tagId]
    setSelectedTags(next)
    loadAll(search, next, 1)
  }

  const toggleSelect = (id) => {
    const next = new Set(selectedIds)
    if (next.has(id)) next.delete(id); else next.add(id)
    setSelectedIds(next)
  }
  const selectAll = () => {
    if (selectedIds.size === items.length) setSelectedIds(new Set())
    else setSelectedIds(new Set(items.map(m => m.id)))
  }

  const handleScan = async () => {
    if (!scanDir.trim()) { setScanError('请输入目录路径'); return }
    setScanning(true); setScanError(null); setScanProgress(null)
    const clientId = crypto.randomUUID ? crypto.randomUUID().slice(0, 8) : Date.now().toString(36)
    const es = subscribeScanProgress(clientId, (data) => { setScanProgress(data) })
    await new Promise(r => setTimeout(r, 100))
    try {
      const r = await scanDirectory(scanDir, clientId)
      if (r.success) {
        await loadAll(search, selectedTags, 1)
      } else {
        setScanError(r.message || '扫描失败')
      }
    } catch (e) {
      setScanError(e.message || '扫描失败')
    }
    setScanning(false)
    es.close()
  }

  // 目录浏览器
  const openDirBrowser = async (path) => {
    setShowScan(false)  // 先关闭扫描弹窗
    await browseDir(path || '')
    setShowScan(true)   // 重新打开以显示浏览器
  }

  const browseDir = async (path) => {
    setDirLoading(true)
    try {
      if (!path) {
        const drives = await fetchDrives()
        setDirList(drives.map(d => ({ name: d.name, path: d.path, isDir: true })))
        setDirCurrent('')
        setDirStack([])
      } else {
        const data = await fetchDirectory(path)
        setDirList(data.directories.map(d => ({ name: d.name, path: d.path, isDir: true, hasImages: d.hasImages })))
        setDirCurrent(data.current)
        if (data.parent && path !== data.current) {
          setDirStack(prev => [...prev, data.current])
        }
      }
    } catch (e) {
      // 忽略
    }
    setDirLoading(false)
  }

  const navigateUp = () => {
    if (dirStack.length > 1) {
      const newStack = dirStack.slice(0, -1)
      setDirStack(newStack)
      browseDir(newStack[newStack.length - 1] || '')
    } else {
      setDirStack([])
      browseDir('')
    }
  }

  const selectDir = (path) => {
    setScanDir(path)
    setShowScan(false)
    setDirStack([])
  }

  // 批量添加标签
  const handleBatchTag = async (tagId) => {
    if (selectedIds.size === 0) return
    try { await batchAddTags([...selectedIds], [tagId]) }
    catch (e) { alert(e.message) }
    setSelectedIds(new Set())
    setBatchMode(false)
    loadAll(search, selectedTags, 1)
  }

  const handleCreateTag = async () => {
    if (!newTagName.trim()) return
    try {
      const r = await createTag(newTagName.trim(), newTagColor)
      if (r.success) {
        setAllTags(prev => [...prev, r.data])
        setShowBatchTag(false)
        setNewTagName('')
      }
    } catch (e) { alert(e.message) }
  }

  // 重试
  if (error && items.length === 0) {
    return (
      <div className="container" style={{ paddingTop: 24 }}>
        <div className="empty">
          <p style={{ color: '#f87171', fontSize: '1rem' }}>⚠ 加载失败</p>
          <p style={{ color: '#888', fontSize: '0.85rem' }}>{error}</p>
          <p style={{ color: '#666', fontSize: '0.8rem' }}>请确认后端 API 已启动 (端口 5000)</p>
          <button className="btn-primary" onClick={() => loadAll(search, selectedTags, 1)}
            style={{ marginTop: 8 }}>🔄 重试</button>
        </div>
      </div>
    )
  }

  return (
    <div className="container" style={{ paddingTop: 24 }}>
      <div className="header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <h1 style={{ fontSize: '1.5rem', margin: 0 }}>📚 漫画库</h1>
          <span style={{ fontSize: '0.8rem', color: '#666' }}>{total} 部</span>
          <input className="search-input" placeholder="搜索标题/文件夹..."
            value={search} onChange={e => handleSearch(e.target.value)} />
          <button className="btn-sm" onClick={() => { setShowScan(true); setScanError(null); setScanProgress(null); setScanDir('') }}
            style={{ borderColor: '#7c3aed', color: '#a78bfa' }}>
            📂 扫描入库
          </button>
          <Link to="/ehentai" className="btn-sm"
            style={{ textDecoration: 'none', borderColor: '#ec4899', color: '#f472b6' }}>
            🌐 E-Hentai
          </Link>
          <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.8rem', color: '#888', cursor: 'pointer' }}>
            <input type="checkbox" checked={batchMode} onChange={() => { setBatchMode(!batchMode); setSelectedIds(new Set()) }} />
            批量模式
          </label>
          {batchMode && items.length > 0 && (
            <button className="btn-sm" onClick={selectAll}>
              {selectedIds.size === items.length ? '取消全选' : '全选'}
            </button>
          )}
        </div>
      </div>

      {/* 标签筛选（按分类分组） */}
      {categories.map(cat => {
        const catTags = allTags.filter(t => t.category === cat.key)
        if (catTags.length === 0) return null
        return (
          <div key={cat.key} style={{ marginBottom: 10 }}>
            <div style={{ fontSize: '0.7rem', color: '#666', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              {cat.icon} {cat.label}
            </div>
            <div className="tag-pills">
              {catTags.map(t => (
                <button key={t.id} className={`tag-pill ${selectedTags.includes(t.id) ? 'selected' : ''}`}
                  style={{ background: t.color + '20', color: t.color, borderColor: selectedTags.includes(t.id) ? t.color : 'transparent' }}
                  onClick={() => toggleTag(t.id)}>
                  {t.name}
                </button>
              ))}
            </div>
          </div>
        )
      })}

      {/* 内容 */}
      {loading && items.length === 0 && <div className="loading">加载中...</div>}
      {!loading && items.length === 0 && <div className="empty"><p>没有匹配的漫画</p></div>}

      <div className="grid">
        {items.map(m => {
          const mangaTags = m.tags || []
          return (
            <div key={m.id} style={{ position: 'relative' }}>
              {batchMode && (
                <div className="card-check" onClick={(e) => { e.preventDefault(); toggleSelect(m.id) }}
                  style={{ cursor: 'pointer', top: 8, right: 8, zIndex: 10 }}>
                  {selectedIds.has(m.id) ? '✓' : ''}
                </div>
              )}
              <Link to={`/manga/${m.id}`} className={`card ${selectedIds.has(m.id) ? 'selected' : ''}`}
                onClick={batchMode ? (e) => { e.preventDefault(); toggleSelect(m.id) } : undefined}
                title={`${m.title}\n文件数: ${m.fileCount}`}>
                {m.coverUrl ? (
                  <img className="card-cover" src={getCoverUrl(m.id)} alt={m.title} loading="lazy"
                    onError={(e) => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'flex' }} />
                ) : null}
                <div className="card-cover card-cover-placeholder" style={{ display: m.coverUrl ? 'none' : 'flex' }}>
                  <span style={{ fontSize: '2rem', opacity: 0.3 }}>📖</span>
                </div>
                <div className="card-info">
                  <div className="card-title">{m.title}</div>
                  <div className="card-meta">
                    <span>{m.fileCount} 张</span>
                    <span>{new Date(m.createdAt).toLocaleDateString()}</span>
                  </div>
                  {mangaTags.length > 0 && (
                    <div className="card-tags">
                      {mangaTags.slice(0, 3).map(t => (
                        <span key={t.id} className="card-tag" style={{ background: t.color + '20', color: t.color }}>{t.name}</span>
                      ))}
                      {mangaTags.length > 3 && <span className="card-tag" style={{ color: '#888' }}>+{mangaTags.length - 3}</span>}
                    </div>
                  )}
                </div>
              </Link>
            </div>
          )
        })}
      </div>

      {/* 加载更多 */}
      {hasMore && (
        <div style={{ textAlign: 'center', padding: '16px 0 32px' }}>
          <button className="btn-primary" onClick={() => loadAll(search, selectedTags, page + 1)}
            disabled={loading}
            style={{ padding: '8px 32px' }}>
            {loading ? '加载中...' : `加载更多 (${total - items.length} 部剩余)`}
          </button>
        </div>
      )}

      {/* 批量标签操作栏 */}
      {selectedIds.size > 0 && (
        <div className="batch-bar">
          <span className="count">已选 {selectedIds.size} 部</span>
          {allTags.slice(0, 8).map(t => (
            <button key={t.id} className="btn-sm"
              style={{ borderColor: t.color, color: t.color }}
              onClick={() => handleBatchTag(t.id)}>
              + {t.name}
            </button>
          ))}
          <button className="btn-sm" onClick={() => setShowBatchTag(true)}>+ 新建标签</button>
        </div>
      )}

      {/* 新建标签 Modal */}
      {showBatchTag && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowBatchTag(false)}>
          <div className="modal">
            <h3>新建标签</h3>
            <input value={newTagName} onChange={e => setNewTagName(e.target.value)}
              placeholder="标签名称" onKeyDown={e => e.key === 'Enter' && handleCreateTag()} />
            <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
              {TAG_COLORS.map(c => (
                <div key={c} onClick={() => setNewTagColor(c)}
                  style={{ width: 28, height: 28, borderRadius: '50%', background: c,
                    cursor: 'pointer', border: newTagColor === c ? '2px solid #fff' : '2px solid transparent' }} />
              ))}
            </div>
            <div className="modal-actions">
              <button className="btn-sm" onClick={() => setShowBatchTag(false)}>取消</button>
              <button className="btn-primary" onClick={handleCreateTag} style={{ padding: '6px 16px', fontSize: '0.85rem' }}>
                创建标签
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 扫描 & 目录浏览器 Modal */}
      {showScan && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && !scanning && setShowScan(false)}>
          <div className="modal" style={{ maxWidth: 500 }}>
            <h3>扫描目录入库</h3>

            {/* 带浏览按钮的路径输入 */}
            <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
              <input value={scanDir} onChange={e => setScanDir(e.target.value)}
                placeholder="点击右侧按钮浏览目录" disabled={scanning}
                style={{ flex: 1 }} />
              <button className="btn-sm" onClick={() => openDirBrowser(scanDir || '')} disabled={scanning}
                style={{ borderColor: '#7c3aed', color: '#a78bfa', whiteSpace: 'nowrap' }}>
                📁 浏览
              </button>
            </div>

            {/* 目录树 */}
            {dirList.length > 0 && (
              <div style={{
                maxHeight: 240, overflowY: 'auto', background: '#0f0f1a',
                border: '1px solid #2a2a4a', borderRadius: 8, marginBottom: 12
              }}>
                <div style={{
                  padding: '6px 12px', borderBottom: '1px solid #1a1a3a',
                  fontSize: '0.75rem', color: '#888', display: 'flex', justifyContent: 'space-between'
                }}>
                  <span style={{ wordBreak: 'break-all' }}>{dirCurrent || '此电脑'}</span>
                  {dirStack.length > 0 && (
                    <button className="btn-sm" onClick={navigateUp}
                      style={{ fontSize: '0.65rem', padding: '1px 6px' }}>⬆ 上级</button>
                  )}
                </div>
                {dirLoading ? (
                  <div className="loading" style={{ padding: 20, fontSize: '0.8rem' }}>读取目录...</div>
                ) : (
                  dirList.map(d => (
                    <div key={d.path}
                      onClick={() => d.isDir ? browseDir(d.path) : selectDir(d.path)}
                      style={{
                        padding: '6px 12px', cursor: 'pointer', fontSize: '0.8rem',
                        borderBottom: '1px solid #1a1a2e',
                        color: d.hasImages ? '#a78bfa' : '#888',
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                      }}>
                      <span>📁 {d.name}</span>
                      {d.hasImages && (
                        <span style={{ fontSize: '0.65rem', color: '#10b981' }}>含图片</span>
                      )}
                      <button className="btn-sm" onClick={(e) => { e.stopPropagation(); selectDir(d.path) }}
                        style={{ fontSize: '0.65rem', padding: '2px 8px', marginLeft: 8 }}>选此</button>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* 进度条 */}
            {scanProgress && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontSize: '0.8rem', color: '#a78bfa' }}>
                    {scanProgress.phase === 'scanning' ? '🔍' :
                     scanProgress.phase === 'loading' ? '📊' :
                     scanProgress.phase === 'processing' ? '⚙️' :
                     scanProgress.phase === 'complete' ? '✅' :
                     scanProgress.phase === 'error' ? '❌' : '📂'}
                    {' '}{scanProgress.message}
                  </span>
                  {scanProgress.total > 0 && (
                    <span style={{ fontSize: '0.75rem', color: '#888' }}>
                      {scanProgress.current}/{scanProgress.total}
                    </span>
                  )}
                </div>
                <div style={{ height: 6, background: '#2a2a4a', borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{
                    height: '100%',
                    width: scanProgress.total > 0
                      ? `${(scanProgress.current / scanProgress.total * 100).toFixed(0)}%`
                      : scanProgress.phase === 'scanning' ? '30%' : scanProgress.phase === 'loading' ? '60%' : '0%',
                    background: scanProgress.phase === 'error' ? '#ef4444' :
                                scanProgress.isComplete ? '#10b981' : 'linear-gradient(90deg, #7c3aed, #a78bfa)',
                    borderRadius: 3, transition: 'width 0.3s ease'
                  }} />
                </div>
                {scanProgress.isComplete && !scanProgress.phase.startsWith('error') && (
                  <div style={{ display: 'flex', gap: 16, marginTop: 8, fontSize: '0.8rem', color: '#888' }}>
                    <span>📚 总计 {scanProgress.total} 部</span>
                    <span style={{ color: '#10b981' }}>✨ 新增 {scanProgress.added}</span>
                    <span style={{ color: '#f59e0b' }}>🔄 更新 {scanProgress.updated}</span>
                  </div>
                )}
              </div>
            )}

            {scanError && <div className="status-msg error">{scanError}</div>}

            <div className="modal-actions">
              <button className="btn-sm" onClick={() => setShowScan(false)} disabled={scanning}>取消</button>
              <button className="btn-primary" onClick={handleScan} disabled={scanning}
                style={{ padding: '8px 20px', fontSize: '0.85rem' }}>
                {scanning ? '扫描中...' : '开始扫描'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
