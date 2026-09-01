import { useMemo, useState } from 'react'

const CATEGORY_META = [
  { key: 'author', label: '作者' },
  { key: 'translator', label: '汉化组' },
  { key: 'style', label: '画风' },
  { key: 'female', label: '女角' },
  { key: 'male', label: '男角' },
  { key: 'source', label: '来源' },
  { key: 'language', label: '语言' },
  { key: 'other', label: '其他' },
  { key: 'album', label: '专辑' },
]

/**
 * 侧边栏标签云：按分类分区展示标签（含作品数），点击切换筛选
 */
export default function TagCloud({ tagStats = [], activeTagIds = [], onToggleTag }) {
  const [expanded, setExpanded] = useState({})

  const byCat = useMemo(() => {
    const map = {}
    for (const t of tagStats) {
      if (!map[t.category]) map[t.category] = []
      map[t.category].push(t)
    }
    for (const k of Object.keys(map)) map[k].sort((a, b) => b.count - a.count)
    return map
  }, [tagStats])

  const activeSet = useMemo(() => new Set(activeTagIds), [activeTagIds])

  return (
    <div style={{ borderBottom: '1px solid var(--divider)', paddingBottom: 4 }}>
      <div style={{ padding: 'var(--space-2) var(--space-3)', fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
        标签筛选{activeTagIds.length > 0 && <span style={{ color: 'var(--accent)', fontWeight: 600 }}> ({activeTagIds.length})</span>}
      </div>
      {CATEGORY_META.map(({ key, label }) => {
        const list = byCat[key] || []
        if (list.length === 0) return null
        const isExp = expanded[key]
        const shown = isExp ? list : list.slice(0, 20)
        const activeInCat = list.filter(t => activeSet.has(t.id)).length
        return (
          <div key={key}>
            <div onClick={() => setExpanded(e => ({ ...e, [key]: !isExp }))}
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px var(--space-3)', cursor: 'pointer', fontSize: 'var(--text-2xs)', color: 'var(--text-secondary)', userSelect: 'none' }}>
              <span>{label}{activeInCat > 0 && <span style={{ color: 'var(--accent)' }}> ({activeInCat})</span>}</span>
              <span style={{ opacity: 0.5 }}>{list.length > 20 ? (isExp ? '▴' : `▾ ${list.length}`) : list.length}</span>
            </div>
            <div style={{ padding: '0 var(--space-2) 4px' }}>
              {shown.map(t => {
                const on = activeSet.has(t.id)
                return (
                  <div key={t.id} onClick={() => onToggleTag?.(t.id)} title={`${t.namespace}:${t.name}`}
                    style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 8px', borderRadius: 'var(--radius-xs)', cursor: 'pointer', fontSize: 'var(--text-2xs)', color: on ? 'var(--accent)' : 'var(--text-secondary)', background: on ? 'var(--accent-bg)' : 'transparent' }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: t.color || '#6366f1', flexShrink: 0 }} />
                    <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.nameCn || t.name}</span>
                    {t.hasOrder && <span title="已自定义顺序" style={{ fontSize: '0.58rem', color: 'var(--accent)', flexShrink: 0 }}>▤</span>}
                    <span style={{ opacity: 0.5, fontSize: '0.62rem', flexShrink: 0 }}>{t.count}</span>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}
