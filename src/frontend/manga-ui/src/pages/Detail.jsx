import { useState, useEffect, useRef } from 'react'
import { useParams, Link } from 'react-router-dom'
import { fetchMangaDetail, fetchAllTags, fetchTagCategories, fetchMangaTags, setMangaTags, createTag, updateTag, renameManga, deleteManga, openInNeeView, pollReadingStatus, getCoverUrl } from '../api'

const TAG_COLORS = ['#8b5cf6','#f59e0b','#06b6d4','#ec4899','#10b981','#ef4444','#f97316','#3b82f1','#6366f1','#14b8a6','#d946ef','#84cc16']

export default function Detail() {
  const { id } = useParams()
  const [manga, setManga] = useState(null)
  const [allTags, setAllTags] = useState([])
  const [categories, setCategories] = useState([])
  const [mangaTagIds, setMangaTagIds] = useState([])
  const [loading, setLoading] = useState(true)
  const [opening, setOpening] = useState(false)
  const [statusMsg, setStatusMsg] = useState(null)
  const pollingRef = useRef(null)

  // 标签编辑
  const [newTagName, setNewTagName] = useState('')
  const [newTagColor, setNewTagColor] = useState(TAG_COLORS[0])
  const [newTagCategory, setNewTagCategory] = useState('other')

  useEffect(() => {
    Promise.all([fetchMangaDetail(id), fetchAllTags(), fetchTagCategories(), fetchMangaTags(id)])
      .then(([m, at, cat, mt]) => {
        setManga(m)
        setAllTags(at)
        setCategories(cat)
        setMangaTagIds(mt.map(t => t.id))
        setLoading(false)
      })
      .catch(() => setLoading(false))

    return () => { if (pollingRef.current) clearInterval(pollingRef.current) }
  }, [id])

  // 标签操作
  const toggleTag = async (tagId) => {
    const next = mangaTagIds.includes(tagId)
      ? mangaTagIds.filter(tid => tid !== tagId)
      : [...mangaTagIds, tagId]
    if (next.length > 100) return
    setMangaTagIds(next)
    await setMangaTags(parseInt(id), next)
  }

  // 重命名
  const [editingTitle, setEditingTitle] = useState(false)
  const [editName, setEditName] = useState('')
  const [renaming, setRenaming] = useState(false)
  const [renameError, setRenameError] = useState(null)

  // 编辑已有标签
  const [editingTag, setEditingTag] = useState(null)  // { id, name, color, category }
  const [tagError, setTagError] = useState(null)

  // 删除漫画
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleteFolder, setDeleteFolder] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const navigate = useRef(null)

  const handleDelete = async () => {
    setDeleting(true)
    const r = await deleteManga(parseInt(id), deleteFolder)
    if (r.success) {
      window.location.href = '/'
    } else {
      setRenameError(r.message || '删除失败')
      setDeleting(false)
    }
  }

  const handleRename = async () => {
    if (!editName.trim() || editName.trim() === manga.title) {
      setEditingTitle(false); return
    }
    setRenaming(true); setRenameError(null)
    const r = await renameManga(parseInt(id), editName.trim())
    if (r.success) {
      setManga(prev => ({ ...prev, title: r.data.newName, folderPath: r.data.newPath, folderName: r.data.newName }))
      setEditingTitle(false)
    } else {
      setRenameError(r.message || '重命名失败')
      setTimeout(() => setRenameError(null), 5000)
    }
    setRenaming(false)
  }

  const handleUpdateTag = async () => {
    if (!editingTag || !editingTag.name.trim()) return
    const r = await updateTag(editingTag.id, {
      name: editingTag.name.trim(),
      color: editingTag.color,
      category: editingTag.category
    })
    if (r.success) {
      setAllTags(prev => prev.map(t => t.id === editingTag.id ? r.data : t))
      setEditingTag(null)
    } else {
      setTagError(r.message || '编辑失败')
      setTimeout(() => setTagError(null), 3000)
    }
  }

  const handleCreateTag = async () => {
    setTagError(null)
    if (!newTagName.trim()) return
    const r = await createTag(newTagName.trim(), newTagColor, newTagCategory)
    if (r.success) {
      setAllTags(prev => [...prev, r.data])
      const next = [...mangaTagIds, r.data.id]
      setMangaTagIds(next)
      await setMangaTags(parseInt(id), next)
      setNewTagName('')
    } else {
      setTagError(r.message || '创建失败')
      setTimeout(() => setTagError(null), 3000)
    }
  }

  // NeeView 阅读
  const handleOpen = async () => {
    setOpening(true); setStatusMsg(null)
    try {
      const result = await openInNeeView(id)
      if (result.success) {
        setStatusMsg({ type: 'success', text: '📖 NeeView 已启动' })
        startPolling()
      } else {
        setStatusMsg({ type: 'error', text: `❌ ${result.message}` })
      }
    } catch { setStatusMsg({ type: 'error', text: '❌ 启动失败' }) }
    setOpening(false)
  }

  const startPolling = () => {
    if (pollingRef.current) clearInterval(pollingRef.current)
    pollingRef.current = setInterval(async () => {
      try {
        const s = await pollReadingStatus(id)
        if (s.isReadingManga) setStatusMsg({ type: 'success', text: '📖 正在阅读...' })
        else if (s.isRunning) setStatusMsg({ type: 'success', text: '📖 NeeView 运行中' })
        else { setStatusMsg(null); clearInterval(pollingRef.current); pollingRef.current = null }
      } catch { setStatusMsg(null); clearInterval(pollingRef.current); pollingRef.current = null }
    }, 1500)
  }

  if (loading) return <div className="loading">加载中...</div>
  if (!manga) return <div className="error">漫画不存在</div>

  const mangaTags = allTags.filter(t => mangaTagIds.includes(t.id))
  const availableTags = allTags.filter(t => !mangaTagIds.includes(t.id))
  const sizeMB = (manga.totalSize / (1024 * 1024)).toFixed(1)

  return (
    <div>
      <header className="header">
        <div><h1>📚 MangaManager</h1><span className="subtitle">漫画详情</span></div>
      </header>

      <div className="container">
        <Link to="/" className="back-btn">← 返回列表</Link>

        <div className="detail-layout">
          {/* 左侧：封面 + 阅读入口 */}
          <div>
            {manga.coverUrl
              ? <img className="detail-cover" src={getCoverUrl(id)} alt={manga.title} />
              : <div className="detail-cover" style={{ height: 400, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#2a2a4a' }}>无封面</div>}

            {/* 标题 + 重命名 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              {editingTitle ? (
                <>
                  <input value={editName} onChange={e => setEditName(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleRename(); if (e.key === 'Escape') setEditingTitle(false) }}
                    autoFocus
                    style={{
                      flex: 1, minWidth: 200, padding: '6px 12px', borderRadius: 6,
                      border: '1px solid #a78bfa', background: '#0f0f1a', color: '#e0e0e0',
                      fontSize: '1.2rem', fontWeight: 700
                    }} />
                  <button className="btn-sm" onClick={handleRename} disabled={renaming}
                    style={{ borderColor: '#10b981', color: '#10b981' }}>
                    {renaming ? '...' : '✓ 确认'}
                  </button>
                  <button className="btn-sm" onClick={() => setEditingTitle(false)}>✕</button>
                </>
              ) : (
                <>
                  <h1 className="detail-title" style={{ margin: 0 }}>{manga.title}</h1>
                  <button className="btn-sm" onClick={() => { setEditName(manga.title); setEditingTitle(true) }}
                    title="重命名漫画（同时重命名实际文件夹）"
                    style={{ padding: '2px 8px', fontSize: '0.7rem' }}>
                    ✏️ 重命名
                  </button>
                  <button className="btn-sm btn-danger" onClick={() => setShowDeleteConfirm(true)}
                    title="删除此漫画" style={{ padding: '2px 8px', fontSize: '0.7rem' }}>
                    🗑 删除
                  </button>
                </>
              )}
            </div>
            {renameError && <div style={{ color: '#f87171', fontSize: '0.8rem', marginTop: 4 }}>{renameError}</div>}
            <div className="detail-folder">{manga.folderPath}</div>

            {/* 删除确认弹窗 */}
            {showDeleteConfirm && (
              <div className="delete-overlay" onClick={() => setShowDeleteConfirm(false)}>
                <div className="delete-dialog" onClick={e => e.stopPropagation()}>
                  <div className="delete-dialog-title">确认删除</div>
                  <p style={{ color: '#aaa', margin: '8px 0' }}>
                    确定要删除「<strong style={{ color: '#fff' }}>{manga.title}</strong>」吗？
                  </p>
                  <p style={{ color: '#888', fontSize: '0.8rem', margin: '4px 0' }}>
                    此操作仅从数据库中移除记录，<strong style={{ color: '#fbbf24' }}>不会删除实际文件</strong>。
                  </p>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '10px 0', fontSize: '0.8rem', color: '#f87171' }}>
                    <input type="checkbox" checked={deleteFolder} onChange={e => setDeleteFolder(e.target.checked)} />
                    <span>同时删除磁盘上的文件夹（不可恢复）</span>
                  </label>
                  <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
                    <button className="btn-danger" onClick={handleDelete} disabled={deleting}
                      style={{ flex: 1, padding: '8px 16px' }}>
                      {deleting ? '删除中...' : '确认删除'}
                    </button>
                    <button className="btn-sm" onClick={() => setShowDeleteConfirm(false)}
                      style={{ flex: 1, padding: '8px 16px' }}>取消</button>
                  </div>
                </div>
              </div>
            )}

            {/* 当前标签（按分类分组） */}
            {mangaTags.length > 0 && (
              <div style={{ marginBottom: 12 }}>
                {categories.filter(c => mangaTags.some(t => t.category === c.key)).map(cat => (
                  <div key={cat.key} style={{ marginBottom: 4 }}>
                    <div style={{ fontSize: '0.65rem', color: '#666', marginBottom: 3 }}>{cat.icon} {cat.label}</div>
                    <div className="tag-pills">
                      {mangaTags.filter(t => t.category === cat.key).map(t => (
                        <span key={t.id} className="tag-pill" style={{ background: t.color + '20', color: t.color, borderColor: t.color + '40' }}>
                          {t.name}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* 阅读方式 */}
            <div className="read-modes">
              <div className="read-modes-label">选择阅读方式</div>
              <div className="read-modes-btns">
                <Link to={`/reader/${id}`} className="btn-green">🌐 网页阅读</Link>
                <button className="btn-primary" onClick={handleOpen} disabled={opening} style={{ marginTop: 0 }}>
                  📖 {opening ? '启动中...' : 'NeeView 阅读'}
                </button>
              </div>
            </div>

            {statusMsg && (
              <div className={`status-msg ${statusMsg.type}`}>{statusMsg.text}</div>
            )}
          </div>

          {/* 右侧：元数据 + 标签编辑 */}
          <div>
            <div className="meta-grid">
              <div className="meta-item"><div className="meta-label">文件数量</div><div className="meta-value">{manga.fileCount} 张</div></div>
              <div className="meta-item"><div className="meta-label">总大小</div><div className="meta-value">{sizeMB} MB</div></div>
              <div className="meta-item"><div className="meta-label">状态</div><div className="meta-value">{manga.status === 'ongoing' ? '连载中' : manga.status === 'completed' ? '已完结' : '未知'}</div></div>
              <div className="meta-item"><div className="meta-label">阅读进度</div><div className="meta-value">{manga.progressPage != null ? `第 ${manga.progressPage + 1} 页` : '未开始'}</div></div>
              <div className="meta-item"><div className="meta-label">创建时间</div><div className="meta-value">{new Date(manga.createdAt).toLocaleDateString()}</div></div>
              <div className="meta-item"><div className="meta-label">更新时间</div><div className="meta-value">{new Date(manga.updatedAt).toLocaleDateString()}</div></div>
            </div>

            {/* 标签编辑 */}
            <div className="tag-editor">
              <div className="tag-editor-title">标签管理（{mangaTagIds.length}/100）</div>

              {/* 已选标签（按分类） */}
              {categories.filter(c => mangaTags.some(t => t.category === c.key)).map(cat => (
                <div key={cat.key} style={{ marginBottom: 6 }}>
                  <div style={{ fontSize: '0.65rem', color: '#666', marginBottom: 3 }}>{cat.label}</div>
                  <div className="tag-editor-tags">
                    {mangaTags.filter(t => t.category === cat.key).map(t => (
                      <span key={t.id} className="tag-editor-tag"
                        style={{ background: t.color + '20', color: t.color, border: `1px solid ${t.color}40` }}>
                        <span onClick={() => setEditingTag({ id: t.id, name: t.name, color: t.color, category: t.category })}
                          style={{ cursor: 'pointer' }} title="点击编辑标签（影响所有关联漫画）">
                          {t.name}
                        </span>
                        <span className="remove" onClick={() => toggleTag(t.id)}
                          title="从此漫画移除">×</span>
                      </span>
                    ))}
                  </div>
                </div>
              ))}

              {/* 可用标签（按分类） */}
              {availableTags.length > 0 && (
                <div style={{ marginTop: 12, marginBottom: 10 }}>
                  <div style={{ fontSize: '0.72rem', color: '#666', marginBottom: 6 }}>可用标签（点击添加）</div>
                  {categories.filter(c => availableTags.some(t => t.category === c.key)).map(cat => (
                    <div key={cat.key} style={{ marginBottom: 4 }}>
                      <div style={{ fontSize: '0.6rem', color: '#888', marginBottom: 2 }}>{cat.label}</div>
                      <div className="tag-suggestions">
                        {availableTags.filter(t => t.category === cat.key).map(t => (
                          <span key={t.id} className="tag-suggestion" onClick={() => toggleTag(t.id)}>+ {t.name}</span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* 新建标签 */}
              <div style={{ marginTop: 10, padding: 10, background: '#16162a', borderRadius: 8 }}>
                <div style={{ fontSize: '0.72rem', color: '#888', marginBottom: 6 }}>新建标签</div>
                <div className="tag-input-row">
                  <input value={newTagName} onChange={e => setNewTagName(e.target.value)}
                    placeholder="标签名称" onKeyDown={e => e.key === 'Enter' && handleCreateTag()} />
                </div>
                {/* 分类选择 */}
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                  {categories.map(c => (
                    <button key={c.key}
                      className={`btn-sm ${newTagCategory === c.key ? 'active' : ''}`}
                      style={{ fontSize: '0.7rem', borderColor: newTagCategory === c.key ? c.color : '#444',
                        color: newTagCategory === c.key ? c.color : '#888' }}
                      onClick={() => { setNewTagCategory(c.key); setNewTagColor(c.color) }}>
                      {c.icon} {c.label}
                    </button>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
                  {TAG_COLORS.map(c => (
                    <div key={c} onClick={() => setNewTagColor(c)} style={{
                      width: 22, height: 22, borderRadius: '50%', background: c, cursor: 'pointer',
                      border: newTagColor === c ? '2px solid #fff' : '2px solid transparent'
                    }} />
                  ))}
                </div>
                {tagError && <div style={{ color: '#f87171', fontSize: '0.78rem', marginBottom: 4 }}>{tagError}</div>}
                <button className="btn-primary" onClick={handleCreateTag} style={{ padding: '6px 16px', fontSize: '0.8rem' }}>
                  创建标签
                </button>
              </div>

              {/* 编辑标签弹窗 */}
              {editingTag && (
                <div style={{ marginTop: 10, padding: 10, background: '#16162a', borderRadius: 8, border: '1px solid #7c3aed' }}>
                  <div style={{ fontSize: '0.72rem', color: '#a78bfa', marginBottom: 8 }}>
                    ✏️ 编辑标签「{editingTag.name}」（影响所有关联漫画）
                  </div>
                  <div className="tag-input-row">
                    <input value={editingTag.name} onChange={e => setEditingTag({ ...editingTag, name: e.target.value })}
                      placeholder="标签名称" onKeyDown={e => e.key === 'Enter' && handleUpdateTag()} />
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                    {categories.map(c => (
                      <button key={c.key}
                        className={`btn-sm ${editingTag.category === c.key ? 'active' : ''}`}
                        style={{ fontSize: '0.7rem', borderColor: editingTag.category === c.key ? c.color : '#444',
                          color: editingTag.category === c.key ? c.color : '#888' }}
                        onClick={() => setEditingTag({ ...editingTag, category: c.key })}>
                        {c.icon} {c.label}
                      </button>
                    ))}
                  </div>
                  <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
                    {TAG_COLORS.map(c => (
                      <div key={c} onClick={() => setEditingTag({ ...editingTag, color: c })} style={{
                        width: 22, height: 22, borderRadius: '50%', background: c, cursor: 'pointer',
                        border: editingTag.color === c ? '2px solid #fff' : '2px solid transparent'
                      }} />
                    ))}
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn-sm" onClick={handleUpdateTag}
                      style={{ borderColor: '#10b981', color: '#10b981' }}>✓ 保存</button>
                    <button className="btn-sm" onClick={() => setEditingTag(null)}>取消</button>
                  </div>
                </div>
              )}
            </div>

            {manga.description && (
              <div style={{ background: '#1e1e36', padding: 16, borderRadius: 8, marginTop: 16 }}>
                <div className="meta-label" style={{ marginBottom: 8 }}>描述</div>
                <div style={{ fontSize: '0.9rem', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{manga.description}</div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
