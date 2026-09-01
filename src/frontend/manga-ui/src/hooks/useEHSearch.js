import { useState, useRef, useCallback, useEffect } from 'react'
import { suggestEHTags } from '../api'

export default function useEHSearch({ search, setSearch, browse, exhentai, setPopularMode }) {
  const [tagSuggestions, setTagSuggestions] = useState([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [cursorPos, setCursorPos] = useState(0)
  const searchInputRef = useRef(null)
  const suggestTimerRef = useRef(null)
  const composingRef = useRef(false)

  // 组合安全：输入法组合中不覆盖输入框（search 变化时同步，组合中跳过）
  useEffect(() => {
    const el = searchInputRef.current
    if (el && !composingRef.current && el.value !== search) el.value = search
  }, [search])

  const handleSearchInput = useCallback((e) => {
    const val = e.target.value
    setSearch(val)
    const pos = e.target.selectionStart || 0
    setCursorPos(pos)

    const lastSpace = val.lastIndexOf(' ', pos - 1)
    const currentWord = val.substring(lastSpace + 1, pos).trim()

    if (suggestTimerRef.current) clearTimeout(suggestTimerRef.current)

    if (currentWord.length >= 1) {
      suggestTimerRef.current = setTimeout(async () => {
        try {
          const results = await suggestEHTags(currentWord, 20)
          if (results.length > 0) {
            const enteredTags = new Set(val.toLowerCase().split(/\s+/))
            const filtered = results.filter(r => {
              const syntaxLower = (r.ehSyntax || '').toLowerCase()
              return !enteredTags.has(syntaxLower) && !enteredTags.has(syntaxLower.replace(/_/g, ' '))
            })
            setTagSuggestions(filtered.slice(0, 8))
            setShowSuggestions(filtered.length > 0)
          } else setShowSuggestions(false)
        } catch { setShowSuggestions(false) }
      }, 300)
    } else setShowSuggestions(false)
  }, [search, setSearch])

  const handleCompositionStart = useCallback(() => { composingRef.current = true }, [])
  const handleCompositionEnd = useCallback((e) => {
    composingRef.current = false
    handleSearchInput(e)
  }, [handleSearchInput])

  const applyTag = useCallback((tag) => {
    // 用输入框实时值（而非可能过期的 state），避免多标签输入时误删前一个标签
    const el = searchInputRef.current
    const val = el ? el.value : search
    const pos = el ? (el.selectionStart ?? cursorPos) : cursorPos
    const lastSpace = val.lastIndexOf(' ', pos - 1)
    const before = val.substring(0, lastSpace + 1)
    const after = val.substring(pos)
    const newVal = (before + (tag.ehSyntax || tag.key) + ' ' + after).replace(/\s+/g, ' ').trim()
    setSearch(newVal)
    if (el) {
      el.value = newVal
      el.focus()
      try { el.setSelectionRange(newVal.length, newVal.length) } catch { }
    }
    setShowSuggestions(false)
  }, [search, cursorPos, setSearch])

  const handleSearchKey = useCallback((e) => {
    if (e.key === 'Enter' && !showSuggestions) {
      e.preventDefault()
      setPopularMode(false)
      browse(search, exhentai)
    }
    if (e.key === 'Escape') setShowSuggestions(false)
  }, [showSuggestions, search, exhentai, browse, setPopularMode])

  return { tagSuggestions, showSuggestions, setShowSuggestions, searchInputRef, handleSearchInput, handleCompositionStart, handleCompositionEnd, applyTag, handleSearchKey }
}
