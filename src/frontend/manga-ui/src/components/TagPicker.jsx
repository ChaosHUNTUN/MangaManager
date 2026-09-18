import { useEffect, useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import { fetchWorkTags, addWorkTags, removeWorkTag, searchTags, fetchTagStats, createTag } from '../api/work'

const CATEGORY_LABELS = {
  author: '作者', translator: '汉化组', style: '画风', female: '女角',
  male: '男角', source: '来源', language: '语言', other: '其他', album: '专辑',
}

const RECENT_KEY = 'mm-recent-tags'
const MAX_RECENT = 12

function useDebounced(value, delay = 250) {
  const [v, setV] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setV(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])
  return v
}

function Highlight({ text, q }) {
  const kw = (q || '').trim()
  if (!kw || !text) return text
  const idx = text.toLowerCase().indexOf(kw.toLowerCase())
  if (idx === -1) return text
  return (
    <>
      {text.slice(0, idx)}
      <mark style={{ background: 'var(--accent-bg)', color: 'var(--accent)', borderRadius: 3, padding: '0 1px' }}>
        {text.slice(idx, idx + kw.length)}
      </mark>
      {text.slice(idx + kw.length)}
    </>
  )
}

/**
 * 标签选择器：搜索优先 + 分类浏览 + 常用排序 + 已选 chips + 无结果可新建
 */
