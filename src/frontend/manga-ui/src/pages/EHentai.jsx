import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import EhentaiReader from '../components/EhentaiReader'
import ScrollToTop from '../components/ScrollToTop'
import {
  fetchEHentaiCookie, updateEHentaiCookie, validateEHentaiCookie,
  fetchEHGalleries, fetchEHGalleryDetail, checkEHConnectivity,
  downloadEHGallery, getEHImageProxyUrl,
  translateEHTags, fetchBlockedTags, addBlockedTag, removeBlockedTag,
  API_BASE, checkDownloaded, suggestEHTags, addDownloadTask
} from '../api'

// 分类颜色映射（对标 EhViewer）
const CATEGORY_COLORS = {
  doujinshi: '#F44336', manga: '#FF9800', 'artist cg': '#FBC02D',
  'artist cg sets': '#FBC02D', 'game cg': '#4CAF50', 'game cg sets': '#4CAF50',
  western: '#8BC34A', 'non-h': '#2196F3', 'imageset': '#9C27B0',
  cosplay: '#E91E63', 'asian porn': '#795548', misc: '#607D8B',
  private: '#607D8B', other: '#607D8B'
}
const getCategoryColor = (cat) => CATEGORY_COLORS[(cat || '').toLowerCase()] || '#607D8B'

