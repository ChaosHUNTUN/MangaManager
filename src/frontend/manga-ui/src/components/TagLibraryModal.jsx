import { useEffect, useMemo, useState } from 'react'
import { Search, X, Pencil, Trash2, GitMerge } from 'lucide-react'
import { fetchTagStats, searchTags } from '../api/work'
import { updateTag, deleteTag, mergeTags, fetchTagCategories } from '../api'

/**
 * 标签库管理弹窗：搜索/分类浏览 + 改名/改中文/改色/改分类 + 合并 + 删除
 * 屏蔽标签按决策"不做管控"，不提供开关入口（IsBlocked 仅随迁移/合并保留）
 */
export default function TagLibraryModal({ onClose, onChanged }) {
  const [stats, setStats] = useState([])
  const [cats, setCats] = useState([])
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('all')
  const [busy, setBusy] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState({})
  const [merging, setMerging] = useState(null)
  const [mergeQuery, setMergeQuery] = useState('')
  const [mergeResults, setMergeResults] = useState([])

  const load = async () => {
    try { setStats(await fetchTagStats()) } catch { }
  }

  useEffect(() => { load(); fetchTagCategories().then(setCats).catch(() => {}) }, [])

  const list = useMemo(() => {
    let arr = stats
    if (category !== 'all') arr = arr.filter(t => t.category === category)
    const kw = query.trim().toLowerCase()
    if (kw) {
      arr = arr.filter(t =>
        (t.name || '').toLowerCase().includes(kw) ||
        (t.nameCn || '').toLowerCase().includes(kw) ||
        (t.namespace || '').toLowerCase().includes(kw))
    }
    return [...arr].sort((a, b) => (b.count || 0) - (a.count || 0)).slice(0, 200)
  }, [stats, query, category])

  useEffect(() => {
    const kw = mergeQuery.trim()
    if (!kw) { setMergeResults([]); return }
    let cancelled = false
    searchTags({ q: kw, limit: 12 })
      .then(r => { if (!cancelled) setMergeResults(r) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [mergeQuery])

  const refresh = async () => { await load(); onChanged?.() }

  const startEdit = (tag) => {
    setEditing(tag)
    setForm({ name: tag.name, nameCn: tag.nameCn || '', color: tag.color || '#6366f1', category: tag.category || 'other' })
  }

  const saveEdit = async () => {
    if (!form.name || !form.name.trim()) return
    setBusy(true)
    try {
      const r = await updateTag(editing.id, {
        name: form.name.trim(),
        nameCn: form.nameCn?.trim() || null,
        color: form.color,
        category: form.category,
      })
      if (!r.success) { alert(r.message || '保存失败'); return }
      setEditing(null)
      await refresh()
    } catch (e) { alert('保存失败: ' + (e.message || e)) }
    finally { setBusy(false) }
  }

  const doMerge = async (target) => {
    if (!window.confirm(`把「${merging.nameCn || merging.name}」合并到「${target.nameCn || target.name}」？\n\n源标签的全部作品关联将搬移到目标，源标签会被删除。`)) return
    setBusy(true)
    try {
      const r = await mergeTags(merging.id, target.id)
      if (!r.success) { alert(r.message || '合并失败'); return }
      setMerging(null); setMergeQuery('')
      await refresh()
    } catch (e) { alert('合并失败: ' + (e.message || e)) }
    finally { setBusy(false) }
  }

  const doDelete = async (tag) => {
    if (!window.confirm(`删除标签「${tag.nameCn || tag.name}」？\n\n所有作品上的该标签关联都会被移除，此操作不可撤销。`)) return
    setBusy(true)
    try {
      const r = await deleteTag(tag.id)
      if (!r.success) { alert(r.message || '删除失败'); return }
      await refresh()
    } catch (e) { alert('删除失败: ' + (e.message || e)) }
    finally { setBusy(false) }
  }

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget && !busy) onClose() }}>
      <div className="modal" onClick={e => e.stopPropagation()}
        style={{ width: 'min(720px, 94vw)', maxHeight: '86vh', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <span style={{ fontWeight: 600 }}>标签库管理 <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>({stats.length})</span></span>
          <button className="btn-sm" onClick={onClose} disabled={busy}>✕</button>
        </div>

        {/* 搜索 + 分类 */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input autoFocus value={query} onChange={e => setQuery(e.target.value)}
              placeholder="搜索标签（原文/中文/命名空间）…"
              style={{ width: '100%', padding: '8px 12px 8px 32px', borderRadius: 8, border: '1px solid var(--border-input)', background: 'var(--surface-high)', color: 'var(--text-primary)', outline: 'none' }} />
          </div>
          <select value={category} onChange={e => setCategory(e.target.value)}
            style={{ padding: '7px 10px', borderRadius: 8, border: '1px solid var(--border-input)', background: 'var(--surface-high)', color: 'var(--text-primary)', outline: 'none' }}>
            <option value="all">全部分类</option>
            {cats.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
          </select>
        </div>

        {/* 列表 */}
        <div style={{ flex: 1, overflowY: 'auto', minHeight: 160 }}>
          {list.length === 0 && (
            <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8rem' }}>无匹配标签</div>
          )}
          {list.map(t => {
            const isEditing = editing?.id === t.id
            return (
              <div key={t.id} style={{ borderBottom: '1px solid var(--divider)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px' }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: t.color || '#6366f1', flexShrink: 0 }} />
                  <span style={{ flex: 1, minWidth: 0, fontSize: '0.8rem', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {t.nameCn ? `${t.nameCn}（${t.name}）` : t.name}
                  </span>
                  <span className="badge badge-muted" style={{ fontSize: '0.62rem', flexShrink: 0 }}>{t.namespace}</span>
                  <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', flexShrink: 0 }}>{t.count} 部</span>
                  {!busy && (
                    <span style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                      <button className="btn-sm" title="编辑" onClick={() => isEditing ? setEditing(null) : startEdit(t)}
                        style={{ padding: '1px 6px', color: 'var(--accent)' }}><Pencil size={12} /></button>
                      <button className="btn-sm" title="合并到其他标签" onClick={() => { setMerging(merging?.id === t.id ? null : t); setMergeQuery('') }}
                        style={{ padding: '1px 6px', color: 'var(--warning)' }}><GitMerge size={12} /></button>
                      <button className="btn-sm" title="删除" onClick={() => doDelete(t)}
                        style={{ padding: '1px 6px', color: 'var(--error)' }}><Trash2 size={12} /></button>
                    </span>
                  )}
                </div>

                {isEditing && (
                  <div style={{ padding: '4px 8px 8px 24px', display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                    <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="原文" style={{ width: 150, padding: '5px 8px', fontSize: '0.72rem', borderRadius: 6, border: '1px solid var(--border-input)', background: 'var(--surface-high)', color: 'var(--text-primary)' }} />
                    <input value={form.nameCn} onChange={e => setForm(f => ({ ...f, nameCn: e.target.value }))} placeholder="中文名（可留空）" style={{ width: 130, padding: '5px 8px', fontSize: '0.72rem', borderRadius: 6, border: '1px solid var(--border-input)', background: 'var(--surface-high)', color: 'var(--text-primary)' }} />
                    <input type="color" value={form.color} onChange={e => setForm(f => ({ ...f, color: e.target.value }))} style={{ width: 34, height: 28, padding: 0, border: 'none', background: 'none', cursor: 'pointer' }} title="颜色" />
                    <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                      style={{ padding: '5px 8px', fontSize: '0.72rem', borderRadius: 6, border: '1px solid var(--border-input)', background: 'var(--surface-high)', color: 'var(--text-primary)' }}>
                      {cats.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
                    </select>
                    <button className="btn-sm" onClick={saveEdit} disabled={busy} style={{ color: 'var(--accent-teal)' }}>保存</button>
                    <button className="btn-sm" onClick={() => setEditing(null)} disabled={busy}>取消</button>
                  </div>
                )}

                {merging?.id === t.id && (
                  <div style={{ padding: '4px 8px 8px 24px' }}>
                    <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginBottom: 4 }}>
                      选择要合并到的目标标签（源「{t.nameCn || t.name}」的关联将全部搬移过去）
                    </div>
                    <div style={{ position: 'relative' }}>
                      <Search size={12} style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                      <input autoFocus value={mergeQuery} onChange={e => setMergeQuery(e.target.value)}
                        placeholder="搜索目标标签…"
                        style={{ width: '100%', padding: '6px 10px 6px 26px', fontSize: '0.72rem', borderRadius: 6, border: '1px solid var(--border-input)', background: 'var(--surface-high)', color: 'var(--text-primary)', outline: 'none' }} />
                    </div>
                    {mergeResults.length > 0 && (
                      <div style={{ marginTop: 4, maxHeight: 140, overflowY: 'auto', border: '1px solid var(--border-subtle)', borderRadius: 6 }}>
                        {mergeResults.filter(x => x.id !== t.id).map(x => (
                          <div key={x.id} onMouseDown={e => { e.preventDefault(); doMerge(x) }}
                            style={{ padding: '5px 10px', cursor: 'pointer', fontSize: '0.72rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 6 }}
                            onMouseEnter={e => { e.currentTarget.style.background = 'var(--hover-bg)' }} onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}>
                            <span style={{ width: 6, height: 6, borderRadius: '50%', background: x.color || '#6366f1' }} />
                            <span>{x.nameCn ? `${x.nameCn}（${x.name}）` : x.name}</span>
                            <span style={{ marginLeft: 'auto', fontSize: '0.62rem', color: 'var(--text-muted)' }}>{x.count ?? ''} {x.namespace}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    <div style={{ marginTop: 4 }}>
                      <button className="btn-sm" onClick={() => setMerging(null)} style={{ color: 'var(--text-muted)' }}>取消合并</button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {busy && <div style={{ padding: 6, textAlign: 'center', fontSize: '0.7rem', color: 'var(--text-muted)' }}>处理中…</div>}
        <div style={{ paddingTop: 8, fontSize: '0.68rem', color: 'var(--text-muted)' }}>
          提示：改名/合并一次生效于全部作品；屏蔽标签按既定决策不在此管理。
        </div>
      </div>
    </div>
  )
}
