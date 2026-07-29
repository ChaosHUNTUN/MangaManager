import { useState, useRef, useCallback } from 'react'
import { suggestEHTags } from '../api'

export default function useEHSearch({ search, setSearch, browse, exhentai, setPopularMode }) {
  const [tagSuggestions, setTagSuggestions] = useState([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [cursorPos, setCursorPos] = useState(0)
  const searchInputRef = useRef(null)
  const suggestTimerRef = useRef(null)

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

  const applyTag = useCallback((tag) => {
    const val = search
    const pos = cursorPos
    const lastSpace = val.lastIndexOf(' ', pos - 1)
    const before = val.substring(0, lastSpace + 1)
    const after = val.substring(pos)
    const newVal = (before + (tag.ehSyntax || tag.key) + ' ' + after).replace(/\s+/g, ' ').trim()
    setSearch(newVal)
    setShowSuggestions(false)
    searchInputRef.current?.focus()
  }, [search, cursorPos, setSearch])

  const handleSearchKey = useCallback((e) => {
    if (e.key === 'Enter' && !showSuggestions) {
      e.preventDefault()
      setPopularMode(false)
      browse(search, exhentai)
    }
    if (e.key === 'Escape') setShowSuggestions(false)
  }, [showSuggestions, search, exhentai, browse, setPopularMode])

  return { tagSuggestions, showSuggestions, setShowSuggestions, searchInputRef, handleSearchInput, applyTag, handleSearchKey }
}