export default function EHentai() {
  // Cookie
  const [showCookie, setShowCookie] = useState(false)
  const [cookieForm, setCookieForm] = useState({ ipbMemberId: '', ipbPassHash: '', igneous: '', label: '' })
  const [cookieInfo, setCookieInfo] = useState(null)
  const [cookieValidating, setCookieValidating] = useState(false)
  const [validateResult, setValidateResult] = useState(null)
  const [cookieMsg, setCookieMsg] = useState(null)
  const [connectivity, setConnectivity] = useState(null)

  // 浏览（懒加载模式）
  const [galleries, setGalleries] = useState([])
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)
  const [totalPages, setTotalPages] = useState(0)
  const [nextCursor, setNextCursor] = useState(null)
  const [hasMore, setHasMore] = useState(true)
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState(null)
  const [exhentai, setExhentai] = useState(true)
  const loadMoreRef = useRef(null)
  const currentSearchRef = useRef('')
  const currentExRef = useRef(true)
  const currentFiltersRef = useRef({})

  // 标签翻译缓存
  const [tagTranslations, setTagTranslations] = useState({})
  const [nsTranslations, setNsTranslations] = useState({})

  // 标签操作
  const [activeTag, setActiveTag] = useState(null) // { namespace, tag, key } | null

  // Toast 通知
  const [toast, setToast] = useState(null) // { type, text }

  // 本地已下载的 gid 集合
  const [localGids, setLocalGids] = useState(new Set())

  // 屏蔽标签
  const [blockedTags, setBlockedTags] = useState([])
  const [showBlockedPanel, setShowBlockedPanel] = useState(false)

  const loadBlockedTags = async () => {
    try { const tags = await fetchBlockedTags(); setBlockedTags(tags) } catch { }
  }

  // 加载翻译：详情弹窗打开时翻译所有标签
  const translateDetailTags = async (detail) => {
    if (!detail?.tagGroups?.length) return
    const allTags = []
    detail.tagGroups.forEach(g => {
      allTags.push(`n:${g.namespace}`)
      g.tags.forEach(t => allTags.push(`${g.namespace}:${t}`))
    })
    try {
      const r = await translateEHTags(allTags)
      const tMap = {}, nsMap = {}
      ;(r.data || []).forEach(item => {
        if (item.key?.startsWith('n:')) nsMap[item.key.substring(2)] = item.cn
        else if (item.cn) tMap[item.key] = item.cn
      })
      setTagTranslations(tMap)
      setNsTranslations(nsMap)
    } catch { }
  }

  const handleBlockTag = async (namespace, tag) => {
    const fullTag = `${namespace}:${tag}`
    if (blockedTags.includes(fullTag)) return
    try {
      await addBlockedTag(fullTag)
      setBlockedTags(prev => [...prev, fullTag])
    } catch { }
  }

  const handleUnblockTag = async (tag) => {
    try {
      await removeBlockedTag(tag)
      setBlockedTags(prev => prev.filter(t => t !== tag))
    } catch { }
  }

  // 高级搜索
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [filters, setFilters] = useState({
    categoryMask: 0,   // 0=全部, 位标记: 1=misc, 2=doujinshi, 4=manga, 8=artist_cg, 16=game_cg, 32=image_set, 64=cosplay, 128=asian_porn, 256=non_h, 512=western
    minRating: 0,       // 0=不限, 2-5
    pageFrom: '',       // 最小页数
    pageTo: '',         // 最大页数
    advSearch: 0,       // 搜索范围位标记
  })

  const toggleCategory = (bit) => {
    setFilters(f => ({ ...f, categoryMask: f.categoryMask ^ bit }))
  }
  const toggleAdvSearch = (bit) => {
    setFilters(f => ({ ...f, advSearch: f.advSearch ^ bit }))
  }

  // 热门模式（默认开启）
  const [popularMode, setPopularMode] = useState(true)

  const buildFiltersObj = (isPopular = false) => {
    const f = {}
    if (isPopular) f.popular = true
    if (filters.categoryMask) f.categoryMask = filters.categoryMask
    if (filters.minRating > 0) f.minRating = filters.minRating
    if (filters.pageFrom) f.pageFrom = parseInt(filters.pageFrom) || undefined
    if (filters.pageTo) f.pageTo = parseInt(filters.pageTo) || undefined
    if (filters.advSearch) f.advSearch = filters.advSearch
    return f
  }

  // 智能搜索
  const [tagSuggestions, setTagSuggestions] = useState([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [cursorPos, setCursorPos] = useState(0)
  const searchInputRef = useRef(null)

  // 详情
  const [detail, setDetail] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)

  useEffect(() => {
    // 先检查 Cookie 和网络，再决定是否加载列表
    const init = async () => {
      await loadCookie()
      checkNet() // 不阻塞

      // 检查 URL 参数 ?open=gid 或 ?open=gid_token，来自本地画廊跳转
      const params = new URLSearchParams(window.location.search)
      const openParam = params.get('open')
      if (openParam) {
        const parts = openParam.split('_')
        const gid = parseInt(parts[0])
        const token = parts.length > 1 ? parts[1] : null
        if (gid) {
          window.history.replaceState({}, '', '/ehentai')
          if (token) {
            setDetailLoading(true)
            fetchEHGalleryDetail(gid, token).then(d => {
              setDetail(d)
              translateDetailTags(d)
              loadBlockedTags()
            }).catch(e => setError(e.message))
            .finally(() => setDetailLoading(false))
          }
          return
        }
      }

      // 默认加载热门+里站内容
      setLoading(true)
      currentFiltersRef.current = { popular: true }
      fetchEHGalleries('', 0, true, null, { popular: true })
        .then(r => {
          setGalleries(r.galleries || [])
          setHasMore(!!r.nextCursor)
          setNextCursor(r.nextCursor || null)
          const gids = (r.galleries || []).map(g => g.gid)
          if (gids.length > 0) checkDownloaded(gids).then(d => setLocalGids(new Set(d))).catch(() => {})
        })
        .catch(e => setError(e.message))
        .finally(() => setLoading(false))
    }
    init()
  }, [])

  const checkNet = async () => {
    try { const r = await checkEHConnectivity(); setConnectivity(r) } catch { setConnectivity({ reachable: false }) }
  }
  const loadCookie = async () => {
    try { const info = await fetchEHentaiCookie(); setCookieInfo(info); setCookieForm(p => ({ ...p, label: info.label || '' })) } catch { }
  }

  const handleSaveCookie = async () => {
    setCookieValidating(true); setCookieMsg(null)
    try {
      const r = await updateEHentaiCookie(cookieForm)
      if (r.success) {
        setCookieMsg({ type: 'success', text: '已保存' })
        await loadCookie()
        const vr = await validateEHentaiCookie()
        setValidateResult(vr.data)
        // Cookie 保存成功后自动加载热门列表
        setExhentai(true); setPopularMode(true)
        currentSearchRef.current = ''; currentExRef.current = true
        const filterObj = { popular: true }
        currentFiltersRef.current = filterObj
        setLoading(true)
        fetchEHGalleries('', 0, true, null, filterObj).then(r => {
          const gals = r.galleries || []
          setGalleries(gals)
          setHasMore(!!r.nextCursor)
          setNextCursor(r.nextCursor || null)
          if (gals.length > 0) checkDownloaded(gals.map(g => g.gid)).then(d => setLocalGids(new Set(d))).catch(() => {})
          setError(null)
        }).catch(e => setError(e.message))
        .finally(() => setLoading(false))
      }
      else setCookieMsg({ type: 'error', text: r.message })
    } catch (e) { setCookieMsg({ type: 'error', text: e.message }) }
    setCookieValidating(false)
  }

  const handleValidate = async () => {
    setCookieValidating(true); setValidateResult(null)
    try { const r = await validateEHentaiCookie(); setValidateResult(r.data) } catch (e) { setValidateResult({ loggedIn: false, error: e.message }) }
    setCookieValidating(false)
  }

  // ===== 智能搜索（对标 EhViewer TagSuggestion） =====
  const suggestTimerRef = useRef(null)

  const handleSearchInput = (e) => {
    const val = e.target.value
    setSearch(val)
    const pos = e.target.selectionStart || 0
    setCursorPos(pos)

    // 获取光标前的当前词（最后一个空格之后的内容）
    const lastSpace = val.lastIndexOf(' ', pos - 1)
    const currentWord = val.substring(lastSpace + 1, pos).trim()

    // 防抖：300ms 后请求后端建议
    if (suggestTimerRef.current) clearTimeout(suggestTimerRef.current)

    if (currentWord.length >= 1) {
      suggestTimerRef.current = setTimeout(async () => {
        try {
          const results = await suggestEHTags(currentWord, 20)
          if (results.length > 0) {
            // 过滤掉已输入的标签
            const enteredTags = new Set(val.toLowerCase().split(/\s+/))
            const filtered = results.filter(r => {
              const syntaxLower = (r.ehSyntax || '').toLowerCase()
              return !enteredTags.has(syntaxLower) && !enteredTags.has(syntaxLower.replace(/_/g, ' '))
            })
            setTagSuggestions(filtered.slice(0, 8))
            setShowSuggestions(filtered.length > 0)
          } else {
            setShowSuggestions(false)
          }
        } catch {
          setShowSuggestions(false)
        }
      }, 300)
    } else {
      setShowSuggestions(false)
    }
  }

  const applyTag = (tag) => {
    // 将当前光标位置前的词替换为 E-Hentai 标签语法
    const val = search
    const pos = cursorPos
    const lastSpace = val.lastIndexOf(' ', pos - 1)
    const before = val.substring(0, lastSpace + 1)
    const after = val.substring(pos)
    const newVal = (before + (tag.ehSyntax || tag.key) + ' ' + after).replace(/\s+/g, ' ').trim()
    setSearch(newVal)
    setShowSuggestions(false)
    searchInputRef.current?.focus()
  }

  const handleSearchKey = (e) => {
    if (e.key === 'Enter' && !showSuggestions) {
      e.preventDefault()
      setPopularMode(false)
      browse(search, exhentai)
    }
    if (e.key === 'Escape') setShowSuggestions(false)
  }

  // ===== 浏览（懒加载，统一游标模式） =====
  const browse = async (s, ex) => {
    setLoading(true); setError(null); setGalleries([]); setPage(0); setTotalPages(0)
    setNextCursor(null); setHasMore(true)
    currentSearchRef.current = s
    currentExRef.current = ex
    const isPopular = popularMode && !s
    const filterObj = buildFiltersObj(isPopular)
    currentFiltersRef.current = filterObj
    try {
      const r = await fetchEHGalleries(s, 0, ex, null, filterObj)
      const gals = r.galleries || []
      setGalleries(gals)
      setTotalPages(r.totalPages || 0)
      setHasMore(!!r.nextCursor)
      setNextCursor(r.nextCursor || null)
      // 检查本地是否已下载
      if (gals.length > 0) {
        const gids = gals.map(g => g.gid)
        checkDownloaded(gids).then(downloaded => setLocalGids(new Set(downloaded))).catch(() => {})
      }
    } catch (e) { setError(e.message) }
    setLoading(false)
  }

  // 切换热门模式
  const togglePopular = () => {
    const newMode = !popularMode
    setPopularMode(newMode)
    if (newMode) {
      setSearch('')
      setLoading(true); setError(null); setGalleries([]); setPage(0); setTotalPages(0)
      setNextCursor(null); setHasMore(true)
      currentSearchRef.current = ''
      const filterObj = { popular: true }
      currentFiltersRef.current = filterObj
      fetchEHGalleries('', 0, exhentai, null, filterObj).then(r => {
        setGalleries(r.galleries || [])
        setHasMore(!!r.nextCursor)
        setNextCursor(r.nextCursor || null)
      }).catch(e => setError(e.message))
      .finally(() => setLoading(false))
    }
  }

  const loadMore = async () => {
    if (loadingMore || loading || !hasMore || !nextCursor) return
    setLoadingMore(true)
    try {
      const r = await fetchEHGalleries(currentSearchRef.current, 0, currentExRef.current, nextCursor, currentFiltersRef.current)
      const newItems = r.galleries || []
      if (newItems.length === 0) { setHasMore(false) }
      else {
        setGalleries(prev => [...prev, ...newItems])
        setNextCursor(r.nextCursor || null)
        setHasMore(!!r.nextCursor)
        // 检查新加载的项是否本地已下载
        const gids = newItems.map(g => g.gid)
        checkDownloaded(gids).then(downloaded => {
          setLocalGids(prev => { const s = new Set(prev); downloaded.forEach(d => s.add(d)); return s })
        }).catch(() => {})
      }
    } catch (e) { /* 静默失败 */ }
    setLoadingMore(false)
  }

  // IntersectionObserver：监听底部元素，触发加载更多
  useEffect(() => {
    const el = loadMoreRef.current
    if (!el || galleries.length === 0) return
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) loadMore() },
      { rootMargin: '400px' }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [galleries.length, page, totalPages, nextCursor, hasMore, loading, loadingMore])

  const openDetail = async (gid, token) => {
    setDetailLoading(true)
    try {
      const d = await fetchEHGalleryDetail(gid, token); setDetail(d)
      translateDetailTags(d)  // 异步加载翻译
      loadBlockedTags()
    } catch (e) { setError(e.message) }
    setDetailLoading(false)
  }

  // ===== 在线阅读 =====
  const [readerDetail, setReaderDetail] = useState(null) // 打开阅读器时设置

  const openReader = (d) => {
    setDetail(null)
    setReaderDetail(d)
  }

  // 如果阅读器打开，渲染阅读器组件
  if (readerDetail) {
    return (
      <EhentaiReader
        detail={readerDetail}
        onClose={() => setReaderDetail(null)}
        onError={(msg) => { setError(msg); setReaderDetail(null) }}
      />
    )
  }

  const handleDownload = async (d) => {
    try {
      const coverUrl = d.thumb || ''
      const r = await addDownloadTask(d.gid, d.token, d.title, coverUrl)
      const msg = r.success ? '已加入下载队列' : (r.message || '失败')
      setToast({ type: r.success ? 'success' : 'error', text: msg })
      setTimeout(() => setToast(null), 1500)
    } catch (e) {
      setToast({ type: 'error', text: e.message })
      setTimeout(() => setToast(null), 1500)
    }
  }

  const formatSize = (b) => b > 1e9 ? (b / 1e9).toFixed(1) + ' GB' : b > 1e6 ? (b / 1e6).toFixed(0) + ' MB' : b + ' B'

  // ===== 主界面 =====
  return (
    <div className="container" style={{ display: 'flex', flexDirection: 'column', gap: 0, padding: 'var(--space-4)', minHeight: '100vh' }}>
      {/* 导航栏 — 与本地画廊统一 */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 'var(--space-3)',
        padding: '0 var(--space-4)', height: 'var(--header-height)',
        background: 'var(--surface)', borderBottom: '1px solid var(--divider)',
        flexShrink: 0, marginBottom: 'var(--space-2)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexShrink: 0 }}>
          <Link to="/" className="btn-sm" style={{ textDecoration: 'none', borderColor: 'var(--accent-teal-bg)', color: 'var(--accent-teal)', fontWeight: 'var(--weight-semibold)' }}>📁 本地</Link>
          <span style={{ fontSize: 'var(--text-md)', fontWeight: 'var(--weight-semibold)', color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>🌐 E-Hentai</span>
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ display: 'flex', gap: 'var(--space-1)', flexShrink: 0 }}>
          <button className="btn-sm" onClick={() => setShowCookie(!showCookie)}
            style={{ borderColor: showCookie ? 'var(--accent-teal-bg)' : 'var(--border-input)', color: showCookie ? 'var(--accent-teal)' : 'var(--text-secondary)' }}>Cookie</button>
          <button className="btn-sm" onClick={handleValidate} disabled={cookieValidating}
            style={{ color: 'var(--success)' }}>{cookieValidating ? '...' : '验证'}</button>
          <button className="btn-sm" onClick={() => { setShowBlockedPanel(!showBlockedPanel); loadBlockedTags() }}
            style={{ borderColor: showBlockedPanel ? 'rgba(176,96,96,0.3)' : 'var(--border-input)', color: showBlockedPanel ? 'var(--error)' : 'var(--text-secondary)' }}>
            {blockedTags.length > 0 ? `🚫 ${blockedTags.length}` : '屏蔽'}</button>
        </div>
      </div>

      {/* Cookie 面板 */}
      {showCookie && (
        <div style={{ background: '#1a1a2e', border: '1px solid #2a2a4a', borderRadius: 10, padding: 16, marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
            <span style={{ fontWeight: 600 }}>Cookie</span>
          </div>
          {cookieInfo && <div style={{ fontSize: '0.75rem', color: '#888', marginBottom: 10 }}>当前: {cookieInfo.ipbMemberId} {cookieInfo.ipbPassHash} [{cookieInfo.label}]</div>}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
            {['ipbMemberId','ipbPassHash','igneous','label'].map(k => (
              <div key={k}>
                <label style={{ fontSize: '0.75rem', color: '#888' }}>{k === 'ipbMemberId' ? 'ipb_member_id *' : k === 'ipbPassHash' ? 'ipb_pass_hash *' : k}</label>
                <input value={cookieForm[k]} onChange={e => setCookieForm({ ...cookieForm, [k]: e.target.value })} placeholder={k} style={{ width: '100%' }} />
              </div>
            ))}
          </div>
          {cookieMsg && <div className={`status-msg ${cookieMsg.type}`}>{cookieMsg.text}</div>}
          {validateResult && (
            <div style={{ background: validateResult.loggedIn ? '#064e3b20' : '#7f1d1d20', border: `1px solid ${validateResult.loggedIn ? '#10b98140' : '#ef444440'}`, borderRadius: 6, padding: 8, marginBottom: 8, fontSize: '0.8rem' }}>
              <div style={{ color: validateResult.loggedIn ? '#10b981' : '#f87171' }}>{validateResult.loggedIn ? '✓ 已登录' : '✗ 未登录'}</div>
              {validateResult.exhentai !== undefined && <div style={{ color: validateResult.exhentai ? '#10b981' : '#888' }}>{validateResult.exhentai ? '✓ 里站已开通' : '○ 无里站'}</div>}
              {validateResult.error && <div style={{ color: '#fbbf24', marginTop: 4 }}>{validateResult.error}</div>}
            </div>
          )}
          <button className="btn-primary" onClick={handleSaveCookie} disabled={cookieValidating}>保存</button>
        </div>
      )}

      {/* 屏蔽标签管理面板 */}
      {showBlockedPanel && (
        <div style={{ background: '#1a1a2e', border: '1px solid #ef444440', borderRadius: 10, padding: 14, marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <span style={{ fontWeight: 600, color: '#fca5a5' }}>屏蔽标签管理 ({blockedTags.length})</span>
            <button className="btn-sm" onClick={() => setShowBlockedPanel(false)}>✕</button>
          </div>
          {blockedTags.length === 0 ? (
            <div style={{ fontSize: '0.8rem', color: '#888' }}>暂无屏蔽标签。在画廊详情中点击标签旁的 🚫 即可添加。</div>
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {blockedTags.map(t => (
                <span key={t} style={{
                  padding: '3px 10px', borderRadius: 4, fontSize: '0.72rem',
                  background: '#dc262620', color: '#fca5a5',
                  border: '1px solid #ef444440', display: 'inline-flex', alignItems: 'center', gap: 6
                }}>
                  {t}
                  <span onClick={() => handleUnblockTag(t)} style={{ cursor: 'pointer', color: '#f87171', fontWeight: 600, fontSize: '0.8rem' }}
                    title="移除屏蔽">✕</span>
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 网络状态 */}
      {connectivity && !connectivity.reachable && (
        <div style={{ background: '#7f1d1d20', border: '1px solid #ef444440', borderRadius: 8, padding: 10, marginBottom: 14, fontSize: '0.8rem', color: '#fca5a5' }}>
          ⚠ 无法直接访问 E-Hentai。请在 appsettings.json 中配置代理: "Ehentai": {"{"}"Proxy": "http://127.0.0.1:7890"{"}"}
        </div>
      )}

      {/* 智能搜索栏 */}
      <div style={{ position: 'relative', display: 'flex', gap: 8, marginBottom: 8, width: '100%' }}>
        <div style={{ flex: 1, position: 'relative', minWidth: 0 }}>
          <input ref={searchInputRef}
            value={search} onChange={handleSearchInput} onKeyDown={handleSearchKey}
            placeholder="搜索... 输入中文标签会自动提示 (Enter搜索, Esc关闭提示)"
            style={{ width: '100%', minWidth: '200px', padding: '8px 14px' }}
            onFocus={() => search && setShowSuggestions(tagSuggestions.length > 0)}
            onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
          />
          {showSuggestions && tagSuggestions.length > 0 && (
            <div style={{
              position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50,
              background: '#1a1a2e', border: '1px solid #7c3aed', borderRadius: 8,
              maxHeight: 280, overflowY: 'auto', boxShadow: '0 4px 12px rgba(0,0,0,0.5)'
            }}>
              <div style={{ padding: '4px 12px', fontSize: '0.68rem', color: '#a78bfa', borderBottom: '1px solid #2a2a4a' }}>
                点击替换为 E-Hentai 标签语法 · 共 {tagSuggestions.length} 条
              </div>
              {tagSuggestions.map(t => (
                <div key={t.key} onClick={() => applyTag(t)}
                  style={{
                    padding: '7px 12px', cursor: 'pointer', fontSize: '0.8rem',
                    borderBottom: '1px solid #1a1a3a', display: 'flex', alignItems: 'center', gap: 8,
                    transition: 'background 0.1s'
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = '#2a2a4a'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                  {/* 命名空间标签 */}
                  {t.namespace && (
                    <span style={{
                      flexShrink: 0, padding: '1px 6px', borderRadius: 3,
                      background: '#7c3aed20', color: '#a78bfa',
                      fontSize: '0.65rem', fontWeight: 600, lineHeight: '18px'
                    }}>{t.namespace}</span>
                  )}
                  {/* 标签名（中文翻译优先显示） */}
                  <span style={{ color: '#e0e0e0', fontWeight: 500, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {t.cn || t.tag}
                  </span>
                  {/* 英文原名（有翻译时显示为副文本） */}
                  <span style={{ color: '#666', fontSize: '0.7rem', flexShrink: 0 }}>
                    {t.cn ? t.tag : ''}
                  </span>
                  {/* 搜索语法提示 */}
                  <span style={{ color: '#a78bfa', fontSize: '0.68rem', flexShrink: 0, opacity: 0.7 }}>
                    → {t.ehSyntax}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
        <button className="btn-primary" onClick={() => { setPopularMode(false); browse(search, exhentai) }} disabled={loading}>搜索</button>
        <button className="btn-sm" onClick={togglePopular}
          style={{ borderColor: popularMode ? '#f59e0b' : '#444', color: popularMode ? '#fbbf24' : '#888', fontWeight: popularMode ? 600 : 400 }}>热门</button>
        <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.8rem', color: '#888', cursor: 'pointer', whiteSpace: 'nowrap' }}>
          <input type="checkbox" checked={exhentai} onChange={e => { setExhentai(e.target.checked); setPopularMode(false); browse(search, e.target.checked) }} />里站
        </label>
        <button className="btn-sm" onClick={() => setShowAdvanced(!showAdvanced)}
          style={{ borderColor: showAdvanced ? '#7c3aed' : '#444', color: showAdvanced ? '#a78bfa' : '#888' }}>高级</button>
      </div>

      {/* 高级搜索面板 */}
      {showAdvanced && (
        <div style={{ background: '#1a1a2e', border: '1px solid #2a2a4a', borderRadius: 10, padding: 14, marginBottom: 16, display: 'grid', gap: 12 }}>
          {/* 分类筛选 */}
          <div>
            <div style={{ fontSize: '0.75rem', color: '#888', marginBottom: 6 }}>分类筛选</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {[
                { label: '同人志', bit: 2 }, { label: '漫画', bit: 4 },
                { label: '画师CG', bit: 8 }, { label: '游戏CG', bit: 16 },
                { label: '图集', bit: 32 }, { label: 'Cosplay', bit: 64 },
                { label: '亚洲色情', bit: 128 }, { label: '无H', bit: 256 },
                { label: '西方', bit: 512 }, { label: '杂项', bit: 1 },
              ].map(c => (
                <label key={c.bit} style={{
                  display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer',
                  padding: '3px 10px', borderRadius: 14, fontSize: '0.75rem',
                  background: filters.categoryMask & c.bit ? '#7c3aed30' : '#0f0f1a',
                  border: `1px solid ${filters.categoryMask & c.bit ? '#7c3aed' : '#333'}`,
                  color: filters.categoryMask & c.bit ? '#a78bfa' : '#888',
                  transition: 'all 0.15s'
                }}>
                  <input type="checkbox" checked={!!(filters.categoryMask & c.bit)} onChange={() => toggleCategory(c.bit)} style={{ display: 'none' }} />
                  {c.label}
                </label>
              ))}
            </div>
          </div>

          {/* 搜索范围 */}
          <div>
            <div style={{ fontSize: '0.75rem', color: '#888', marginBottom: 6 }}>搜索范围</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {[
                { label: '名称', bit: 0x1 }, { label: '标签', bit: 0x2 },
                { label: '描述', bit: 0x4 }, { label: '种子名', bit: 0x8 },
                { label: '有种', bit: 0x10 }, { label: '低权重', bit: 0x20 },
                { label: '被踩', bit: 0x40 }, { label: '已删除', bit: 0x80 },
              ].map(c => (
                <label key={c.bit} style={{
                  display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer',
                  padding: '3px 10px', borderRadius: 14, fontSize: '0.75rem',
                  background: filters.advSearch & c.bit ? '#05966920' : '#0f0f1a',
                  border: `1px solid ${filters.advSearch & c.bit ? '#10b981' : '#333'}`,
                  color: filters.advSearch & c.bit ? '#6ee7b7' : '#888',
                  transition: 'all 0.15s'
                }}>
                  <input type="checkbox" checked={!!(filters.advSearch & c.bit)} onChange={() => toggleAdvSearch(c.bit)} style={{ display: 'none' }} />
                  {c.label}
                </label>
              ))}
            </div>
          </div>

          {/* 过滤开关 */}
          <div>
            <div style={{ fontSize: '0.75rem', color: '#888', marginBottom: 6 }}>默认过滤</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {[
                { label: '关闭语言过滤', bit: 0x100 },
                { label: '关闭上传者过滤', bit: 0x200 },
                { label: '关闭标签过滤', bit: 0x400 },
              ].map(c => (
                <label key={c.bit} style={{
                  display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer',
                  padding: '3px 10px', borderRadius: 14, fontSize: '0.75rem',
                  background: filters.advSearch & c.bit ? '#dc262620' : '#0f0f1a',
                  border: `1px solid ${filters.advSearch & c.bit ? '#ef4444' : '#333'}`,
                  color: filters.advSearch & c.bit ? '#fca5a5' : '#888',
                  transition: 'all 0.15s'
                }}>
                  <input type="checkbox" checked={!!(filters.advSearch & c.bit)} onChange={() => toggleAdvSearch(c.bit)} style={{ display: 'none' }} />
                  {c.label}
                </label>
              ))}
            </div>
          </div>

          {/* 评分 & 页数 */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: '0.75rem', color: '#888' }}>最低评分</span>
              <select value={filters.minRating} onChange={e => setFilters(f => ({ ...f, minRating: parseInt(e.target.value) }))}
                style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid #333', background: '#0f0f1a', color: '#e0e0e0', fontSize: '0.8rem' }}>
                <option value={0}>不限</option>
                <option value={2}>★★☆☆☆+</option>
                <option value={3}>★★★☆☆+</option>
                <option value={4}>★★★★☆+</option>
                <option value={5}>★★★★★</option>
              </select>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: '0.75rem', color: '#888' }}>页数范围</span>
              <input type="number" placeholder="最小" value={filters.pageFrom} onChange={e => setFilters(f => ({ ...f, pageFrom: e.target.value }))}
                style={{ width: 60, padding: '4px 8px', borderRadius: 6, border: '1px solid #333', background: '#0f0f1a', color: '#e0e0e0', fontSize: '0.8rem' }} />
              <span style={{ color: '#666' }}>-</span>
              <input type="number" placeholder="最大" value={filters.pageTo} onChange={e => setFilters(f => ({ ...f, pageTo: e.target.value }))}
                style={{ width: 60, padding: '4px 8px', borderRadius: 6, border: '1px solid #333', background: '#0f0f1a', color: '#e0e0e0', fontSize: '0.8rem' }} />
            </div>
            <button className="btn-sm" onClick={() => setFilters({ categoryMask: 0, minRating: 0, pageFrom: '', pageTo: '', advSearch: 0 })}
              style={{ borderColor: '#f59e0b', color: '#fbbf24' }}>重置</button>
          </div>
        </div>
      )}

      {/* Cookie 未配置提示 */}
      {!loading && galleries.length === 0 && !error && !cookieInfo && (
        <div style={{ background: '#7f1d1d20', border: '1px solid #ef444440', borderRadius: 8, padding: 16, marginBottom: 14, fontSize: '0.85rem', color: '#fca5a5', textAlign: 'center' }}>
          <p style={{ margin: '0 0 8px 0', fontWeight: 600 }}>未配置 E-Hentai Cookie</p>
          <p style={{ margin: '0 0 12px 0', fontSize: '0.78rem', color: '#888' }}>请点击上方 <b>🍪 Cookie</b> 按钮配置后再使用在线功能</p>
          <button className="btn-primary" onClick={() => setShowCookie(true)} style={{ fontSize: '0.8rem' }}>配置 Cookie</button>
        </div>
      )}
      {/* 错误 */}
      {error && <div className="status-msg error" style={{ marginBottom: 12 }}>⚠ {error} <button className="btn-sm" onClick={() => browse(search, exhentai)} style={{ marginLeft: 12, borderColor: '#f87171', color: '#fca5a5' }}>重试</button></div>}
      {loading && <div className="loading">加载中...</div>}
      {!loading && galleries.length === 0 && !error && cookieInfo && <div className="empty"><p>输入关键词搜索或浏览</p></div>}

      {/* 画廊列表 — 统一极简卡片风格 */}
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(var(--card-min-width), 1fr))' }}>
        {galleries.map(g => (
          <div key={`${g.gid}_${g.token}`}
            onClick={() => openDetail(g.gid, g.token)}
            className="gallery-card"
            style={{
              background: 'var(--surface-card)', borderRadius: 'var(--radius-md)', overflow: 'hidden', cursor: 'pointer',
              border: `1px solid var(--border-card)`, transition: 'border-color var(--duration-fast) var(--ease-out), transform var(--duration-fast) var(--ease-out)',
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--border-active)'; e.currentTarget.style.transform = 'translateY(-1px)' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-card)'; e.currentTarget.style.transform = 'none' }}>
            {/* 封面区 */}
            <div style={{ position: 'relative', width: '100%', paddingBottom: '138%', background: 'var(--surface-high)' }}>
              {g.thumbUrl ? (
                <img src={getEHImageProxyUrl(g.thumbUrl)} alt={g.title || ''}
                  style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: 0, transition: 'opacity var(--duration-normal) var(--ease-out)' }}
                  loading="lazy"
                  onLoad={e => { e.target.style.opacity = '1' }}
                  onError={e => { e.target.style.display = 'none' }} />
              ) : (
                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span style={{ fontSize: '2rem', opacity: 0.15 }}>📖</span>
                </div>
              )}
              {/* 已下载角标 */}
              {localGids.has(g.gid) && (
                <div className="badge" style={{ position: 'absolute', top: 6, left: 6, zIndex: 5, background: 'rgba(107,139,107,0.85)', color: '#fff', borderColor: 'transparent' }}>
                  已下载
                </div>
              )}
              {/* Hover 操作层 — 底部毛玻璃按钮组 */}
              <div className="gallery-hover-overlay" style={{ position: 'absolute', inset: 0, display: 'none', alignItems: 'flex-end', justifyContent: 'center', gap: 'var(--space-2)', padding: 'var(--space-2)', background: 'linear-gradient(transparent 60%, rgba(0,0,0,0.5))', zIndex: 5 }}>
                <button onClick={(e) => { e.stopPropagation(); openDetail(g.gid, g.token) }}
                  style={{ padding: '4px 10px', borderRadius: 'var(--radius-sm)', border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(0,0,0,0.6)', color: '#fff', fontSize: 'var(--text-2xs)', fontWeight: 'var(--weight-semibold)', cursor: 'pointer', backdropFilter: 'blur(6px)' }}
                  onMouseEnter={e2 => { e2.currentTarget.style.background = 'rgba(139,122,160,0.35)' }}
                  onMouseLeave={e2 => { e2.currentTarget.style.background = 'rgba(0,0,0,0.6)' }}>详情</button>
                {localGids.has(g.gid) ? (
                  <button style={{ padding: '4px 10px', borderRadius: 'var(--radius-sm)', border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(107,139,107,0.45)', color: '#fff', fontSize: 'var(--text-2xs)', fontWeight: 'var(--weight-semibold)', cursor: 'default' }}>已下载</button>
                ) : (
                  <button onClick={(e) => { e.stopPropagation(); handleDownload({ gid: g.gid, token: g.token, title: g.title }) }}
                    style={{ padding: '4px 10px', borderRadius: 'var(--radius-sm)', border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(0,0,0,0.6)', color: '#fff', fontSize: 'var(--text-2xs)', fontWeight: 'var(--weight-semibold)', cursor: 'pointer', backdropFilter: 'blur(6px)' }}
                    onMouseEnter={e2 => { e2.currentTarget.style.background = 'rgba(160,128,80,0.35)' }}
                    onMouseLeave={e2 => { e2.currentTarget.style.background = 'rgba(0,0,0,0.6)' }}>下载</button>
                )}
              </div>
            </div>
            <div style={{ padding: '6px 8px 8px' }}>
              <div title={g.title || `#${g.gid}`} style={{ fontSize: 'var(--text-xs)', lineHeight: 1.4, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', color: 'var(--text-primary)', fontWeight: 'var(--weight-medium)', userSelect: 'none' }}>
                {g.title || `#${g.gid}`}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 'var(--space-1)', color: 'var(--text-muted)', fontSize: 'var(--text-2xs)' }}>
                <span style={{ color: 'var(--warning)' }}>{g.rating > 0 ? '★ ' + g.rating.toFixed(1) : ''}</span>
                {g.fileCount > 0 && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-3xs)' }}>{g.fileCount}P</span>}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* 懒加载触发器 */}
      {galleries.length > 0 && (
        <div ref={loadMoreRef} style={{ textAlign: 'center', padding: '24px 0', color: '#888', fontSize: '0.85rem' }}>
          {loadingMore ? (
            <span>加载中...</span>
          ) : !hasMore ? (
            <span>已显示全部 {galleries.length} 条结果</span>
          ) : (
            <span>向下滚动加载更多</span>
          )}
        </div>
      )}

      {/* 详情弹窗 — 对标 EhViewer 布局 */}
      {detailLoading && <div className="modal-overlay"><div className="modal"><div className="loading">加载详情...</div></div></div>}
      {detail && !detailLoading && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setDetail(null) }}>
          <div className="modal" style={{ maxWidth: 680, maxHeight: '85vh', overflowY: 'auto', padding: 0 }}>
            {/* 头部：封面 + 标题 + 元信息 */}
            <div style={{ position: 'relative', background: 'linear-gradient(180deg, #1a1a3a 0%, #0f0f1a 100%)', padding: '20px 24px 16px', borderBottom: '1px solid #2a2a4a' }}>
              <button className="btn-sm" onClick={() => setDetail(null)} style={{ position: 'absolute', top: 10, right: 10, border: 'none', color: '#888', fontSize: '1.1rem' }}>✕</button>
              <div style={{ display: 'flex', gap: 16 }}>
                {/* 封面 */}
                <div style={{ flexShrink: 0, width: 140, borderRadius: 8, overflow: 'hidden', border: '1px solid #2a2a4a', background: '#1a1a2e' }}>
                  {detail.thumbUrl ? (
                    <img src={getEHImageProxyUrl(detail.thumbUrl)} alt="" style={{ width: '100%', display: 'block' }} />
                  ) : (
                    <div style={{ width: '100%', paddingBottom: '140%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <span style={{ fontSize: '2rem', opacity: 0.2 }}>📖</span>
                    </div>
                  )}
                </div>
                {/* 标题 & 元信息 */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <h3 title={detail.title} style={{ margin: '0 0 4px', fontSize: '1rem', lineHeight: 1.4, color: '#e0e0e0', fontWeight: 600 }}>{detail.title}</h3>
                  {detail.titleJpn && <div style={{ fontSize: '0.8rem', color: '#888', marginBottom: 8 }}>{detail.titleJpn}</div>}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                    <span style={{ padding: '2px 10px', borderRadius: 10, fontSize: '0.72rem', fontWeight: 600,
                      background: getCategoryColor(detail.category), color: '#fff' }}>{detail.category}</span>
                    {detail.language && <span style={{ padding: '2px 10px', borderRadius: 10, fontSize: '0.72rem',
                      background: '#2a2a4a', color: '#aaa' }}>{detail.language}</span>}
                    {detail.favoriteCount > 0 && <span style={{ padding: '2px 10px', borderRadius: 10, fontSize: '0.72rem',
                      background: '#f59e0b20', color: '#fbbf24', border: '1px solid #f59e0b40' }}>♥ {detail.favoriteCount}</span>}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#888', lineHeight: 1.6 }}>
                    <div>上传者: <span style={{ color: '#a78bfa' }}>{detail.uploader}</span></div>
                    <div>发布: {detail.posted > 0 ? new Date(detail.posted * 1000).toLocaleDateString('zh-CN') : '-'}</div>
                    {detail.visible && <div>可见性: {detail.visible}</div>}
                    {detail.parentGallery && <div>父画廊: <a href={detail.parentGallery} target="_blank" rel="noreferrer" style={{ color: '#a78bfa', fontSize: '0.7rem' }}>查看</a></div>}
                  </div>
                </div>
              </div>
            </div>

            {/* 信息表：语言 | 页数 | 大小 */}
            <div style={{ padding: '12px 24px', borderBottom: '1px solid #1a1a3a', display: 'flex', gap: 24, flexWrap: 'wrap' }}>
              {[
                { label: '页数', value: detail.fileCount },
                { label: '大小', value: formatSize(detail.fileSize) },
                { label: '评分', value: `${detail.rating}${detail.ratingCount > 0 ? ` (${detail.ratingCount})` : ''}` },
                { label: '语言', value: detail.language || '-' },
                { label: '种子', value: detail.torrentCount > 0 ? detail.torrentCount : '-' },
              ].map((m, i) => (
                <div key={i} style={{ textAlign: 'center', minWidth: 50 }}>
                  <div style={{ fontSize: '0.65rem', color: '#666', textTransform: 'uppercase', marginBottom: 2 }}>{m.label}</div>
                  <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#ccc' }}>{m.value}</div>
                </div>
              ))}
            </div>

            {/* 标签分组 — 点击弹出操作条 */}
            {detail.tagGroups && detail.tagGroups.length > 0 && (
              <div style={{ padding: '12px 24px', borderBottom: '1px solid #1a1a3a' }}>
                {detail.tagGroups.map((grp, gi) => {
                  const nsCN = nsTranslations[grp.namespace]
                  return (
                  <div key={gi} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 8, position: 'relative' }}>
                    <span style={{
                      flexShrink: 0, padding: '2px 10px', borderRadius: 4,
                      background: '#7c3aed20', color: '#a78bfa',
                      fontSize: '0.7rem', fontWeight: 600, lineHeight: '20px',
                      marginTop: 2
                    }}>{nsCN || grp.namespace}</span>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, flex: 1 }}>
                      {grp.tags.map((t, ti) => {
                        const key = `${grp.namespace}:${t}`
                        const cn = tagTranslations[key]
                        const blocked = blockedTags.includes(key)
                        const isActive = activeTag?.key === key
                        return (
                        <span key={ti} style={{ position: 'relative' }}>
                          {/* 操作条 — 点击标签后在上方弹出 */}
                          {isActive && (
                            <div style={{
                              position: 'absolute', bottom: '100%', left: '50%', transform: 'translateX(-50%)',
                              marginBottom: 4, display: 'flex', gap: 2,
                              background: '#1e1e36', border: '1px solid #7c3aed', borderRadius: 6,
                              padding: '2px 4px', zIndex: 10, whiteSpace: 'nowrap',
                              boxShadow: '0 2px 8px rgba(0,0,0,0.5)'
                            }}>
                              <button onClick={(e) => {
                                e.stopPropagation()
                                const tagSearch = `${grp.namespace}:"${t}"`
                                setSearch(prev => prev ? `${tagSearch} ${prev}` : tagSearch)
                                setActiveTag(null); setDetail(null)
                              }}
                                style={{
                                  padding: '2px 10px', border: 'none', borderRadius: 4,
                                  background: '#7c3aed20', color: '#a78bfa', cursor: 'pointer',
                                  fontSize: '0.68rem', fontWeight: 600
                                }}
                                title="添加此标签到搜索框">🔍 搜索</button>
                              <button onClick={(e) => {
                                e.stopPropagation()
                                handleBlockTag(grp.namespace, t)
                                setActiveTag(null)
                              }}
                                style={{
                                  padding: '2px 10px', border: 'none', borderRadius: 4,
                                  background: '#ef444420', color: '#fca5a5', cursor: 'pointer',
                                  fontSize: '0.68rem', fontWeight: 600
                                }}
                                title="屏蔽此标签">🚫 屏蔽</button>
                            </div>
                          )}
                          <span title={cn || t} onClick={(e) => {
                            e.stopPropagation()
                            setActiveTag(isActive ? null : { namespace: grp.namespace, tag: t, key })
                          }} style={{
                            padding: '2px 10px', borderRadius: 4,
                            background: blocked ? '#dc262620' : (isActive ? '#7c3aed20' : '#1a1a3a'),
                            color: blocked ? '#fca5a5' : (isActive ? '#a78bfa' : '#ccc'),
                            fontSize: '0.72rem', border: `1px solid ${blocked ? '#ef4444' : (isActive ? '#7c3aed' : '#2a2a4a')}`,
                            cursor: 'pointer', transition: 'all 0.15s',
                            display: 'inline-block',
                          }}
                          onMouseEnter={e => { if (!blocked && !isActive) { e.target.style.background = '#2a2a4a'; e.target.style.borderColor = '#7c3aed' } }}
                          onMouseLeave={e => { if (!blocked && !isActive) { e.target.style.background = '#1a1a3a'; e.target.style.borderColor = '#2a2a4a' } }}
                          >{cn || t}</span>
                        </span>
                      )})}
                    </div>
                  </div>
                )})}
              </div>
            )}

            {/* 操作按钮 */}
            <div style={{ padding: '14px 24px', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <a href={`https://${detail.isExhentai ? 'exhentai' : 'e-hentai'}.org/g/${detail.gid}/${detail.token}/`} target="_blank" rel="noreferrer"
                className="btn-sm" style={{ textDecoration: 'none', color: '#a78bfa', borderColor: '#7c3aed' }}>🌐 在 {detail.isExhentai ? 'ExHentai' : 'E-Hentai'} 打开</a>
              <button className="btn-sm" onClick={() => openReader(detail)} style={{ borderColor: '#10b981', color: '#6ee7b7' }}>📖 在线阅读</button>
              {localGids.has(detail.gid) ? (
                <button className="btn-sm" disabled style={{ borderColor: '#10b981', color: '#6ee7b7', opacity: 0.7 }}>✅ 已下载</button>
              ) : (
                <button className="btn-sm" onClick={() => handleDownload(detail)} style={{ borderColor: '#f59e0b', color: '#fbbf24' }}>⬇ 下载</button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 回到顶部 */}
      <ScrollToTop threshold={600} />

      {/* Toast 通知 */}
      {toast && (
        <div style={{
          position: 'fixed', top: 20, left: '50%', transform: 'translateX(-50%)', zIndex: 300,
          padding: '10px 24px', borderRadius: 10,
          background: toast.type === 'success' ? '#059669' : '#dc2626',
          color: '#fff', fontSize: '0.9rem', fontWeight: 600,
          boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
          animation: 'toast-in 0.3s ease, toast-out 0.3s ease 1.2s forwards',
          pointerEvents: 'none'
        }}>
          {toast.type === 'success' ? '✅ ' : '❌ '}{toast.text}
        </div>
      )}

    </div>
  )
}
