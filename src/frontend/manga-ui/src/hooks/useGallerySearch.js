import { useState, useRef, useMemo, useEffect, useCallback } from 'react'
import { translateEHTags } from '../api'

/**
 * 本地画廊搜索 Hook
 * — 搜索标签池构建（从 metas + albumConfig 提取）
 * — 标签翻译（artist/group/category/language 中文映射）
 * — 搜索输入自动补全
 */
export default function useGallerySearch({ galleryMetas, albumConfig, search, setSearch, cursorPos, setCursorPos, setToast }) {
  const [searchTagTransMap, setSearchTagTransMap] = useState({})
  const [searchSuggestions, setSearchSuggestions] = useState([])
  const suggestTimerRef = useRef(null)

  // ── 搜索标签池（画师/社团/分类/语言 + 专辑名） ──
  const searchTagPool = useMemo(() => {
    const pool = []; const seen = new Set()
    const add = (p, l) => { const k = `${p}:${l}`; if (!seen.has(k)) { seen.add(k); pool.push({ key: k, label: l, prefix: p, syntax: `${p}:${l}` }) } }
    galleryMetas.forEach(g => { (g.artists || []).forEach(t => add('artist', t)); (g.groups || []).forEach(t => add('group', t)); if (g.category) add('category', g.category); if (g.language) add('language', g.language) })
    Object.entries(albumConfig).forEach(([, val]) => { const n = val.name || ''; if (n && !seen.has(n)) { seen.add(n); pool.push({ key: n, label: n, prefix: 'album', syntax: n }) } })
    return pool.sort((a, b) => a.label.localeCompare(b.label))
  }, [galleryMetas, albumConfig])

  // ── 标签翻译 ──
  const metaHash = useMemo(() => galleryMetas.map(g => g.gid).sort().join(','), [galleryMetas])
  useEffect(() => {
    if (galleryMetas.length === 0) return
    const tagSet = new Set()
    galleryMetas.forEach(g => {
      (g.artists || []).forEach(t => tagSet.add(`artist:${t}`))
      ;(g.groups || []).forEach(t => tagSet.add(`group:${t}`))
      if (g.language) tagSet.add(`language:${g.language}`)
      if (g.category) tagSet.add(`category:${g.category}`)
    })
    if (tagSet.size === 0) return
    const tagList = Array.from(tagSet)
    const run = async () => {
      const transMap = {}
      for (let i = 0; i < tagList.length; i += 200) {
        try { const r = await translateEHTags(tagList.slice(i, i + 200)); (r.data || []).forEach(item => { if (item.cn) transMap[item.key] = item.cn }) } catch { }
      }
      setSearchTagTransMap(transMap)
    }
    run()
  }, [metaHash])

  // ── 搜索输入 ──
  const handleSearchInput = useCallback((e) => {
    if (e.nativeEvent.isComposing) return
    const val = e.target.value; setSearch(val)
    const pos = e.target.selectionStart || 0; setCursorPos(pos)
    const lastSpace = val.lastIndexOf(' ', pos - 1)
    const currentWord = val.substring(lastSpace + 1, pos).trim()
    if (suggestTimerRef.current) clearTimeout(suggestTimerRef.current)
    if (currentWord.length >= 1) {
      suggestTimerRef.current = setTimeout(() => {
        const s = val.toLowerCase()
        const matched = searchTagPool.filter(p => {
          if (!s.includes(p.syntax.toLowerCase()) && !s.includes(p.key.toLowerCase())) {
            const cn = searchTagTransMap[p.key]
            if (cn && p.label.toLowerCase().includes(currentWord.toLowerCase())) return true
            return p.label.toLowerCase().includes(currentWord.toLowerCase()) || (cn && cn.toLowerCase().includes(currentWord.toLowerCase()))
          }
          return false
        })
        if (matched.length > 0) setSearchSuggestions(matched.slice(0, 8))
        else setSearchSuggestions([])
      }, 300)
    } else setSearchSuggestions([])
  }, [search, setSearch, searchTagPool, searchTagTransMap, setCursorPos])

  const applySearchTag = useCallback((tag) => {
    const val = search; const pos = cursorPos
    const lastSpace = val.lastIndexOf(' ', pos - 1)
    const before = val.substring(0, lastSpace + 1)
    const after = val.substring(pos)
    const insert = tag.key.includes(':') ? tag.syntax : tag.key
    const newVal = (before + insert + ' ' + after).replace(/\s+/g, ' ').trim()
    setSearch(newVal); setSearchSuggestions([])
  }, [search, cursorPos, setSearch])

  return { searchTagPool, searchTagTransMap, searchSuggestions, setSearchSuggestions, handleSearchInput, applySearchTag }
}
