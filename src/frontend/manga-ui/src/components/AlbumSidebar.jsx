import { useState, useRef, useEffect, useMemo } from 'react'

/**
 * 专辑侧边栏组件
 * - 悬停展开 / 固定展开 (pinned)
 * - 专辑按 KeyTag 命名空间折叠分组 (artist / group / other)
 * - 隐藏空专辑开关
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

  const toggleSection = (section) => setCollapsedSections(prev => ({ ...prev, [section]: !prev[section] }))

  useEffect(() => {
    if (creating) createRef.current?.focus()
  }, [creating])

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

  // 按 KeyTag namespace 分组专辑
  const albumSections = useMemo(() => {
    const sections = { artist: [], group: [], other: [] }
    albumGroups.forEach(g => {
      const realKey = g.key.slice(6) // remove "album:" prefix
      const keyTag = albumConfig[realKey]?.keyTag || ''
      const colonIdx = keyTag.indexOf(':')
      const ns = colonIdx > 0 ? keyTag.slice(0, colonIdx) : 'other'
      if (sections[ns]) sections[ns].push(g)
      else sections.other.push(g)
    })
    // 应用 hiding 逻辑
    if (hideEmptyAlbums) {
      for (const ns of Object.keys(sections)) {
        sections[ns] = sections[ns].filter(g => g.count > 0)
      }
    }
    return sections
  }, [albumGroups, albumConfig, hideEmptyAlbums])
  
  const renderAlbumItem = (grp) => {
    const isActive = activeGroup === grp.key
    const isDropTarget = dragGid != null
    const realKey = grp.key.slice(6)
    return (
      <div key={grp.key} style={{ padding: '0 8px' }} className="album-sidebar-row">
        <div onClick={() => onSelectGroup?.(grp.key)}
          data-drop-zone={realKey}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '7px 10px', borderRadius: 6, cursor: 'pointer', background: isActive ? '#7c3aed15' : 'transparent', border: `1px solid ${isActive ? '#7c3aed40' : isDropTarget ? '#f59e0b40' : 'transparent'}`, transition: 'all 0.15s', marginBottom: 2, outline: 'none' }}>
          <span style={{ fontSize: '0.78rem', color: isActive ? '#a78bfa' : '#ccc', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ flexShrink: 0, width: 8, height: 8, borderRadius: '50%', background: albumConfig[realKey]?.color || '#7c3aed', display: 'inline-block' }} />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{grp.name}</span>
          </span>
          <span style={{ fontSize: '0.65rem', color: '#666', marginLeft: 6 }}>{grp.count}</span>
          <span className="album-actions" style={{ display: 'none', gap: 2, marginLeft: 4, alignItems: 'center' }}>
            <button className="btn-sm" onClick={e => { e.stopPropagation(); onEditAlbum?.(realKey) }} style={{ padding: '2px 4px', fontSize: '0.65rem', borderColor: 'transparent', color: '#888', background: 'transparent', cursor: 'pointer' }} title="编辑专辑">✎</button>
            <button className="btn-sm" onClick={e => { e.stopPropagation(); if (confirm(`删除专辑 "${grp.name}"？画廊将回到自动分组。`)) onDeleteAlbum?.(realKey) }} style={{ padding: '2px 4px', fontSize: '0.65rem', borderColor: 'transparent', color: '#fca5a5', background: 'transparent', cursor: 'pointer' }} title="删除">✕</button>
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
      <div key={ns} style={{ marginBottom: 2 }}>
        <div onClick={() => toggleSection(ns)}
          style={{ display: 'flex', alignItems: 'center', padding: '6px 12px', fontSize: '0.7rem', fontWeight: 600, color: '#888', cursor: 'pointer', userSelect: 'none', gap: 4, borderBottom: '1px solid #1e1e3a30' }}>
          <span style={{ fontSize: '0.65rem', transition: 'transform 0.15s', transform: collapsed ? 'rotate(-90deg)' : 'rotate(0)' }}>▼</span>
          <span>{icon} {title}</span>
          <span style={{ marginLeft: 'auto', fontSize: '0.6rem', color: '#555' }}>{items.length}组 / {totalCount}部</span>
        </div>
        {!collapsed && items.map(renderAlbumItem)}
      </div>
    )
  }

  const totalAlbums = Object.values(albumSections).flat().length

  const sidebarContent = (
    <div style={{ padding: '8px 0 12px', height: '100%', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
      {/* 标题栏 */}
      <div style={{ padding: '0 12px 8px', fontSize: '0.8rem', fontWeight: 600, color: '#a78bfa', borderBottom: '1px solid #1e1e3a', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span>📁 专辑 ({totalAlbums})</span>
        <div style={{ display: 'flex', gap: 4 }}>
          <button className="btn-sm" onClick={onTogglePin}
            style={{ padding: '2px 5px', fontSize: '0.55rem', borderColor: pinned ? '#f59e0b' : '#444', color: pinned ? '#fbbf24' : '#666', background: pinned ? '#f59e0b10' : 'transparent' }}
            title={pinned ? '取消固定' : '固定侧边栏'}>{pinned ? '📌' : '📍'}</button>
          {creating ? (
            <input ref={createRef} value={createValue} onChange={e => setCreateValue(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') commitCreate(); if (e.key === 'Escape') setCreating(false) }}
              onBlur={commitCreate}
              placeholder="专辑名称..." style={{ width: 75, fontSize: '0.55rem', padding: '2px 4px', background: '#1a1a3a', border: '1px solid #7c3aed', borderRadius: 3, color: '#ccc', outline: 'none' }} />
          ) : (
            <button className="btn-sm" onClick={startCreate}
              style={{ padding: '2px 5px', fontSize: '0.55rem', borderColor: '#10b981', color: '#6ee7b7', background: 'transparent' }}>+</button>
          )}
        </div>
      </div>
      {/* 搜索 + 排序 */}
      <div style={{ padding: '6px 10px', display: 'flex', gap: 4, borderBottom: '1px solid #1e1e3a20' }}>
        <div style={{ flex: 1, position: 'relative' }}>
          <input ref={searchRef} value={albumSearch} onChange={e => onAlbumSearchChange?.(e.target.value)}
            placeholder="🔍 筛选..." style={{ width: '100%', fontSize: '0.65rem', padding: '3px 6px', background: '#14142a', border: '1px solid #2a2a4a', borderRadius: 4, color: '#ccc', outline: 'none', boxSizing: 'border-box' }} />
          {albumSearch && (
            <button onClick={() => onAlbumSearchChange?.('')} style={{ position: 'absolute', right: 2, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#666', cursor: 'pointer', fontSize: '0.6rem', padding: '2px 4px', lineHeight: 1 }}>✕</button>
          )}
        </div>
        <select value={albumSort} onChange={e => onAlbumSortChange?.(e.target.value)}
          style={{ width: 62, fontSize: '0.6rem', padding: '2px 2px', background: '#14142a', border: '1px solid #2a2a4a', borderRadius: 4, color: '#aaa', outline: 'none', cursor: 'pointer', boxSizing: 'border-box', appearance: 'none', WebkitAppearance: 'none', textAlign: 'center' }}>
          {sortOptions.map(o => (<option key={o.value} value={o.value}>{o.label}</option>))}
        </select>
      </div>
      {/* 空专辑开关 */}
      <div style={{ padding: '4px 10px', display: 'flex', justifyContent: 'flex-end' }}>
        <label style={{ fontSize: '0.6rem', color: '#666', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
          <input type="checkbox" checked={hideEmptyAlbums} onChange={e => setHideEmptyAlbums(e.target.checked)} style={{ cursor: 'pointer' }} />
          隐藏空专辑
        </label>
      </div>
      {/* 树形分组专辑列表 */}
      {totalAlbums === 0 && (
        <div style={{ padding: '8px 14px', fontSize: '0.7rem', color: '#555' }}>
          {albumSearch ? '无匹配专辑' : '暂无专辑，可在详情中创建或转换自动分组'}
        </div>
      )}
      {renderSection('画师专辑', 'artist', '👤')}
      {renderSection('社团专辑', 'group', '👥')}
      {renderSection('其他合集', 'other', '📦')}
      {/* 自动分组 */}
      {autoGroups.length > 0 && (
        <>
          <div style={{ padding: '0 12px 8px', marginTop: 8, fontSize: '0.72rem', fontWeight: 600, color: '#666', borderBottom: '1px solid #1e1e3a', marginBottom: 4 }}>自动分组{autoGroups.length > 0 && ` (${autoGroups.length})`}</div>
          {autoGroups.map(grp => (
            <div key={grp.key} style={{ padding: '0 12px' }}>
              <div onClick={() => onSelectGroup?.(grp.key)}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '5px 6px', borderRadius: 4, cursor: 'pointer', background: activeGroup === grp.key ? '#7c3aed10' : 'transparent', marginBottom: 1 }}>
                <span style={{ fontSize: '0.73rem', color: activeGroup === grp.key ? '#a78bfa' : '#888', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                  {grp.type === 'artist' ? '👤' : grp.type === 'group' ? '👥' : grp.type === 'multi' ? '👥👤' : '📦'} {grp.name}
                </span>
                <span style={{ fontSize: '0.62rem', color: '#555', marginLeft: 4 }}>{grp.count}</span>
                <button className="btn-sm" onClick={e => { e.stopPropagation(); onConvertToAlbum?.(grp) }} style={{ padding: '1px 4px', fontSize: '0.55rem', borderColor: '#8b5cf6', color: '#c4b5fd', background: 'transparent', marginLeft: 3 }} title="转为专辑">+</button>
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  )

  // 固定模式下不显示竖排标签、不依赖悬停
  const effectiveOpen = sidebarOpen || pinned

  return (
    <div style={{ position: 'relative', flexShrink: 0 }}>
      <div
        onMouseEnter={pinned ? undefined : onMouseEnter}
        onMouseLeave={pinned ? undefined : onMouseLeave}
        onDragOver={onDragOver}
        style={{ position: 'fixed', top: 0, left: 0, width: effectiveOpen ? 240 : 16, height: '100vh', zIndex: 50, transition: 'width 0.25s ease' }}>
        <div style={{
          position: 'absolute', top: 0, left: 0, width: 240, height: '100%',
          background: '#0d0d1a', borderRight: '1px solid #1e1e3a',
          transform: effectiveOpen ? 'translateX(0)' : 'translateX(-224px)',
          transition: 'transform 0.25s ease',
          boxShadow: effectiveOpen ? '4px 0 20px rgba(0,0,0,0.5)' : 'none'
        }}>
          <div style={{ padding: '8px 12px', fontSize: '0.75rem', color: '#555', borderBottom: '1px solid #1e1e3a', display: 'flex', justifyContent: 'space-between' }}>
            <span>📚 画廊管理</span>
            <div style={{ display: 'flex', gap: 4 }}>
              <button className="btn-sm" onClick={onTogglePin}
                style={{ padding: '1px 4px', fontSize: '0.55rem', borderColor: pinned ? '#f59e0b' : '#444', color: pinned ? '#fbbf24' : '#666', background: pinned ? '#f59e0b10' : 'transparent' }}
                title={pinned ? '取消固定' : '固定侧边栏'}>{pinned ? '📌' : '📍'}</button>
              {!pinned && <button className="btn-sm" onClick={onClose} style={{ padding: '1px 6px', fontSize: '0.6rem', borderColor: '#444', color: '#888' }}>收起</button>}
            </div>
          </div>
          {sidebarContent}
        </div>
        {!effectiveOpen && (
          <div style={{ position: 'absolute', left: 0, top: '50%', transform: 'translateY(-50%)', writingMode: 'vertical-rl', background: '#1a1a3a', color: '#666', padding: '8px 4px', borderRadius: '0 6px 6px 0', fontSize: '0.65rem', cursor: 'pointer', letterSpacing: 2, border: '1px solid #2a2a4a', borderLeft: 'none' }}>
            📁 专辑
          </div>
        )}
      </div>
    </div>
  )
}