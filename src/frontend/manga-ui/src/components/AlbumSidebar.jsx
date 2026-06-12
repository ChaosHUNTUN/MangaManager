/**
 * 专辑侧边栏组件
 * 悬停展开，支持专辑创建/重命名/删除，拖拽分配
 * 
 * Props:
 *   sidebarOpen   - 是否展开
 *   groups        - 分组列表（来自 useMemo）
 *   activeGroup   - 当前激活的分组 key
 *   albumConfig   - 专辑配置
 *   dragGid       - 当前拖拽的 gid
 *   onSelectGroup - (groupKey) => void
 *   onCreateAlbum - (name) => void
 *   onRenameAlbum - (oldKey, newName) => void
 *   onDeleteAlbum - (key) => void
 *   onConvertToAlbum - (group) => void
 *   onMouseEnter  - () => void
 *   onMouseLeave  - () => void
 *   onDragOver    - (e) => void
 *   onClose       - () => void
 */
export default function AlbumSidebar({
  sidebarOpen, groups, activeGroup, albumConfig, dragGid,
  onSelectGroup, onCreateAlbum, onRenameAlbum, onDeleteAlbum,
  onConvertToAlbum, onMouseEnter, onMouseLeave, onDragOver, onClose
}) {
  const sidebarContent = (
    <div style={{ padding: '12px 0', height: '100%', overflowY: 'auto' }}>
      <div style={{ padding: '0 14px 10px', fontSize: '0.8rem', fontWeight: 600, color: '#a78bfa', borderBottom: '1px solid #1e1e3a', marginBottom: 8 }}>
        📁 专辑
        <button className="btn-sm" onClick={() => {
          const n = prompt('新建专辑名称（将用于自动匹配下载的漫画）:')
          if (n && n.trim()) onCreateAlbum?.(n.trim())
        }} style={{ float: 'right', padding: '2px 8px', fontSize: '0.65rem', borderColor: '#10b981', color: '#6ee7b7', background: 'transparent' }}>+ 新建</button>
      </div>
      {groups.filter(g => g.type === 'album').length === 0 && (
        <div style={{ padding: '8px 14px', fontSize: '0.7rem', color: '#555' }}>暂无专辑，可在详情中创建或转换自动分组</div>
      )}
      {groups.filter(g => g.type === 'album').map(grp => {
        const isActive = activeGroup === grp.key
        const isDropTarget = dragGid != null
        const realKey = grp.key.slice(6)
        return (
          <div key={grp.key} style={{ padding: '0 8px' }} className="album-sidebar-row">
            <div onClick={() => { onSelectGroup?.(grp.key) }}
              data-drop-zone={realKey}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '8px 10px', borderRadius: 6, cursor: 'pointer',
                background: isActive ? '#7c3aed15' : 'transparent',
                border: `1px solid ${isActive ? '#7c3aed40' : isDropTarget ? '#f59e0b40' : 'transparent'}`,
                transition: 'all 0.15s', marginBottom: 2, outline: 'none'
              }}>
              <span style={{ fontSize: '0.78rem', color: isActive ? '#a78bfa' : '#ccc', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>📁 {grp.name}</span>
              <span style={{ fontSize: '0.65rem', color: '#666', marginLeft: 6 }}>{grp.count}</span>
              <span className="album-actions" style={{ display: 'flex', gap: 2, marginLeft: 4, alignItems: 'center' }}>
                <button className="btn-sm" onClick={e => { e.stopPropagation(); const n = prompt('修改显示名称:', grp.name); if (n && n.trim() && n.trim() !== grp.name) onRenameAlbum?.(realKey, n.trim()) }} style={{ padding: '2px 4px', fontSize: '0.65rem', borderColor: 'transparent', color: '#888', background: 'transparent', cursor: 'pointer' }} title="修改显示名称">✎</button>
                <button className="btn-sm" onClick={e => { e.stopPropagation(); if (confirm(`删除专辑 "${grp.name}"？画廊将回到自动分组。`)) onDeleteAlbum?.(realKey) }} style={{ padding: '2px 4px', fontSize: '0.65rem', borderColor: 'transparent', color: '#fca5a5', background: 'transparent', cursor: 'pointer' }} title="删除">✕</button>
              </span>
            </div>
          </div>
        )
      })}
      <div style={{ padding: '0 14px 10px', marginTop: 12, fontSize: '0.75rem', fontWeight: 600, color: '#888', borderBottom: '1px solid #1e1e3a', marginBottom: 4 }}>自动分组</div>
      {groups.filter(g => g.type !== 'album').map(grp => (
        <div key={grp.key} style={{ padding: '0 14px' }}>
          <div onClick={() => { onSelectGroup?.(grp.key) }}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 6px', borderRadius: 4, cursor: 'pointer', background: activeGroup === grp.key ? '#7c3aed10' : 'transparent', marginBottom: 1 }}>
            <span style={{ fontSize: '0.75rem', color: activeGroup === grp.key ? '#a78bfa' : '#888', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
              {grp.type === 'artist' ? '👤' : grp.type === 'group' ? '👥' : grp.type === 'multi' ? '👥👤' : '📦'} {grp.name}
            </span>
            <span style={{ fontSize: '0.65rem', color: '#555', marginLeft: 6 }}>{grp.count}</span>
            <button className="btn-sm" onClick={e => { e.stopPropagation(); onConvertToAlbum?.(grp) }} style={{ padding: '1px 5px', fontSize: '0.55rem', borderColor: '#8b5cf6', color: '#c4b5fd', background: 'transparent', marginLeft: 4 }} title="转为专辑">+</button>
          </div>
        </div>
      ))}
    </div>
  )

  return (
    <div style={{ position: 'relative', flexShrink: 0 }}>
      <div
        onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave}
        onDragOver={onDragOver}
        style={{ position: 'fixed', top: 0, left: 0, width: sidebarOpen ? 240 : 16, height: '100vh', zIndex: 50, transition: 'width 0.25s ease' }}>
        <div style={{
          position: 'absolute', top: 0, left: 0, width: 240, height: '100%',
          background: '#0d0d1a', borderRight: '1px solid #1e1e3a',
          transform: sidebarOpen ? 'translateX(0)' : 'translateX(-224px)',
          transition: 'transform 0.25s ease',
          boxShadow: sidebarOpen ? '4px 0 20px rgba(0,0,0,0.5)' : 'none'
        }}>
          <div style={{ padding: '8px 14px', fontSize: '0.75rem', color: '#555', borderBottom: '1px solid #1e1e3a', display: 'flex', justifyContent: 'space-between' }}>
            <span>📚 画廊管理</span>
            <button className="btn-sm" onClick={onClose} style={{ padding: '1px 6px', fontSize: '0.6rem', borderColor: '#444', color: '#888' }}>收起</button>
          </div>
          {sidebarContent}
        </div>
        {!sidebarOpen && (
          <div style={{ position: 'absolute', left: 0, top: '50%', transform: 'translateY(-50%)', writingMode: 'vertical-rl', background: '#1a1a3a', color: '#666', padding: '8px 4px', borderRadius: '0 6px 6px 0', fontSize: '0.65rem', cursor: 'pointer', letterSpacing: 2, border: '1px solid #2a2a4a', borderLeft: 'none' }}>
            📁 专辑
          </div>
        )}
      </div>
    </div>
  )
}
