import { useState, useRef, useMemo, useEffect, useCallback } from 'react'
import { translateEHTags } from '../api'
import { searchTags } from '../api/work'

/**
 * 本地画廊搜索 Hook
 * — 搜索标签池构建（从 metas + albumConfig 提取）
 * — 标签翻译（artist/group/category/language 中文映射）
 * — 搜索输入自动补全
 */
export default function useGallerySearch({ galleryMetas, albumConfig, search, setSearch, cursorPos, setCursorPos, setToast, searchInputRef }) {
  const [searchTagTransMap, setSearchTagTransMap] = useState({})
  const [searchSuggestions, setSearchSuggestions] = useState([])
  const suggestTimerRef = useRef(null)

  // 带空格的标签/作者名在插入搜索框时加引号，避免后端按空格拆词导致搜不到
  const syntaxOf = (prefix, name) => {
    const v = name.includes(' ') ? `"${name}"` : name
    return `${prefix}:${v}`
  }

  // ── 搜索标签池（画师/社团/分类/语言 + 专辑名） ──
  const searchTagPool = useMemo(() => {
    const pool = []; const seen = new Set()
    const add = (p, l) => { const k = `${p}:${l}`; if (!seen.has(k)) { seen.add(k); pool.push({ key: k, label: l, prefix: p, syntax: syntaxOf(p, l) }) } }
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
        const colonIdx = currentWord.indexOf(':')
        const wordPrefix = colonIdx > 0 ? currentWord.slice(0, colonIdx).toLowerCase() : null
        const wordValue = colonIdx > 0 ? currentWord.slice(colonIdx + 1) : currentWord
        const kwLower = wordValue.toLowerCase()

        // 派生池匹配：前缀词按「前缀 + 冒号后内容」匹配，无前缀词按标签名/中文匹配
        const matched = searchTagPool.filter(p => {
          if (s.includes(p.syntax.toLowerCase()) || s.includes(p.key.toLowerCase())) return false
          const cn = searchTagTransMap[p.key]
          const labelOk = p.label.toLowerCase().includes(kwLower)
          const cnOk = !!(cn && cn.toLowerCase().includes(kwLower))
          if (wordPrefix) return p.prefix === wordPrefix && (labelOk || cnOk)
          return labelOk || cnOk
        })

        // tag: 前缀 → 查本地标签库（任意命名空间，含中文），补全 tag: 语法
        if (wordPrefix === 'tag') {
          if (kwLower.length >= 1) {
            searchTags({ q: wordValue, limit: 8 })
              .then(rows => {
                const seen = new Set()
                const items = (rows || [])
                  .filter(t => {
                const syn = syntaxOf('tag', t.name).toLowerCase()
                if (seen.has(syn)) return false
                seen.add(syn)
                return true
                  })
                  .map(t => ({
                    key: `tag:${t.name}`,
                    label: t.nameCn ? `${t.nameCn}（${t.name}）` : t.name,
                    prefix: 'tag',
                    syntax: syntaxOf('tag', t.name),
                    count: t.count,
                  }))
                setSearchSuggestions(items.slice(0, 8))
              })
              .catch(() => setSearchSuggestions([]))
          } else {
            setSearchSuggestions([])
          }
          return
        }

        // 无前缀词时补查标签库：任何本地标签（原文/中文）都可作为 tag:xxx 语法补全
        if (!wordPrefix) {
          searchTags({ q: currentWord, limit: 8 })
            .then(tagRows => {
              const seen = new Set(matched.map(p => p.key.toLowerCase()))
              const tagMatches = (tagRows || [])
                .filter(t => {
                  const syntax = syntaxOf('tag', t.name).toLowerCase()
                  if (s.includes(syntax) || seen.has(syntax) || syntax === currentWord.toLowerCase()) return false
                  seen.add(syntax)
                  return true
                })
                .map(t => ({
                  key: `tag:${t.name}`,
                  label: t.nameCn ? `${t.nameCn}（${t.name}）` : t.name,
                  prefix: 'tag',
                  syntax: syntaxOf('tag', t.name),
                  count: t.count,
                }))
              setSearchSuggestions([...matched.slice(0, 6), ...tagMatches].slice(0, 8))
            })
            .catch(() => setSearchSuggestions(matched.slice(0, 8)))
        } else {
          // 其他前缀（artist:/group:/category:/language:）走派生池
          setSearchSuggestions(matched.slice(0, 8))
        }
      }, 300)
    } else setSearchSuggestions([])
  }, [search, setSearch, searchTagPool, searchTagTransMap, setCursorPos])

  const applySearchTag = useCallback((tag) => {
    // 用输入框实时值（而非可能过期的 state），避免多标签输入时用旧值替换导致误删
    const el = searchInputRef?.current
    const val = el ? el.value : search
    const pos = el ? (el.selectionStart ?? cursorPos) : cursorPos
    const lastSpace = val.lastIndexOf(' ', pos - 1)
    const before = val.substring(0, lastSpace + 1)
    const after = val.substring(pos)
    const insert = tag.key.includes(':') ? tag.syntax : tag.key
    const newVal = (before + insert + ' ' + after).replace(/\s+/g, ' ').trim()
    setSearch(newVal)
    if (el) {
      el.value = newVal
      el.focus()
      try { el.setSelectionRange(newVal.length, newVal.length) } catch { }
    }
    setSearchSuggestions([])
  }, [search, cursorPos, setSearch, searchInputRef])

  return { searchTagPool, searchTagTransMap, searchSuggestions, setSearchSuggestions, handleSearchInput, applySearchTag }
}
