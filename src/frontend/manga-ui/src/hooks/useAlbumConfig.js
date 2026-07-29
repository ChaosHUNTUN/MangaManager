import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { fetchAlbumConfig, saveAlbumConfig } from '../api'

const ALBUM_PALETTE = ['#c06060', '#c08050', '#b0a050', '#60a060', '#70a050', '#5070a0', '#8050a0', '#c06080', '#907050', '#607080', '#50a0a0', '#70a0a0']

/**
 * 专辑管理 Hook — 配置加载/保存、分组计算、自动匹配
 */
export default function useAlbumConfig({ galleryMetas }) {
  // ── 专辑配置 ──
  const [albumConfig, setAlbumConfig] = useState({})
  const [albumsLoaded, setAlbumsLoaded] = useState(false)
  const albumConfigRef = useRef(albumConfig)
  useEffect(() => { albumConfigRef.current = albumConfig }, [albumConfig])

  // ── 侧边栏状态 ──
  const [albumSearch, setAlbumSearch] = useState('')
  const [albumSort, setAlbumSort] = useState('default')
  const [albumModal, setAlbumModal] = useState(null)

  // ── 专辑加载 ──
  useEffect(() => {
    (async () => {
      const data = await fetchAlbumConfig()
      if (data && Object.keys(data).length > 0) { setAlbumConfig(data) } else {
        try {
          const raw = JSON.parse(localStorage.getItem('local-albums') || '{}')
          const cfg = {}
          for (const [key, val] of Object.entries(raw)) {
            if (Array.isArray(val)) cfg[key] = { name: key, gids: val }
            else if (val && typeof val === 'object' && Array.isArray(val.gids)) cfg[key] = val
          }
          if (Object.keys(cfg).length > 0) setAlbumConfig(cfg)
        } catch { }
      }
      setAlbumsLoaded(true)
    })()
  }, [])

  // ── 保存 ──
  const saveAlbums = useCallback(async (cfg) => {
    setAlbumConfig(cfg)
    try { localStorage.setItem('local-albums', JSON.stringify(cfg)) } catch { }
    try { await saveAlbumConfig(cfg) } catch (e) { /* 静默 */ }
  }, [])

  const getAlbumName = (key) => albumConfig[key]?.name || key

  const gidToAlbum = useMemo(() => {
    const map = {}
    Object.entries(albumConfig).forEach(([key, val]) => {
      if (val.gids && val.gids.length > 0) {
        val.gids.forEach(gid => { map[gid] = { key, name: val.name || key, color: val.color || 'var(--accent)' } })
      }
    })
    return map
  }, [albumConfig])

  // ── 自动匹配 ──
  const autoMatchGuardRef = useRef(false)
  useEffect(() => {
    if (!albumsLoaded || galleryMetas.length === 0 || Object.keys(albumConfig).length === 0 || autoMatchGuardRef.current) return
    autoMatchGuardRef.current = true
    const albumGids = new Set(Object.values(albumConfig).flatMap(v => v.gids || []))
    let changed = false; const cfg = { ...albumConfig }
    galleryMetas.forEach(g => {
      if (albumGids.has(g.gid)) return
      const simpleTags = [...(g.artists || []), ...(g.groups || [])]
      const namespaceTags = g.allTags || []
      const inferred = []; for (const t of simpleTags) { if (!t.includes(':')) inferred.push(`artist:${t}`, `group:${t}`) }
      const allCandidates = [...new Set([...namespaceTags, ...simpleTags, ...inferred])]
      for (const tag of allCandidates) {
        if (cfg[tag]) { const gids = cfg[tag].gids || []; if (!gids.includes(g.gid)) { cfg[tag] = { ...cfg[tag], gids: [...gids, g.gid] }; if (cfg[tag].order) cfg[tag].order = [...cfg[tag].order, g.gid]; changed = true } break }
      }
      const anyTags = new Set([...namespaceTags, ...simpleTags, ...inferred])
      for (const [k, v] of Object.entries(cfg)) {
        if (v.keyTag && anyTags.has(v.keyTag)) { const gids = v.gids || []; if (!gids.includes(g.gid)) { cfg[k] = { ...v, gids: [...gids, g.gid] }; if (v.order) cfg[k].order = [...v.order, g.gid]; changed = true } break }
      }
    })
    if (changed) saveAlbums(cfg)
    const tm = setTimeout(() => { autoMatchGuardRef.current = false }, 1000)
    return () => clearTimeout(tm)
  }, [galleryMetas, albumConfig, albumsLoaded])

  // ── 分组计算 ──
  const groups = useMemo(() => {
    const map = new Map()
    const allNames = new Set()
    galleryMetas.forEach(g => { (g.artists || []).forEach(a => allNames.add(a)); (g.groups || []).forEach(gr => allNames.add(gr)) })
    Object.entries(albumConfig).forEach(([key, val]) => {
      const gids = val.gids || []; if (gids.length === 0 && !allNames.has(key)) return
      map.set(`album:${key}`, { type: 'album', key: `album:${key}`, name: val.name || key, count: gids.length, editable: true, createdAt: val.createdAt || val.updatedAt, updatedAt: val.updatedAt })
    })
    const albumGids = new Set(Object.values(albumConfig).flatMap(v => v.gids || []))
    galleryMetas.forEach(g => {
      if (albumGids.has(g.gid)) return
      const a = g.artists || []; const gr = g.groups || []
      if (a.length === 1 && gr.length === 0) { const k = `artist:${a[0]}`; if (!map.has(k)) map.set(k, { type: 'artist', name: a[0], count: 0 }); map.get(k).count++ }
      else if (gr.length === 1 && a.length === 0) { const k = `group:${gr[0]}`; if (!map.has(k)) map.set(k, { type: 'group', name: gr[0], count: 0 }); map.get(k).count++ }
      else if (a.length === 1 && gr.length === 1) { const k = `artist:${a[0]}`; if (!map.has(k)) map.set(k, { type: 'artist', name: a[0], count: 0 }); map.get(k).count++ }
      else if (a.length + gr.length > 1) { if (!map.has('multi')) map.set('multi', { type: 'multi', name: '多作者', count: 0 }); map.get('multi').count++ }
      else { if (!map.has('unknown')) map.set('unknown', { type: 'unknown', name: '未分类', count: 0 }); map.get('unknown').count++ }
    })
    const lower = albumSearch.trim().toLowerCase()
    const filtered = Array.from(map.entries()).filter(([, v]) => v.type === 'album' || v.count > 0).filter(([, v]) => !lower || (v.name || '').toLowerCase().includes(lower))
    const sort = (items) => {
      const albums = items.filter(([, v]) => v.type === 'album'); const auto = items.filter(([, v]) => v.type !== 'album')
      albums.sort((a, b) => {
        switch (albumSort) {
          case 'name-asc': return (a[1].name || '').localeCompare(b[1].name || '')
          case 'name-desc': return (b[1].name || '').localeCompare(a[1].name || '')
          case 'count-asc': return (a[1].count || 0) - (b[1].count || 0)
          case 'count-desc': return (b[1].count || 0) - (a[1].count || 0)
          case 'time-asc': return (a[1].createdAt || a[1].updatedAt || '').localeCompare(b[1].createdAt || b[1].updatedAt || '')
          case 'time-desc': return (b[1].createdAt || b[1].updatedAt || '').localeCompare(a[1].createdAt || a[1].updatedAt || '')
          default: return (a[1].createdAt || a[1].updatedAt || '').localeCompare(b[1].createdAt || b[1].updatedAt || '')
        }
      })
      auto.sort((a, b) => b[1].count - a[1].count)
      return [...albums, ...auto]
    }
    return sort(filtered).map(([key, val]) => ({ key, ...val }))
  }, [galleryMetas, albumConfig, albumSearch, albumSort])

  // ── 颜色/转换 ──
  const generateAlbumColor = useCallback(() => {
    const used = new Set(Object.values(albumConfig).map(v => v.color).filter(Boolean))
    for (const c of ALBUM_PALETTE) if (!used.has(c)) return c
    return '#' + Math.floor(Math.random() * 0xFFFFFF).toString(16).padStart(6, '0')
  }, [albumConfig])

  const convertGroupToAlbum = (grp) => {
    if (grp.type === 'multi' || grp.type === 'unknown') return
    const ag = new Set(Object.values(albumConfig).flatMap(v => v.gids || []))
    const gids = galleryMetas.filter(g => {
      if (ag.has(g.gid)) return false
      const a = g.artists || []; const gr = g.groups || []
      if (grp.key.startsWith('artist:')) { const n = grp.key.slice(7); return (a.length === 1 && a[0] === n) }
      if (grp.key.startsWith('group:')) { const n = grp.key.slice(6); return (gr.length === 1 && gr[0] === n && a.length === 0) }
      return false
    }).map(g => g.gid)
    if (gids.length === 0) return
    const cfg = { ...albumConfig }
    const eg = [...(cfg[grp.key]?.gids || []), ...(cfg[grp.name]?.gids || [])]
    const color = cfg[grp.key]?.color || cfg[grp.name]?.color || generateAlbumColor()
    cfg[grp.key] = { name: grp.name, color, gids: [...eg, ...gids] }; delete cfg[grp.name]
    saveAlbums(cfg)
    return { name: grp.name, count: gids.length }
  }

  // ── 专辑 CRUD ──
  const handleCreateAlbum = (name) => {
    const cfg = { ...albumConfig }; cfg[name] = { name, color: generateAlbumColor(), gids: cfg[name]?.gids || [] }
    saveAlbums(cfg)
    return name
  }

  const handleAlbumUpdated = useCallback((key, { name, color }) => {
    setAlbumConfig(prev => { if (!prev[key]) return prev; return { ...prev, [key]: { ...prev[key], name: name ?? prev[key].name, color: color ?? prev[key].color } } })
  }, [])

  const handleDeleteAlbum = (key) => { const cfg = { ...albumConfig }; delete cfg[key]; saveAlbums(cfg) }

  return {
    albumConfig, albumConfigRef, albumsLoaded, saveAlbums,
    albumSearch, setAlbumSearch, albumSort, setAlbumSort, albumModal, setAlbumModal,
    groups, gidToAlbum, getAlbumName,
    generateAlbumColor, convertGroupToAlbum,
    handleCreateAlbum, handleAlbumUpdated, handleDeleteAlbum,
  }
}