export default function TagPicker({ gid, onClose }) {
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('all')
  const [stats, setStats] = useState([])
  const [searchResults, setSearchResults] = useState(null)
  const [current, setCurrent] = useState([])
  const [recents, setRecents] = useState([])
  const [busy, setBusy] = useState(false)
  const debouncedQuery = useDebounced(query)

  const currentIds = useMemo(() => new Set(current.map(t => t.id)), [current])

  const loadCurrent = async () => { try { setCurrent(await fetchWorkTags(gid)) } catch { } }
  const loadStats = async () => { try { setStats(await fetchTagStats()) } catch { } }

  useEffect(() => { loadCurrent(); loadStats() }, [gid])

  useEffect(() => {
    try {
      const raw = localStorage.getItem(RECENT_KEY)
      setRecents(raw ? JSON.parse(raw) : [])
    } catch { }
  }, [])

  useEffect(() => {
    const kw = debouncedQuery.trim()
    if (!kw) { setSearchResults(null); return }
    let cancelled = false
    searchTags({ q: kw, category: category === 'all' ? undefined : category })
      .then(r => { if (!cancelled) setSearchResults(r) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [debouncedQuery, category])

  const remember = (tag) => {
    setRecents(prev => {
      const next = [tag, ...prev.filter(t => t.id !== tag.id)].slice(0, MAX_RECENT)
      try { localStorage.setItem(RECENT_KEY, JSON.stringify(next)) } catch { }
      return next
    })
  }

  const categories = useMemo(() => {
    const order = ['author', 'translator', 'style', 'female', 'male', 'source', 'language', 'other', 'album']
    const map = new Map()
    for (const t of stats) {
      if (!map.has(t.category)) map.set(t.category, { count: 0 })
      map.get(t.category).count += t.count
    }
    return [...map.entries()]
      .sort((a, b) => {
        const ia = order.indexOf(a[0]), ib = order.indexOf(b[0])
        return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib)
      })
      .map(([key, v]) => ({ key, label: CATEGORY_LABELS[key] || key, count: v.count }))
  }, [stats])

  // 浏览列表：无搜索时按分类取使用次数最多的标签；"全部"视图每分类均衡取 top，避免大类淹没小类
  const browseList = useMemo(() => {
    if (searchResults) return searchResults
    const pool = stats.filter(t => category === 'all' || t.category === category)
    if (category !== 'all') return [...pool].sort((a, b) => b.count - a.count).slice(0, 120)
    const per = new Map()
    for (const t of pool) {
      const arr = per.get(t.category)
      if (!arr) per.set(t.category, [t])
      else if (arr.length < 15) arr.push(t)
    }
    return [...per.values()].flat()
  }, [searchResults, stats, category])

  const toggle = async (tag) => {
    setBusy(true)
    try {
      const removing = currentIds.has(tag.id)
      if (removing) await removeWorkTag(gid, tag.id)
      else { await addWorkTags(gid, [tag.id]); remember(tag) }
      await loadCurrent()
    } catch { }
    setBusy(false)
  }

  const handleCreate = async () => {
    const name = query.trim()
    if (!name || busy) return
    setBusy(true)
    try {
      const r = await createTag({ name })
      if (r.success && r.data?.id) {
        await addWorkTags(gid, [r.data.id])
        remember(r.data)
      }
      setQuery('')
      await loadCurrent()
      await loadStats()
    } catch { }
    setBusy(false)
  }

  const showCreate = query.trim() && searchResults && searchResults.length === 0 && !currentIds.has(query.trim())

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal" onClick={e => e.stopPropagation()}
        style={{ width: 'min(560px, 94vw)', maxHeight: '82vh', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <span style={{ fontWeight: 600 }}>添加标签</span>
          <button className="btn-sm" onClick={onClose}>✕</button>
        </div>

        {/* 搜索 */}
        <div style={{ position: 'relative', marginBottom: 10 }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input autoFocus value={query} onChange={e => setQuery(e.target.value)}
            placeholder="搜索标签（原文/中文/命名空间）…"
            style={{ width: '100%', padding: '8px 12px 8px 32px', borderRadius: 8, border: '1px solid var(--border-input)', background: 'var(--surface-high)', color: 'var(--text-primary)', outline: 'none' }} />
        </div>

        {/* 分类 tabs */}
        {!query.trim() && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
            <button className="btn-sm" onClick={() => setCategory('all')}
              style={{ borderColor: category === 'all' ? 'var(--accent-border)' : 'var(--border-input)', color: category === 'all' ? 'var(--accent)' : 'var(--text-secondary)' }}>全部</button>
            {categories.map(c => (
              <button key={c.key} className="btn-sm" onClick={() => setCategory(c.key)}
                style={{ borderColor: category === c.key ? 'var(--accent-border)' : 'var(--border-input)', color: category === c.key ? 'var(--accent)' : 'var(--text-secondary)' }}>
                {c.label} {c.count}
              </button>
            ))}
          </div>
        )}

        {/* 最近使用 */}
        {!query.trim() && recents.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 8, alignItems: 'center' }}>
            <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', flexShrink: 0 }}>最近</span>
            {recents.map(t => {
              const on = currentIds.has(t.id)
              return (
                <button key={t.id} onClick={() => !busy && toggle(t)}
                  title={`${t.namespace}:${t.name}`}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 999, fontSize: '0.72rem', cursor: 'pointer', background: on ? 'var(--accent-bg)' : 'var(--surface-elevated)', border: `1px solid ${on ? 'var(--accent-border)' : 'var(--border-input)'}`, color: on ? 'var(--accent)' : 'var(--text-secondary)' }}>
                  {t.nameCn || t.name}
                </button>
              )
            })}
          </div>
        )}

        {/* 已选 */}
        {current.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 8 }}>
            {current.map(t => (
              <span key={t.id} title={`${t.namespace}:${t.name}`}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 999, fontSize: '0.72rem', background: 'var(--accent-bg)', border: '1px solid var(--accent-border)', color: 'var(--text-secondary)' }}>
                {t.nameCn || t.name}
                <span onClick={() => !busy && toggle(t)} style={{ cursor: 'pointer', opacity: 0.6 }}>✕</span>
              </span>
            ))}
          </div>
        )}

        {/* 列表 */}
        <div style={{ flex: 1, overflowY: 'auto', minHeight: 120 }}>
          {browseList.length === 0 && !showCreate && (
            <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8rem' }}>无匹配标签</div>
          )}
          {browseList.map(t => {
            const on = currentIds.has(t.id)
            return (
              <div key={t.id} onClick={() => !busy && toggle(t)}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', borderRadius: 8, cursor: 'pointer', background: on ? 'var(--accent-bg)' : 'transparent', border: on ? '1px solid var(--accent-border)' : '1px solid transparent' }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: t.color || '#6366f1', flexShrink: 0 }} />
                <span style={{ fontSize: '0.8rem', color: 'var(--text-primary)', fontWeight: on ? 600 : 400, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {t.nameCn
                    ? <><Highlight text={t.nameCn} q={query} />（<Highlight text={t.name} q={query} />）</>
                    : <Highlight text={t.name} q={query} />}
                </span>
                <span style={{ marginLeft: 'auto', fontSize: '0.68rem', color: 'var(--text-muted)', flexShrink: 0 }}>
                  {t.count ?? ''} {t.namespace}
                </span>
              </div>
            )
          })}
          {showCreate && (
            <div onClick={() => !busy && handleCreate()}
              style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', borderRadius: 8, cursor: 'pointer', background: 'var(--success-bg)', border: '1px solid var(--success-border)', marginTop: 6 }}>
              <span style={{ fontSize: '0.8rem', color: 'var(--success)' }}>+ 创建标签「{query.trim()}」并添加</span>
            </div>
          )}
        </div>

        {busy && <div style={{ padding: 6, textAlign: 'center', fontSize: '0.7rem', color: 'var(--text-muted)' }}>处理中…</div>}
      </div>
    </div>
  )
}
