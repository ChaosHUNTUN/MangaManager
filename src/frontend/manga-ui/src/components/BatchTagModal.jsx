import { useEffect, useMemo, useState } from 'react'
import { Search, Plus, Minus } from 'lucide-react'
import { searchTags, batchAddWorkTags, batchRemoveWorkTags } from '../api/work'

/**
 * 批量标签弹窗：给选中的多部作品统一添加/移除标签
 * 搜索优先（原文/中文/命名空间），选择集 chips 展示，确认后批量执行（幂等）
 */
export default function BatchTagModal({ workIds, onClose, onDone }) {
  const [mode, setMode] = useState('add')        // 'add' | 'remove'
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [picked, setPicked] = useState([])       // 已选标签（id → tag）
  const [busy, setBusy] = useState(false)

  const pickedMap = useMemo(() => new Map(picked.map(t => [t.id, t])), [picked])

  useEffect(() => {
    const kw = query.trim()
    if (!kw) { setResults([]); return }
    let cancelled = false
    searchTags({ q: kw, limit: 20 })
      .then(r => { if (!cancelled) setResults(r) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [query])

  const toggle = (tag) => {
    setPicked(prev => pickedMap.has(tag.id)
      ? prev.filter(t => t.id !== tag.id)
      : [...prev, tag])
  }

  const apply = async () => {
    if (picked.length === 0 || busy) return
    setBusy(true)
    try {
      const ids = picked.map(t => t.id)
      const r = mode === 'add'
        ? await batchAddWorkTags(workIds, ids)
        : await batchRemoveWorkTags(workIds, ids)
      if (!r.success) { alert(r.message || '操作失败'); return }
      onDone?.(mode === 'add' ? r.data?.added : r.data?.removed, mode)
      onClose()
    } catch (e) { alert('操作失败: ' + (e.message || e)) }
    finally { setBusy(false) }
  }

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget && !busy) onClose() }}>
      <div className="modal" onClick={e => e.stopPropagation()}
        style={{ width: 'min(520px, 94vw)', maxHeight: '82vh', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <span style={{ fontWeight: 600 }}>批量{workIds.length} 部作品 · {mode === 'add' ? '添加标签' : '移除标签'}</span>
          <button className="btn-sm" onClick={onClose} disabled={busy}>✕</button>
        </div>

        {/* 模式切换 */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
          <button className="btn-sm" onClick={() => { setMode('add'); setPicked([]) }}
            style={{ borderColor: mode === 'add' ? 'var(--accent-border)' : 'var(--border-input)', color: mode === 'add' ? 'var(--accent)' : 'var(--text-secondary)' }}>
            <Plus size={13} /> 添加
          </button>
          <button className="btn-sm" onClick={() => { setMode('remove'); setPicked([]) }}
            style={{ borderColor: mode === 'remove' ? 'var(--error)' : 'var(--border-input)', color: mode === 'remove' ? 'var(--error)' : 'var(--text-secondary)' }}>
            <Minus size={13} /> 移除
          </button>
        </div>

        {/* 搜索 */}
        <div style={{ position: 'relative', marginBottom: 8 }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input autoFocus value={query} onChange={e => setQuery(e.target.value)}
            placeholder="搜索标签（原文/中文/命名空间）…"
            style={{ width: '100%', padding: '8px 12px 8px 32px', borderRadius: 8, border: '1px solid var(--border-input)', background: 'var(--surface-high)', color: 'var(--text-primary)', outline: 'none' }} />
        </div>

        {/* 已选 */}
        {picked.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 8 }}>
            {picked.map(t => (
              <span key={t.id} title={`${t.namespace}:${t.name}`}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 999, fontSize: '0.72rem', background: 'var(--accent-bg)', border: '1px solid var(--accent-border)', color: 'var(--text-secondary)' }}>
                {t.nameCn || t.name}
                <span onClick={() => !busy && toggle(t)} style={{ cursor: 'pointer', opacity: 0.6 }}>✕</span>
              </span>
            ))}
          </div>
        )}

        {/* 搜索结果 */}
        <div style={{ flex: 1, overflowY: 'auto', minHeight: 120 }}>
          {query.trim() && results.length === 0 && (
            <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8rem' }}>无匹配标签</div>
          )}
          {results.map(t => {
            const on = pickedMap.has(t.id)
            return (
              <div key={t.id} onClick={() => !busy && toggle(t)}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', borderRadius: 8, cursor: 'pointer', background: on ? 'var(--accent-bg)' : 'transparent', border: on ? '1px solid var(--accent-border)' : '1px solid transparent' }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: t.color || '#6366f1', flexShrink: 0 }} />
                <span style={{ flex: 1, minWidth: 0, fontSize: '0.8rem', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {t.nameCn ? `${t.nameCn}（${t.name}）` : t.name}
                </span>
                <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', flexShrink: 0 }}>{t.count ?? ''} {t.namespace}</span>
              </div>
            )
          })}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, paddingTop: 10 }}>
          <button className="btn-sm" onClick={onClose} disabled={busy}>取消</button>
          <button className="btn-sm" onClick={apply} disabled={busy || picked.length === 0}
            style={{ borderColor: mode === 'remove' ? 'var(--error)' : 'var(--accent-border)', color: mode === 'remove' ? 'var(--error)' : 'var(--accent)' }}>
            {busy ? '处理中…' : `${mode === 'add' ? '添加' : '移除'} ${picked.length} 个标签`}
          </button>
        </div>
      </div>
    </div>
  )
}
