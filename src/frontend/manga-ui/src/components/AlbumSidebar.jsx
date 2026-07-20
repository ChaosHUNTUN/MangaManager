import { useState, useRef, useEffect, useMemo } from 'react'
import ScrollToTop from './ScrollToTop'

/**
 * 专辑侧边栏组件 — 极简风格
 * 所有色彩使用 tokens.css 中定义的 CSS 变量
 */
export default function AlbumSidebar({
  sidebarOpen, pinned, groups, activeGroup, albumConfig, dragGid,
  albumSearch, albumSort,
  onSelectGroup, onCreateAlbum, onEditAlbum, onDeleteAlbum,
  onConvertToAlbum, onAlbumSearchChange, onAlbumSortChange,
  onMouseEnter, onMouseLeave, onDragOver, onClose, onTogglePin
}) {
  const [creating, setCreating] = useState(false)
  const [createValue, setCreateValue] = useState('')
  const createRef = useRef(null)
  const searchRef = useRef(null)
  const [collapsedSections, setCollapsedSections] = useState({})
  const [hideEmptyAlbums, setHideEmptyAlbums] = useState(true)
  const sidebarScrollRef = useRef(null)

  const toggleSection = (section) => setCollapsedSections(prev => ({ ...prev, [section]: !prev[section] }))

  useEffect(() => { if (creating) createRef.current?.focus() }, [creating])

  const startCreate = () => { setCreating(true); setCreateValue('') }
  const commitCreate = () => {
    const trimmed = createValue.trim()
    if (trimmed) onCreateAlbum?.(trimmed)
    setCreating(false); setCreateValue('')
  }

  const sortOptions = [
    { value: 'default', label: '默认' },
    { value: 'name-asc', label: '名称 ↑' }, { value: 'name-desc', label: '名称 ↓' },
    { value: 'count-asc', label: '数量 ↑' }, { value: 'count-desc', label: '数量 ↓' },
    { value: 'time-asc', label: '时间 ↑' }, { value: 'time-desc', label: '时间 ↓' },
  ]

  const albumGroups = groups.filter(g => g.type === 'album')
  const autoGroups = groups.filter(g => g.type !== 'album')

  const albumSections = useMemo(() => {
    const sections = { artist: [], group: [], other: [] }
    albumGroups.forEach(g => {
      const realKey = g.key.slice(6)
      const keyTag = albumConfig[realKey]?.keyTag || ''
      const colonIdx = keyTag.indexOf(':')
      const ns = colonIdx > 0 ? keyTag.slice(0, colonIdx) : 'other'
      if (sections[ns]) sections[ns].push(g)
      else sections.other.push(g)
    })
    if (hideEmptyAlbums) {
      for (const ns of Object.keys(sections)) {
        sections[ns] = sections[ns].filter(g => g.count > 0)
      }
    }
    return sections
  }, [albumGroups, albumConfig, hideEmptyAlbums])

  const s = (v) => `var(--${v})` // CSS variable shorthand

  const renderAlbumItem = (grp) => {
    const isActive = activeGroup === grp.key
    const isDropTarget = dragGid != null
    const realKey = grp.key.slice(6)
    return (
      <div key={grp.key} style={{ padding: '0 var(--space-2)' }} className="album-sidebar-row">
        <div onClick={() => onSelectGroup?.(grp.key)}
          data-drop-zone={realKey}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '5px 8px', borderRadius: 'var(--radius-sm)', cursor: 'pointer',
            background: isActive ? 'var(--accent-bg)' : 'transparent',
            border: `1px solid ${isActive ? 'var(--accent-border)' : isDropTarget ? 'rgba(200,160,76,0.25)' : 'transparent'}`,
            transition: 'all var(--duration-instant) var(--ease-out)', marginBottom: 1, outline: 'none'
          }}
          onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'var(--hover-bg)' }}
          onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent' }}>
          <span style={{
            fontSize: 'var(--text-xs)', color: isActive ? 'var(--accent)' : 'var(--text-primary)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            flex: 1, display: 'flex', alignItems: 'center', gap: 4
          }}>
            <span style={{
              flexShrink: 0, width: 7, height: 7, borderRadius: '50%',
              background: albumConfig[realKey]?.color || 'var(--accent)',
              display: 'inline-block'
            }} />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{grp.name}</span>
          </span>
          <span style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-muted)', marginLeft: 4, fontFamily: 'var(--font-mono)' }}>{grp.count}</span>
          <span className="album-actions" style={{ display: 'none', gap: 1, marginLeft: 2, alignItems: 'center' }}>
            <button className="btn-sm" onClick={e => { e.stopPropagation(); onEditAlbum?.(realKey) }}
              style={{ padding: '1px 3px', fontSize: 'var(--text-3xs)', borderColor: 'transparent', color: 'var(--text-secondary)', background: 'transparent', cursor: 'pointer' }}
              title="编辑">✎</button>
            <button className="btn-sm" onClick={e => {
              e.stopPropagation(); if (confirm(`删除专辑 "${grp.name}"？`)) onDeleteAlbum?.(realKey)
            }}
              style={{ padding: '1px 3px', fontSize: 'var(--text-3xs)', borderColor: 'transparent', color: 'var(--error)', background: 'transparent', cursor: 'pointer' }}
              title="删除">✕</button>
          </span>
        </div>
      </div>
    )
  }

  const renderSection = (title, ns, icon) => {
    const items = albumSections[ns] || []
    if (items.length === 0) return null
    const collapsed = collapsedSections[ns]
    const totalCount = items.reduce((s, g) => s + g.count, 0)
    return (
      <div key={ns} style={{ marginBottom: 0 }}>
        <div onClick={() => toggleSection(ns)}
          style={{
            display: 'flex', alignItems: 'center', padding: '5px var(--space-3)',
            fontSize: 'var(--text-2xs)', fontWeight: 'var(--weight-semibold)',
            color: 'var(--text-secondary)', cursor: 'pointer', userSelect: 'none', gap: 3,
            borderBottom: '1px solid var(--divider)'
          }}>
          <span style={{ fontSize: 'var(--text-3xs)', transition: 'transform var(--duration-instant) var(--ease-out)', transform: collapsed ? 'rotate(-90deg)' : 'rotate(0)' }}>▼</span>
          <span>{icon} {title}</span>
          <span style={{ marginLeft: 'auto', fontSize: 'var(--text-3xs)', color: 'var(--text-muted)' }}>{items.length}组 · {totalCount}部</span>
        </div>
        {!collapsed && items.map(renderAlbumItem)}
      </div>
    )
  }

  const totalAlbums = Object.values(albumSections).flat().length

  const sidebarContent = (
    <div ref={sidebarScrollRef} style={{ padding: 'var(--space-2) 0 var(--space-3)', height: '100%', overflowY: 'auto', display: 'flex', flexDirection: 'column', position: 'relative' }}>
      {/* 标题行 */}
      <div style={{
        padding: '0 var(--space-3) var(--space-2)', fontSize: 'var(--text-sm)', fontWeight: 'var(--weight-semibold)',
        color: 'var(--text-secondary)', borderBottom: '1px solid var(--divider)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between'
      }}>
        <span>📁 专辑 ({totalAlbums})</span>
        <div style={{ display: 'flex', gap: 3 }}>
          <button className="btn-sm" onClick={onTogglePin}
            style={{ padding: '1px 4px', fontSize: 'var(--text-3xs)', borderColor: pinned ? 'rgba(200,160,76,0.3)' : 'var(--border-input)', color: pinned ? 'var(--warning)' : 'var(--text-muted)' }}
            title={pinned ? '取消固定' : '固定侧边栏'}>{pinned ? '📌' : '📍'}</button>
          {creating ? (
            <input ref={createRef} value={createValue} onChange={e => setCreateValue(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') commitCreate(); if (e.key === 'Escape') setCreating(false) }}
              onBlur={commitCreate} placeholder="名称..."
              style={{ width: 60, fontSize: 'var(--text-3xs)', padding: '1px 4px', background: 'var(--surface-high)', border: '1px solid var(--accent-border)', borderRadius: 'var(--radius-xs)', color: 'var(--text-primary)', outline: 'none', boxSizing: 'border-box' }} />
          ) : (
            <button className="btn-sm" onClick={startCreate}
              style={{ padding: '1px 4px', fontSize: 'var(--text-3xs)', borderColor: 'rgba(107,139,107,0.4)', color: 'var(--success)' }}>+</button>
          )}
        </div>
      </div>

      {/* 搜索 + 排序 */}
      <div style={{ padding: '4px var(--space-2)', display: 'flex', gap: 3, borderBottom: '1px solid var(--divider)' }}>
        <div style={{ flex: 1, position: 'relative' }}>
          <input ref={searchRef} value={albumSearch} onChange={e => onAlbumSearchChange?.(e.target.value)}
            placeholder="筛选..."
            style={{ width: '100%', fontSize: 'var(--text-2xs)', padding: '2px 5px', background: 'var(--surface)', border: '1px solid var(--border-input)', borderRadius: 'var(--radius-xs)', color: 'var(--text-primary)', outline: 'none', boxSizing: 'border-box' }} />
          {albumSearch && (
            <button onClick={() => onAlbumSearchChange?.('')}
              style={{ position: 'absolute', right: 2, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 'var(--text-3xs)', padding: '1px 3px' }}>✕</button>
          )}
        </div>
        <select value={albumSort} onChange={e => onAlbumSortChange?.(e.target.value)}
          style={{ width: 56, fontSize: 'var(--text-3xs)', padding: '1px 2px', background: 'var(--surface)', border: '1px solid var(--border-input)', borderRadius: 'var(--radius-xs)', color: 'var(--text-secondary)', outline: 'none', cursor: 'pointer' }}>
          {sortOptions.map(o => (<option key={o.value} value={o.value}>{o.label}</option>))}
        </select>
      </div>

      {/* 隐藏空专辑 */}
      <div style={{ padding: '2px var(--space-2)', display: 'flex', justifyContent: 'flex-end' }}>
        <label style={{ fontSize: 'var(--text-3xs)', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3 }}>
          <input type="checkbox" checked={hideEmptyAlbums} onChange={e => setHideEmptyAlbums(e.target.checked)} style={{ cursor: 'pointer' }} />隐藏空专辑
        </label>
      </div>

      {totalAlbums === 0 && (
        <div style={{ padding: 'var(--space-2) var(--space-3)', fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
          {albumSearch ? '无匹配专辑' : '暂无专辑'}
        </div>
      )}

      {renderSection('画师专辑', 'artist', '👤')}
      {renderSection('社团专辑', 'group', '👥')}
      {renderSection('其他合集', 'other', '📦')}

      {/* 回到顶部 */}
      <ScrollToTop containerRef={sidebarScrollRef} threshold={300} />

      {/* 自动分组 */}
      {autoGroups.length > 0 && (
        <>
          <div style={{
            padding: '0 var(--space-3) var(--space-1)', marginTop: 'var(--space-2)', fontSize: 'var(--text-2xs)',
            fontWeight: 'var(--weight-semibold)', color: 'var(--text-muted)', borderBottom: '1px solid var(--divider)', marginBottom: 2
          }}>自动分组 ({autoGroups.length})</div>
          {autoGroups.map(grp => (
            <div key={grp.key} style={{ padding: '0 var(--space-3)' }}>
              <div onClick={() => onSelectGroup?.(grp.key)}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '4px 5px', borderRadius: 'var(--radius-xs)', cursor: 'pointer',
                  background: activeGroup === grp.key ? 'var(--accent-bg)' : 'transparent',
                  marginBottom: 0
                }}>
                <span style={{
                  fontSize: 'var(--text-xs)', color: activeGroup === grp.key ? 'var(--accent)' : 'var(--text-secondary)',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1
                }}>
                  {grp.type === 'artist' ? '👤' : grp.type === 'group' ? '👥' : grp.type === 'multi' ? '👥👤' : '📦'} {grp.name}
                </span>
                <span style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-muted)', marginLeft: 4 }}>{grp.count}</span>
                <button className="btn-sm" onClick={e => { e.stopPropagation(); onConvertToAlbum?.(grp) }}
                  style={{ padding: '1px 3px', fontSize: 'var(--text-3xs)', borderColor: 'var(--accent-border)', color: 'var(--accent)', background: 'transparent', marginLeft: 2 }}
                  title="转为专辑">+</button>
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  )

  const effectiveOpen = sidebarOpen || pinned

  return (
    <div style={{ position: 'relative', flexShrink: 0 }}>
      <div
        onMouseEnter={pinned ? undefined : onMouseEnter}
        onMouseLeave={pinned ? undefined : onMouseLeave}
        onDragOver={onDragOver}
        style={{
          position: 'fixed', top: 0, left: 0,
          width: effectiveOpen ? 'var(--sidebar-width)' : 'var(--sidebar-collapsed-hotzone)',
          height: '100vh', zIndex: 50,
          transition: 'width var(--duration-normal) var(--ease-out)'
        }}>
        <div style={{
          position: 'absolute', top: 0, left: 0, width: 'var(--sidebar-width)', height: '100%',
          background: 'var(--surface)', borderRight: '1px solid var(--divider)',
          transform: effectiveOpen ? 'translateX(0)' : 'translateX(calc(-1 * var(--sidebar-width) + var(--sidebar-collapsed-hotzone)))',
          transition: 'transform var(--duration-normal) var(--ease-out)',
        }}>
          {/* 侧边栏顶部 — 画廊管理 */}
          <div style={{
            padding: 'var(--space-2) var(--space-3)', fontSize: 'var(--text-xs)', color: 'var(--text-muted)',
            borderBottom: '1px solid var(--divider)', display: 'flex', justifyContent: 'space-between'
          }}>
            <span>📚 画廊管理</span>
            <div style={{ display: 'flex', gap: 3 }}>
              <button className="btn-sm" onClick={onTogglePin}
                style={{ padding: '1px 3px', fontSize: 'var(--text-3xs)', borderColor: pinned ? 'rgba(200,160,76,0.3)' : 'var(--border-input)', color: pinned ? 'var(--warning)' : 'var(--text-muted)' }}
                title={pinned ? '取消固定' : '固定'}>{pinned ? '📌' : '📍'}</button>
              {!pinned && (
                <button className="btn-sm" onClick={onClose}
                  style={{ padding: '1px 5px', fontSize: 'var(--text-3xs)', borderColor: 'var(--border-input)', color: 'var(--text-secondary)' }}>收起</button>
              )}
            </div>
          </div>
          {sidebarContent}
        </div>

        {/* 折叠态标签 */}
        {!effectiveOpen && (
          <div style={{
            position: 'absolute', left: 0, top: '50%', transform: 'translateY(-50%)',
            writingMode: 'vertical-rl', background: 'var(--surface-high)',
            color: 'var(--text-dim)', padding: '6px 3px', borderRadius: '0 var(--radius-sm) var(--radius-sm) 0',
            fontSize: 'var(--text-3xs)', cursor: 'pointer', letterSpacing: 1.5,
            border: '1px solid var(--border-subtle)', borderLeft: 'none'
          }}>
            专辑
          </div>
        )}
      </div>
    </div>
  )
}