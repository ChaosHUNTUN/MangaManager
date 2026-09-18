import { useState, useEffect, useRef, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { Download } from 'lucide-react'
import ScrollToTop from '../components/ScrollToTop'
import { getEHImageProxyUrl, API_BASE } from '../api'
import { getCategoryColorDetail, CATEGORY_COLORS_DETAIL as CATEGORY_COLORS } from '../constants/colors'
import { formatSize } from '../utils/format'
import useEHCookie from '../hooks/useEHCookie'
import useEHBrowse from '../hooks/useEHBrowse'
import useEHSearch from '../hooks/useEHSearch'
import useEHDetail from '../hooks/useEHDetail'
import useEHInit from '../hooks/useEHInit'
import useIsMobile from '../hooks/useIsMobile'
const getCategoryColor = getCategoryColorDetail

// 一键导出书签：在已登录的 e-hentai.org 页面点击，自动复制 ipb_member_id / ipb_pass_hash / igneous 为 JSON
const BOOKMARKLET = "javascript:(()=>{const g=n=>{const m=document.cookie.split(';').map(x=>x.trim()).find(x=>x.startsWith(n+'='));return m?decodeURIComponent(m.slice(n.length+1)):''};const o={ipb_member_id:g('ipb_member_id'),ipb_pass_hash:g('ipb_pass_hash'),igneous:g('igneous')};const t=JSON.stringify(o);navigator.clipboard.writeText(t).then(()=>alert('已复制 EH Cookie，回 MangaManager 粘贴导入'))['catch'](()=>prompt('手动复制：',t))})()"

export default function EHentai() {
  const isMobile = useIsMobile()

  // ─── Toast ───
  const [toast, setToast] = useState(null)
  const toastTimerRef = useRef(null)
  const showToast = (t) => { if (toastTimerRef.current) clearTimeout(toastTimerRef.current); setToast(t); toastTimerRef.current = setTimeout(() => setToast(null), 1500) }
  useEffect(() => () => { if (toastTimerRef.current) clearTimeout(toastTimerRef.current) }, [])

  // ─── 业务 Hooks（全部在 JSX 之前、一次性调用完毕） ───
  const cookieHook = useEHCookie({ onCookieSaved: () => { setPopularMode(true); browse('', true, true) } })
  const { showCookie, setShowCookie, cookieForm, setCookieForm, rawCookie, setRawCookie, cookieInfo, cookieValidating, validateResult, cookieMsg, connectivity, handleSaveCookie, handleValidate, handleImportRaw, handleImportClipboard } = cookieHook

  // 登录状态徽章
  const cookieStatus = !cookieInfo?.ipbMemberId ? { color: '#888', text: '未配置' }
    : !validateResult ? { color: '#888', text: '验证中…' }
    : !validateResult.loggedIn ? { color: '#ef4444', text: 'Cookie 失效' }
    : validateResult.exhentai ? { color: '#10b981', text: '里站可用' }
    : { color: '#f59e0b', text: '仅表站' }

  const copyBookmarklet = async () => {
    try { await navigator.clipboard.writeText(BOOKMARKLET); showToast('脚本已复制，去 EH 页面新建书签粘贴') }
    catch { showToast('复制失败，请手动选择复制') }
  }

  const browseHook = useEHBrowse()
  const { galleries, search, setSearch, totalPages, hasMore, loading, loadingMore, error, setError,
    exhentai, setExhentai, popularMode, setPopularMode, loadMoreRef,
    localGids, setLocalGids, downloadingGids, setDownloadingGids,
    filters, setFilters, toggleCategory, toggleAdvSearch, showAdvanced, setShowAdvanced,
    browse, goPopular } = browseHook

  const searchHook = useEHSearch({ search, setSearch, browse, exhentai, setPopularMode })
  const { tagSuggestions, showSuggestions, setShowSuggestions, searchInputRef, handleSearchInput, handleCompositionStart, handleCompositionEnd, applyTag, handleSearchKey } = searchHook

  const detailHook = useEHDetail({ showToast, localGids, setLocalGids, setDownloadingGids, setError })
  const { detail, setDetail, detailLoading, tagTranslations, nsTranslations,
    activeTag, setActiveTag, blockedTags, showBlockedPanel, setShowBlockedPanel,
    loadBlockedTags, handleBlockTag, handleUnblockTag, openDetail, openDetailViaApi,
    handleDownload } = detailHook

  // 初始加载（独立 Hook，不污染组件体）
  useEHInit({ browse, openDetailViaApi, cookieInfo })

  // ─── 供 JSX 使用的稳定 handler（封装复杂参数构造） ───
  const handleDownloadCard = useCallback((e, g) => { e.stopPropagation(); handleDownload({ gid: g.gid, token: g.token, title: g.title, thumb: g.thumbUrl }) }, [handleDownload])
  const handleOpenDetail = useCallback((g) => openDetail(g.gid, g.token), [openDetail])

  // 误触防护：滚动（含惯性滚动）过程中或刚结束时轻触卡片会触发 click，
  // 移动端很容易在滑动列表时误开详情，这里按"最近是否滚动过"过滤
  const lastScrollRef = useRef(0)
  useEffect(() => {
    const onScroll = () => { lastScrollRef.current = Date.now() }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])
  const handleCardTap = useCallback((g) => {
    if (isMobile && Date.now() - lastScrollRef.current < 250) return
    handleOpenDetail(g)
  }, [isMobile, handleOpenDetail])
  // 下载按钮同样防护：滑动列表时误触会直接进下载队列，代价比误开详情更高
  const handleDownloadTap = useCallback((e, g) => {
    e.stopPropagation()
    if (isMobile && Date.now() - lastScrollRef.current < 250) return
    handleDownloadCard(e, g)
  }, [isMobile, handleDownloadCard])
  const toggleBlockedPanel = useCallback(() => { setShowBlockedPanel(v => !v); loadBlockedTags() }, [loadBlockedTags, setShowBlockedPanel])
  const toggleExhentai = useCallback((checked) => { setExhentai(checked); setPopularMode(false); browse(search, checked) }, [setExhentai, setPopularMode, browse, search])
  const resetFilters = useCallback(() => setFilters({ categoryMask: 0, minRating: 0, pageFrom: '', pageTo: '', advSearch: 0 }), [setFilters])
  const doSearch = useCallback(() => { setPopularMode(false); browse(search, exhentai) }, [setPopularMode, browse, search, exhentai])
  const retryBrowse = useCallback(() => browse(search, exhentai), [browse, search, exhentai])
  const closeDetailModal = useCallback((e) => { if (e.target === e.currentTarget) setDetail(null) }, [setDetail])

  // ══════════════════════════════════════════
  // 以下全部为 UI 渲染（纯 JSX，零业务逻辑）
  // ══════════════════════════════════════════
  return (
      <div className="container eh-container" style={{ display: 'flex', flexDirection: 'column', gap: 0, padding: 'var(--space-4)', minHeight: '100vh' }}>
      {/* 导航栏 */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 'var(--space-3)', padding: '0 var(--space-4)', height: 'var(--header-height)',
        background: 'var(--surface)', borderBottom: '1px solid var(--divider)', flexShrink: 0, marginBottom: 'var(--space-2)',
      }}>
        {/* 移动端有底部标签栏，本地入口与标题都不再重复显示 */}
        {!isMobile && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexShrink: 0 }}>
            <Link to="/" className="btn-sm" style={{ textDecoration: 'none', borderColor: 'var(--accent-teal-bg)', color: 'var(--accent-teal)', fontWeight: 'var(--weight-semibold)' }}>📁 本地</Link>
            <span style={{ fontSize: 'var(--text-md)', fontWeight: 'var(--weight-semibold)', color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>🌐 E-Hentai</span>
          </div>
        )}
        <div style={{ flex: 1 }} />
        {/* 账号相关（Cookie 状态 / 配置 / 验证 / 屏蔽）：移动端不管理，统一在「设置」页处理 */}
        {!isMobile && (
        <div style={{ display: 'flex', gap: 'var(--space-1)', flexShrink: 0 }}>
          <span style={{ fontSize: '0.72rem', color: cookieStatus.color, display: 'flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: cookieStatus.color, display: 'inline-block' }} />
            {cookieStatus.text}
          </span>
          <button className="btn-sm" onClick={() => setShowCookie(!showCookie)}
            style={{ borderColor: showCookie ? 'var(--accent-teal-bg)' : 'var(--border-input)', color: showCookie ? 'var(--accent-teal)' : 'var(--text-secondary)' }}>Cookie</button>
          <button className="btn-sm" onClick={handleValidate} disabled={cookieValidating}
            style={{ color: 'var(--success)' }}>{cookieValidating ? '...' : '验证'}</button>
          <button className="btn-sm" onClick={toggleBlockedPanel}
            style={{ borderColor: showBlockedPanel ? 'rgba(176,96,96,0.3)' : 'var(--border-input)', color: showBlockedPanel ? 'var(--error)' : 'var(--text-secondary)' }}>
            {blockedTags.length > 0 ? `🚫 ${blockedTags.length}` : '屏蔽'}</button>
        </div>
        )}
      </div>

      {/* Cookie 面板 */}
      {!isMobile && showCookie && (
        <div style={{ background: '#1a1a2e', border: '1px solid #2a2a4a', borderRadius: 10, padding: 16, marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
            <span style={{ fontWeight: 600 }}>Cookie</span>
          </div>
          {cookieInfo && <div style={{ fontSize: '0.75rem', color: '#888', marginBottom: 10 }}>当前: {cookieInfo.ipbMemberId} {cookieInfo.ipbPassHash} [{cookieInfo.label}]</div>}
          {/* 快速导入 */}
          <div style={{ marginBottom: 10, padding: 10, background: '#14142a', border: '1px solid #2a2a4a', borderRadius: 8 }}>
            <div style={{ fontSize: '0.78rem', color: '#aaa', marginBottom: 6 }}>⚡ 快速导入（自动识别 Cookie 串 / Netscape 导出 / JSON）</div>
            <textarea rows={2} value={rawCookie} onChange={e => setRawCookie(e.target.value)}
              placeholder={'例如：ipb_member_id=xxxx; ipb_pass_hash=yyyy; igneous=zzzz'}
              style={{ width: '100%', background: '#0f0f22', color: '#ddd', border: '1px solid #333', borderRadius: 6, padding: 6, fontSize: '0.75rem', fontFamily: 'monospace', boxSizing: 'border-box' }} />
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button className="btn-sm" onClick={handleImportClipboard}>📋 从剪贴板导入</button>
              <button className="btn-sm" onClick={handleImportRaw}>解析导入</button>
            </div>
          </div>
          {/* 一键导出书签 */}
          <details style={{ marginBottom: 10, fontSize: '0.78rem', color: '#999' }}>
            <summary style={{ cursor: 'pointer' }}>🔑 一键导出书签（推荐）</summary>
            <div style={{ marginTop: 8, background: '#14142a', border: '1px solid #2a2a4a', borderRadius: 8, padding: 10 }}>
              <div style={{ marginBottom: 6 }}>1. 浏览器登录 <b>e-hentai.org</b>；2. 新建书签，网址粘贴下方代码；3. 在 EH 页面点击书签 → 自动复制；4. 回本页点「从剪贴板导入」→ 保存。</div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <code style={{ flex: 1, fontSize: '0.65rem', wordBreak: 'break-all', background: '#0f0f22', padding: 6, borderRadius: 6, color: '#7dd3fc', lineHeight: 1.5 }}>{BOOKMARKLET}</code>
                <button className="btn-sm" onClick={copyBookmarklet}>复制</button>
              </div>
            </div>
          </details>
          <div className="eh-cookie-form" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
            {['ipbMemberId','ipbPassHash','igneous','label'].map(k => (
              <div key={k}>
                <label style={{ fontSize: '0.75rem', color: '#888' }}>{k === 'ipbMemberId' ? 'ipb_member_id *' : k === 'ipbPassHash' ? 'ipb_pass_hash *' : k}</label>
                <input value={cookieForm[k]} onChange={e => setCookieForm(f => ({ ...f, [k]: e.target.value }))} placeholder={k} style={{ width: '100%' }} />
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
                <span key={t} style={{ padding: '3px 10px', borderRadius: 4, fontSize: '0.72rem', background: '#dc262620', color: '#fca5a5', border: '1px solid #ef444440', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  {t}
                  <span onClick={() => handleUnblockTag(t)} style={{ cursor: 'pointer', color: '#f87171', fontWeight: 600, fontSize: '0.8rem' }} title="移除屏蔽">✕</span>
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 网络状态 */}
      {connectivity && !connectivity.reachable && (
        <div style={{ background: '#7f1d1d20', border: '1px solid #ef444440', borderRadius: 8, padding: 10, marginBottom: 14, fontSize: '0.8rem', color: '#fca5a5' }}>
          ⚠ 无法访问 E-Hentai（已按配置的代理检测）。请检查 appsettings.json 的 "Ehentai": {"{"}"Proxy"{"}"} 配置与代理是否在运行
        </div>
      )}

      {/* 智能搜索栏 */}
      <div className="eh-searchbar" style={{ position: 'relative', display: 'flex', gap: 8, marginBottom: 8, width: '100%' }}>
        <div style={{ flex: 1, position: 'relative', minWidth: 0 }}>
          <input ref={searchInputRef} defaultValue={search} onChange={handleSearchInput} onKeyDown={handleSearchKey}
            onCompositionStart={handleCompositionStart} onCompositionEnd={handleCompositionEnd}
            placeholder="搜索... 输入中文标签会自动提示 (Enter搜索, Esc关闭提示)"
            style={{ width: '100%', minWidth: '200px', padding: '8px 14px' }}
            onFocus={() => search && setShowSuggestions(tagSuggestions.length > 0)}
            onBlur={() => setTimeout(() => setShowSuggestions(false), 200)} />
          {showSuggestions && tagSuggestions.length > 0 && (
            <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50, background: '#1a1a2e', border: '1px solid #7c3aed', borderRadius: 8, maxHeight: 280, overflowY: 'auto', boxShadow: '0 4px 12px rgba(0,0,0,0.5)' }}>
              <div style={{ padding: '4px 12px', fontSize: '0.68rem', color: '#a78bfa', borderBottom: '1px solid #2a2a4a' }}>
                点击替换为 E-Hentai 标签语法 · 共 {tagSuggestions.length} 条
              </div>
              {tagSuggestions.map(t => (
                <div key={t.key} onClick={() => applyTag(t)}
                  style={{ padding: '7px 12px', cursor: 'pointer', fontSize: '0.8rem', borderBottom: '1px solid #1a1a3a', display: 'flex', alignItems: 'center', gap: 8, transition: 'background 0.1s' }}
                  onMouseEnter={e => e.currentTarget.style.background = '#2a2a4a'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                  {t.namespace && <span style={{ flexShrink: 0, padding: '1px 6px', borderRadius: 3, background: '#7c3aed20', color: '#a78bfa', fontSize: '0.65rem', fontWeight: 600, lineHeight: '18px' }}>{t.namespace}</span>}
                  <span style={{ color: '#e0e0e0', fontWeight: 500, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.cn || t.tag}</span>
                  <span style={{ color: '#666', fontSize: '0.7rem', flexShrink: 0 }}>{t.cn ? t.tag : ''}</span>
                  <span style={{ color: '#a78bfa', fontSize: '0.68rem', flexShrink: 0, opacity: 0.7 }}>→ {t.ehSyntax}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        <button className="btn-primary" onClick={doSearch} disabled={loading}>搜索</button>
        <button className="btn-sm" onClick={goPopular}>热门</button>
        <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.8rem', color: '#888', cursor: 'pointer', whiteSpace: 'nowrap' }}>
          <input type="checkbox" checked={exhentai} onChange={e => toggleExhentai(e.target.checked)} />里站
        </label>
        <button className="btn-sm" onClick={() => setShowAdvanced(!showAdvanced)} style={{ borderColor: showAdvanced ? '#7c3aed' : '#444', color: showAdvanced ? '#a78bfa' : '#888' }}>高级</button>
      </div>

      {/* 高级搜索面板 */}
      {showAdvanced && (
        <div style={{ background: '#1a1a2e', border: '1px solid #2a2a4a', borderRadius: 10, padding: 14, marginBottom: 16, display: 'grid', gap: 12 }}>
          <div>
            <div style={{ fontSize: '0.75rem', color: '#888', marginBottom: 6 }}>分类筛选</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {[{ label: '同人志', bit: 2 }, { label: '漫画', bit: 4 }, { label: '画师CG', bit: 8 }, { label: '游戏CG', bit: 16 }, { label: '图集', bit: 32 }, { label: 'Cosplay', bit: 64 }, { label: '亚洲色情', bit: 128 }, { label: '无H', bit: 256 }, { label: '西方', bit: 512 }, { label: '杂项', bit: 1 }]
                .map(c => (
                  <label key={c.bit} style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer', padding: '3px 10px', borderRadius: 14, fontSize: '0.75rem', background: filters.categoryMask & c.bit ? '#7c3aed30' : '#0f0f1a', border: `1px solid ${filters.categoryMask & c.bit ? '#7c3aed' : '#333'}`, color: filters.categoryMask & c.bit ? '#a78bfa' : '#888', transition: 'all 0.15s' }}>
                    <input type="checkbox" checked={!!(filters.categoryMask & c.bit)} onChange={() => toggleCategory(c.bit)} style={{ display: 'none' }} />{c.label}
                  </label>
                ))}
            </div>
          </div>
          <div>
            <div style={{ fontSize: '0.75rem', color: '#888', marginBottom: 6 }}>搜索范围</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {[{ label: '名称', bit: 0x1 }, { label: '标签', bit: 0x2 }, { label: '描述', bit: 0x4 }, { label: '种子名', bit: 0x8 }, { label: '有种', bit: 0x10 }, { label: '低权重', bit: 0x20 }, { label: '被踩', bit: 0x40 }, { label: '已删除', bit: 0x80 }]
                .map(c => (
                  <label key={c.bit} style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer', padding: '3px 10px', borderRadius: 14, fontSize: '0.75rem', background: filters.advSearch & c.bit ? '#05966920' : '#0f0f1a', border: `1px solid ${filters.advSearch & c.bit ? '#10b981' : '#333'}`, color: filters.advSearch & c.bit ? '#6ee7b7' : '#888', transition: 'all 0.15s' }}>
                    <input type="checkbox" checked={!!(filters.advSearch & c.bit)} onChange={() => toggleAdvSearch(c.bit)} style={{ display: 'none' }} />{c.label}
                  </label>
                ))}
            </div>
          </div>
          <div>
            <div style={{ fontSize: '0.75rem', color: '#888', marginBottom: 6 }}>默认过滤</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {[{ label: '关闭语言过滤', bit: 0x100 }, { label: '关闭上传者过滤', bit: 0x200 }, { label: '关闭标签过滤', bit: 0x400 }]
                .map(c => (
                  <label key={c.bit} style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer', padding: '3px 10px', borderRadius: 14, fontSize: '0.75rem', background: filters.advSearch & c.bit ? '#dc262620' : '#0f0f1a', border: `1px solid ${filters.advSearch & c.bit ? '#ef4444' : '#333'}`, color: filters.advSearch & c.bit ? '#fca5a5' : '#888', transition: 'all 0.15s' }}>
                    <input type="checkbox" checked={!!(filters.advSearch & c.bit)} onChange={() => toggleAdvSearch(c.bit)} style={{ display: 'none' }} />{c.label}
                  </label>
                ))}
            </div>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: '0.75rem', color: '#888' }}>最低评分</span>
              <select value={filters.minRating} onChange={e => setFilters(f => ({ ...f, minRating: parseInt(e.target.value) }))}
                style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid #333', background: '#0f0f1a', color: '#e0e0e0', fontSize: '0.8rem' }}>
                <option value={0}>不限</option><option value={2}>★★☆☆☆+</option><option value={3}>★★★☆☆+</option><option value={4}>★★★★☆+</option><option value={5}>★★★★★</option>
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
            <button className="btn-sm" onClick={resetFilters}
              style={{ borderColor: '#f59e0b', color: '#fbbf24' }}>重置</button>
          </div>
        </div>
      )}

      {/* Cookie 未配置提示 */}
      {!loading && galleries.length === 0 && !error && !cookieInfo && (
        <div style={{ background: '#7f1d1d20', border: '1px solid #ef444440', borderRadius: 8, padding: 16, marginBottom: 14, fontSize: '0.85rem', color: '#fca5a5', textAlign: 'center' }}>
          <p style={{ margin: '0 0 8px 0', fontWeight: 600 }}>未配置 E-Hentai Cookie</p>
          <p style={{ margin: '0 0 12px 0', fontSize: '0.78rem', color: '#888' }}>
            {isMobile ? '请在「设置」页配置后再使用在线功能' : <>请点击上方 <b>🍪 Cookie</b> 按钮配置后再使用在线功能</>}
          </p>
          {isMobile
            ? <Link to="/settings" className="btn-primary" style={{ fontSize: '0.8rem', textDecoration: 'none', display: 'inline-block' }}>前往设置</Link>
            : <button className="btn-primary" onClick={() => setShowCookie(true)} style={{ fontSize: '0.8rem' }}>配置 Cookie</button>}
        </div>
      )}
      {error && <div className="status-msg error" style={{ marginBottom: 12 }}>⚠ {error} <button className="btn-sm" onClick={retryBrowse} style={{ marginLeft: 12, borderColor: '#f87171', color: '#fca5a5' }}>重试</button></div>}
      {loading && <div className="loading">加载中...</div>}
      {!loading && galleries.length === 0 && !error && cookieInfo && <div className="empty"><p>输入关键词搜索或浏览</p></div>}

      {/* 画廊列表 */}
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(var(--card-min-width), 1fr))' }}>
        {galleries.map(g => (
          <div key={`${g.gid}_${g.token}`} onClick={() => handleCardTap(g)} className="gallery-card"
            style={{ background: 'var(--surface-card)', borderRadius: 'var(--radius-md)', overflow: 'hidden', cursor: 'pointer', border: '1px solid var(--border-card)', transition: 'border-color var(--duration-fast) var(--ease-out), transform var(--duration-fast) var(--ease-out)' }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--border-active)'; e.currentTarget.style.transform = 'translateY(-1px)' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-card)'; e.currentTarget.style.transform = 'none' }}>
            <div style={{ position: 'relative', width: '100%', paddingBottom: '138%', background: 'var(--surface-high)' }}>
              {g.thumbUrl ? (
                <img src={getEHImageProxyUrl(g.thumbUrl)} alt={g.title || ''} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: 0, transition: 'opacity var(--duration-normal) var(--ease-out)' }}
                  loading="lazy"
                  onLoad={e => {
                    const t = e.target
                    t.style.opacity = '1'
                    // 横版封面塞进竖版卡片时 cover 会再放大 1.5~2 倍（250px 源图雪上加霜），
                    // 改为等比缩放留黑边，避免二次放大
                    if (t.naturalWidth > t.naturalHeight) t.style.objectFit = 'contain'
                  }}
                  onError={e => { e.target.style.display = 'none' }} />
              ) : <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span style={{ fontSize: '2rem', opacity: 0.15 }}>📖</span></div>}
              {localGids.has(g.gid) ? <div className="badge" style={{ position: 'absolute', top: 6, left: 6, zIndex: 5, background: 'rgba(107,139,107,0.85)', color: '#fff', borderColor: 'transparent' }}>已下载</div>
                : downloadingGids.has(g.gid) ? <div className="badge" style={{ position: 'absolute', top: 6, left: 6, zIndex: 5, background: 'rgba(80,128,160,0.85)', color: '#fff', borderColor: 'transparent' }}>下载中</div>
                : null}
              <div className="gallery-hover-overlay" style={{ position: 'absolute', inset: 0, display: 'none', alignItems: 'flex-end', justifyContent: 'center', gap: 'var(--space-2)', padding: 'var(--space-2)', background: 'linear-gradient(transparent 60%, rgba(0,0,0,0.5))', zIndex: 5 }}>
                <button onClick={e => { e.stopPropagation(); handleOpenDetail(g) }} style={{ padding: '4px 10px', borderRadius: 'var(--radius-sm)', border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(0,0,0,0.6)', color: '#fff', fontSize: 'var(--text-2xs)', fontWeight: 'var(--weight-semibold)', cursor: 'pointer', backdropFilter: 'blur(6px)' }}
                  onMouseEnter={e2 => e2.currentTarget.style.background = 'rgba(139,122,160,0.35)'} onMouseLeave={e2 => e2.currentTarget.style.background = 'rgba(0,0,0,0.6)'}>详情</button>
                {localGids.has(g.gid) ? <button style={{ padding: '4px 10px', borderRadius: 'var(--radius-sm)', border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(107,139,107,0.45)', color: '#fff', fontSize: 'var(--text-2xs)', fontWeight: 'var(--weight-semibold)', cursor: 'default' }}>已下载</button>
                  : downloadingGids.has(g.gid) ? <button style={{ padding: '4px 10px', borderRadius: 'var(--radius-sm)', border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(80,128,160,0.45)', color: '#fff', fontSize: 'var(--text-2xs)', fontWeight: 'var(--weight-semibold)', cursor: 'default' }}>下载中</button>
                  : <button onClick={e => handleDownloadCard(e, g)} style={{ padding: '4px 10px', borderRadius: 'var(--radius-sm)', border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(0,0,0,0.6)', color: '#fff', fontSize: 'var(--text-2xs)', fontWeight: 'var(--weight-semibold)', cursor: 'pointer', backdropFilter: 'blur(6px)' }}
                    onMouseEnter={e2 => e2.currentTarget.style.background = 'rgba(160,128,80,0.35)'} onMouseLeave={e2 => e2.currentTarget.style.background = 'rgba(0,0,0,0.6)'}>下载</button>}
              </div>
              {/* 移动端常驻下载按钮：悬浮层在手机上不可见，避免必须先进详情才能下载 */}
              {isMobile && !localGids.has(g.gid) && !downloadingGids.has(g.gid) && (
                <button onClick={e => handleDownloadTap(e, g)} title="直接下载"
                  style={{
                    position: 'absolute', right: 6, bottom: 6, zIndex: 6,
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                    padding: '6px 12px', minHeight: 34,
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid rgba(255,255,255,0.2)',
                    background: 'rgba(0,0,0,0.66)', color: '#fff',
                    fontSize: 'var(--text-2xs)', fontWeight: 'var(--weight-semibold)',
                    cursor: 'pointer', backdropFilter: 'blur(6px)',
                    WebkitTapHighlightColor: 'transparent',
                  }}>
                  <Download size={13} /> 下载
                </button>
              )}
            </div>
            <div style={{ padding: '6px 8px 8px' }}>
              <div title={g.title || `#${g.gid}`} style={{ fontSize: 'var(--text-xs)', lineHeight: 1.4, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', color: 'var(--text-primary)', fontWeight: 'var(--weight-medium)', userSelect: 'none' }}>{g.title || `#${g.gid}`}</div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 'var(--space-1)', color: 'var(--text-muted)', fontSize: 'var(--text-2xs)' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                  <span style={{ color: 'var(--warning)' }}>{g.rating > 0 ? '★ ' + g.rating.toFixed(1) : ''}</span>
                  {/chinese|汉语|中文/i.test(g.language || '') && (
                    <span title={`语言: ${g.language}`}
                      style={{ fontSize: 'var(--text-3xs)', color: '#34d399', border: '1px solid #34d39940', borderRadius: 4, padding: '0 4px', background: '#34d39915', whiteSpace: 'nowrap' }}>汉语</span>
                  )}
                </span>
                {g.fileCount > 0 && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-3xs)' }}>{g.fileCount}P</span>}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* 懒加载触发器 */}
      {galleries.length > 0 && (
        <div ref={loadMoreRef} style={{ textAlign: 'center', padding: '24px 0', color: '#888', fontSize: '0.85rem' }}>
          {loadingMore ? <span>加载中...</span> : !hasMore ? <span>已显示全部 {galleries.length} 条结果</span> : <span>向下滚动加载更多</span>}
        </div>
      )}

      {/* 详情弹窗 */}
      {detailLoading && <div className="modal-overlay"><div className="modal"><div className="loading">加载详情...</div></div></div>}
      {detail && !detailLoading && (
        <div className="modal-overlay" onClick={closeDetailModal}>
          <div className="modal" style={{ maxWidth: 680, maxHeight: '85vh', overflowY: 'auto', padding: 0 }}>
            <div style={{ position: 'relative', background: 'linear-gradient(180deg, #1a1a3a 0%, #0f0f1a 100%)', padding: '20px 24px 16px', borderBottom: '1px solid #2a2a4a' }}>
              <button className="btn-sm" onClick={() => setDetail(null)} style={{ position: 'absolute', top: 10, right: 10, border: 'none', color: '#888', fontSize: '1.1rem' }}>✕</button>
              <div style={{ display: 'flex', gap: 16 }}>
                <div style={{ flexShrink: 0, width: 140, borderRadius: 8, overflow: 'hidden', border: '1px solid #2a2a4a', background: '#1a1a2e' }}>
                  {detail.thumbUrl ? <img src={getEHImageProxyUrl(detail.thumbUrl)} alt="" style={{ width: '100%', display: 'block' }} />
                    : <div style={{ width: '100%', paddingBottom: '140%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span style={{ fontSize: '2rem', opacity: 0.2 }}>📖</span></div>}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <h3 title={detail.title} style={{ margin: '0 0 4px', fontSize: '1rem', lineHeight: 1.4, color: '#e0e0e0', fontWeight: 600 }}>{detail.title}</h3>
                  {detail.titleJpn && <div style={{ fontSize: '0.8rem', color: '#888', marginBottom: 8 }}>{detail.titleJpn}</div>}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                    <span style={{ padding: '2px 10px', borderRadius: 10, fontSize: '0.72rem', fontWeight: 600, background: getCategoryColor(detail.category), color: '#fff' }}>{detail.category}</span>
                    {detail.language && <span style={{ padding: '2px 10px', borderRadius: 10, fontSize: '0.72rem', background: '#2a2a4a', color: '#aaa' }}>{detail.language}</span>}
                    {detail.favoriteCount > 0 && <span style={{ padding: '2px 10px', borderRadius: 10, fontSize: '0.72rem', background: '#f59e0b20', color: '#fbbf24', border: '1px solid #f59e0b40' }}>♥ {detail.favoriteCount}</span>}
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
            <div style={{ padding: '12px 24px', borderBottom: '1px solid #1a1a3a', display: 'flex', gap: 24, flexWrap: 'wrap' }}>
              {[{ label: '页数', value: detail.fileCount }, { label: '大小', value: formatSize(detail.fileSize) }, { label: '评分', value: `${detail.rating}${detail.ratingCount > 0 ? ` (${detail.ratingCount})` : ''}` }, { label: '语言', value: detail.language || '-' }, { label: '种子', value: detail.torrentCount > 0 ? detail.torrentCount : '-' }]
                .map((m, i) => (<div key={i} style={{ textAlign: 'center', minWidth: 50 }}><div style={{ fontSize: '0.65rem', color: '#666', textTransform: 'uppercase', marginBottom: 2 }}>{m.label}</div><div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#ccc' }}>{m.value}</div></div>))}
            </div>
            {detail.tagGroups && detail.tagGroups.length > 0 && (
              <div style={{ padding: '12px 24px', borderBottom: '1px solid #1a1a3a' }}>
                {detail.tagGroups.map((grp, gi) => {
                  const nsCN = nsTranslations[grp.namespace]
                  return (
                    <div key={gi} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 8, position: 'relative' }}>
                      <span style={{ flexShrink: 0, padding: '2px 10px', borderRadius: 4, background: '#7c3aed20', color: '#a78bfa', fontSize: '0.7rem', fontWeight: 600, lineHeight: '20px', marginTop: 2 }}>{nsCN || grp.namespace}</span>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, flex: 1 }}>
                        {grp.tags.map((t, ti) => {
                          const key = `${grp.namespace}:${t}`
                          const cn = tagTranslations[key]
                          const blocked = blockedTags.includes(key)
                          const isActive = activeTag?.key === key
                          return (
                            <span key={ti} style={{ position: 'relative' }}>
                              {isActive && (
                                <div style={{ position: 'absolute', bottom: '100%', left: '50%', transform: 'translateX(-50%)', marginBottom: 4, display: 'flex', gap: 2, background: '#1e1e36', border: '1px solid #7c3aed', borderRadius: 6, padding: '2px 4px', zIndex: 10, whiteSpace: 'nowrap', boxShadow: '0 2px 8px rgba(0,0,0,0.5)' }}>
                                  <button onClick={e => { e.stopPropagation(); const tagSearch = `${grp.namespace}:"${t}"`; setSearch(prev => prev ? `${tagSearch} ${prev}` : tagSearch); setActiveTag(null); setDetail(null) }}
                                    style={{ padding: '2px 10px', border: 'none', borderRadius: 4, background: '#7c3aed20', color: '#a78bfa', cursor: 'pointer', fontSize: '0.68rem', fontWeight: 600 }} title="添加此标签到搜索框">🔍 搜索</button>
                                  <button onClick={e => { e.stopPropagation(); handleBlockTag(grp.namespace, t); setActiveTag(null) }}
                                    style={{ padding: '2px 10px', border: 'none', borderRadius: 4, background: '#ef444420', color: '#fca5a5', cursor: 'pointer', fontSize: '0.68rem', fontWeight: 600 }} title="屏蔽此标签">🚫 屏蔽</button>
                                </div>
                              )}
                              <span title={cn || t} onClick={e => { e.stopPropagation(); setActiveTag(isActive ? null : { namespace: grp.namespace, tag: t, key }) }} style={{
                                padding: '2px 10px', borderRadius: 4, background: blocked ? '#dc262620' : (isActive ? '#7c3aed20' : '#1a1a3a'),
                                color: blocked ? '#fca5a5' : (isActive ? '#a78bfa' : '#ccc'), fontSize: '0.72rem',
                                border: `1px solid ${blocked ? '#ef4444' : (isActive ? '#7c3aed' : '#2a2a4a')}`, cursor: 'pointer', transition: 'all 0.15s', display: 'inline-block',
                              }}
                                onMouseEnter={e => { if (!blocked && !isActive) { e.target.style.background = '#2a2a4a'; e.target.style.borderColor = '#7c3aed' } }}
                                onMouseLeave={e => { if (!blocked && !isActive) { e.target.style.background = '#1a1a3a'; e.target.style.borderColor = '#2a2a4a' } }}>{cn || t}</span>
                            </span>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
            <div style={{ padding: '14px 24px', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <a href={`${API_BASE}/api/ehentai/open/${detail.gid}/${detail.token}?exhentai=${detail.isExhentai ? 'true' : 'false'}`} target="_blank" rel="noreferrer" className="btn-sm" style={{ textDecoration: 'none', color: '#a78bfa', borderColor: '#7c3aed' }}>🌐 在 {detail.isExhentai ? 'ExHentai' : 'E-Hentai'} 打开</a>
              {localGids.has(detail.gid) ? <button className="btn-sm" disabled style={{ borderColor: '#10b981', color: '#6ee7b7', opacity: 0.7 }}>✅ 已下载</button>
                : downloadingGids.has(detail.gid) ? <button className="btn-sm" disabled style={{ borderColor: '#60a5fa', color: '#93c5fd', opacity: 0.7 }}>⏳ 下载中</button>
                : <button className="btn-sm" onClick={() => handleDownload(detail)} style={{ borderColor: '#f59e0b', color: '#fbbf24' }}>⬇ 下载</button>}
            </div>
          </div>
        </div>
      )}

      <ScrollToTop threshold={600} />
      {toast && (
        <div style={{ position: 'fixed', top: 20, left: '50%', transform: 'translateX(-50%)', zIndex: 300, padding: '10px 24px', borderRadius: 10, background: toast.type === 'success' ? '#059669' : '#dc2626', color: '#fff', fontSize: '0.9rem', fontWeight: 600, boxShadow: '0 4px 16px rgba(0,0,0,0.4)', animation: 'toast-in 0.3s ease, toast-out 0.3s ease 1.2s forwards', pointerEvents: 'none' }}>
          {toast.type === 'success' ? '✅ ' : '❌ '}{toast.text}
        </div>
      )}
    </div>
  )
}
