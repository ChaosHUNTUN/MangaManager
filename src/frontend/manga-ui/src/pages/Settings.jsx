import { useState, useEffect, useCallback, useRef } from 'react'
import { Link } from 'react-router-dom'
import { Folder, RefreshCw, Save, ShieldCheck, Globe, AlertCircle, CheckCircle, BookMarked } from 'lucide-react'
import { fetchAppSettings, saveAppSettings, rescanLibrary } from '../api'
import useEHCookie from '../hooks/useEHCookie'
import DirectoryPicker from '../components/DirectoryPicker'

/** 一键导出书签：在已登录的 e-hentai.org 页面点击，自动复制 Cookie 为 JSON */
const BOOKMARKLET = "javascript:(()=>{const g=n=>{const m=document.cookie.split(';').map(x=>x.trim()).find(x=>x.startsWith(n+'='));return m?decodeURIComponent(m.slice(n.length+1)):''};const o={ipb_member_id:g('ipb_member_id'),ipb_pass_hash:g('ipb_pass_hash'),igneous:g('igneous')};const t=JSON.stringify(o);navigator.clipboard.writeText(t).then(()=>alert('已复制 EH Cookie，回 MangaManager 粘贴导入'))['catch'](()=>prompt('手动复制：',t))})()"

function Card({ icon, title, desc, children }) {
  return (
    <section style={{
      background: 'var(--surface-card)', border: '1px solid var(--border-card)',
      borderRadius: 'var(--radius-md)', padding: 'var(--space-4)', marginBottom: 'var(--space-4)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        {icon}
        <h2 style={{ fontSize: 'var(--text-md)', fontWeight: 600, margin: 0 }}>{title}</h2>
      </div>
      {desc && <p style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-muted)', margin: '0 0 var(--space-3)' }}>{desc}</p>}
      <div style={{ marginTop: 'var(--space-3)' }}>{children}</div>
    </section>
  )
}

function StatusBadge({ ok, text }) {
  const color = ok ? 'var(--success)' : 'var(--warning)'
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 'var(--text-2xs)',
      color, border: `1px solid ${color}40`, background: `${color}14`,
      borderRadius: 'var(--radius-xs)', padding: '1px 6px', whiteSpace: 'nowrap',
    }}>
      {ok ? <CheckCircle size={11} /> : <AlertCircle size={11} />}{text}
    </span>
  )
}

export default function Settings() {
  const [toast, setToast] = useState(null)
  const toastTimerRef = useRef(null)
  const showToast = useCallback((msg) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    setToast(msg)
    toastTimerRef.current = setTimeout(() => setToast(null), 2200)
  }, [])
  useEffect(() => () => { if (toastTimerRef.current) clearTimeout(toastTimerRef.current) }, [])

  // ── 库目录 / 代理 ──
  const [app, setApp] = useState(null)
  const [loading, setLoading] = useState(true)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [savingDir, setSavingDir] = useState(false)
  const [proxyInput, setProxyInput] = useState('')
  const [savingProxy, setSavingProxy] = useState(false)
  const [rescanning, setRescanning] = useState(false)

  const loadApp = useCallback(async () => {
    setLoading(true)
    try {
      const d = await fetchAppSettings()
      setApp(d)
      setProxyInput(d?.proxy || '')
    } catch (e) { showToast('读取设置失败: ' + e.message) }
    setLoading(false)
  }, [showToast])
  useEffect(() => { loadApp() }, [loadApp])

  const handlePickDir = async (dir) => {
    setPickerOpen(false)
    setSavingDir(true)
    try {
      const r = await saveAppSettings({ downloadDir: dir, rescan: true })
      showToast(r?.message || '已保存')
      await loadApp()
    } catch (e) { showToast('保存失败: ' + e.message) }
    setSavingDir(false)
  }

  const handleRescan = async () => {
    setRescanning(true)
    try {
      await rescanLibrary()
      showToast('已开始后台重新扫描')
    } catch (e) { showToast('重扫失败: ' + e.message) }
    setRescanning(false)
  }

  const handleSaveProxy = async () => {
    setSavingProxy(true)
    try {
      const r = await saveAppSettings({ proxy: proxyInput, rescan: false })
      showToast(r?.message || '已保存')
      await loadApp()
    } catch (e) { showToast('保存失败: ' + e.message) }
    setSavingProxy(false)
  }

  // ── E-Hentai Cookie（复用与在线页同一套逻辑） ──
  const cookie = useEHCookie({})
  const {
    cookieForm, setCookieForm, rawCookie, setRawCookie, cookieInfo,
    cookieValidating, validateResult, cookieMsg, connectivity,
    handleSaveCookie, handleValidate, handleImportRaw, handleImportClipboard,
  } = cookie

  const copyBookmarklet = async () => {
    try { await navigator.clipboard.writeText(BOOKMARKLET); showToast('脚本已复制，去 EH 页面新建书签粘贴') }
    catch { showToast('复制失败，请手动选择复制') }
  }

  const loginStatus = !cookieInfo?.ipbMemberId ? { color: 'var(--text-muted)', text: '未配置' }
    : !validateResult ? { color: 'var(--text-muted)', text: '验证中…' }
    : !validateResult.loggedIn ? { color: 'var(--error)', text: 'Cookie 失效' }
    : validateResult.exhentai ? { color: 'var(--success)', text: '里站可用' }
    : { color: 'var(--warning)', text: '仅表站' }

  return (
    <div className="container" style={{ maxWidth: 860, margin: '0 auto', padding: 'var(--space-4)' }}>
      {/* 顶栏 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-4)' }}>
        <Link to="/local" className="btn-sm" style={{ textDecoration: 'none', borderColor: 'var(--accent-teal-bg)', color: 'var(--accent-teal)', fontWeight: 600 }}>📁 本地</Link>
        <h1 style={{ fontSize: 'var(--text-lg)', fontWeight: 600, margin: 0 }}>⚙ 设置</h1>
        {toast && (
          <span style={{ marginLeft: 'auto', fontSize: 'var(--text-2xs)', color: 'var(--accent)' }}>{toast}</span>
        )}
      </div>

      {/* 1. 库目录 */}
      <Card icon={<Folder size={16} />} title="库目录"
        desc="画廊（作品）存放的根目录：应为「每个作品一个子文件夹」的父目录。修改后会自动后台重扫（只新增/更新，不删除已有记录）。">
        {loading ? <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>读取中…</div> : (
          <>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
              fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', marginBottom: 'var(--space-2)',
            }}>
              <span style={{ wordBreak: 'break-all' }}>{app?.downloadDir || '(未设置)'}</span>
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 'var(--space-3)' }}>
              <StatusBadge ok={!!app?.downloadDirConfigured}
                text={app?.downloadDirConfigured ? '已配置' : '未配置（使用默认路径）'} />
              <StatusBadge ok={!!app?.downloadDirExists}
                text={app?.downloadDirExists ? '目录可访问' : '目录不存在'} />
              {app?.downloadDirExists && app?.galleryDirCount != null && (
                <StatusBadge ok={app.galleryDirCount > 0} text={`${app.galleryDirCount} 个作品文件夹`} />
              )}
            </div>
            {!app?.downloadDirConfigured && app?.fallbackDownloadDir && (
              <p style={{ fontSize: 'var(--text-2xs)', color: 'var(--warning)', margin: '0 0 var(--space-2)' }}>
                当前使用内置默认路径（程序目录/downloads），建议指定你自己的画廊目录。
              </p>
            )}
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <button className="btn-sm" onClick={() => setPickerOpen(true)} disabled={savingDir}
                style={{ borderColor: 'var(--accent-border)', color: 'var(--accent)' }}>
                <Folder size={13} /> {savingDir ? '保存中…' : '选择目录'}
              </button>
              <button className="btn-sm" onClick={handleRescan} disabled={rescanning}>
                <RefreshCw size={13} /> {rescanning ? '已触发…' : '重新扫描'}
              </button>
            </div>
          </>
        )}
      </Card>

      {/* 2. E-Hentai 账号 */}
      <Card icon={<ShieldCheck size={16} />} title="E-Hentai 账号（Cookie）"
        desc="用于在线搜索、下载与访问里站（ExHentai）。Cookie 保存在本机后端，不会上传。">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 'var(--space-3)' }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: loginStatus.color, display: 'inline-block' }} />
          <span style={{ fontSize: 'var(--text-2xs)', color: loginStatus.color }}>{loginStatus.text}</span>
          {validateResult?.error && (
            <span style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-muted)' }}>{validateResult.error}</span>
          )}
          {connectivity && (
            <span style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-muted)', marginLeft: 'auto' }}>
              连通性: {connectivity.reachable ? '可访问' : '不可访问'}
            </span>
          )}
        </div>

        <div style={{ padding: 10, background: 'var(--surface-hover)', borderRadius: 'var(--radius-sm)', marginBottom: 'var(--space-3)' }}>
          <div style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-secondary)', marginBottom: 6 }}>
            ⚡ 快速导入：粘贴 Cookie 串 / Netscape 导出 / JSON，自动识别三项
          </div>
          <textarea rows={2} value={rawCookie} onChange={e => setRawCookie(e.target.value)}
            placeholder="ipb_member_id=xxxx; ipb_pass_hash=yyyy; igneous=zzzz"
            style={{ width: '100%', boxSizing: 'border-box', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-2xs)' }} />
          <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
            <button className="btn-sm" onClick={handleImportClipboard}>📋 从剪贴板导入</button>
            <button className="btn-sm" onClick={handleImportRaw}>解析导入</button>
            <button className="btn-sm" onClick={copyBookmarklet} title="在 EH 页面点击书签可一键复制 Cookie">
              <BookMarked size={12} /> 复制导出书签
            </button>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 8, marginBottom: 'var(--space-3)' }}>
          {[['ipbMemberId', 'ipb_member_id *'], ['ipbPassHash', 'ipb_pass_hash *'], ['igneous', 'igneous（里站必需）'], ['label', '备注']].map(([k, label]) => (
            <div key={k}>
              <label style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-muted)' }}>{label}</label>
              <input value={cookieForm[k] || ''} onChange={e => setCookieForm(f => ({ ...f, [k]: e.target.value }))}
                placeholder={k} style={{ width: '100%', boxSizing: 'border-box' }} />
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          <button className="btn-sm" onClick={handleSaveCookie} disabled={cookieValidating}
            style={{ borderColor: 'var(--accent-border)', color: 'var(--accent)' }}>
            <Save size={13} /> 保存
          </button>
          <button className="btn-sm" onClick={handleValidate} disabled={cookieValidating}>
            <ShieldCheck size={13} /> {cookieValidating ? '验证中…' : '验证登录'}
          </button>
          {cookieMsg && (
            <span style={{ fontSize: 'var(--text-2xs)', color: cookieMsg.type === 'error' ? 'var(--error)' : 'var(--success)' }}>
              {cookieMsg.text}
            </span>
          )}
        </div>
      </Card>

      {/* 3. 网络 */}
      <Card icon={<Globe size={16} />} title="网络代理"
        desc="访问 ExHentai（里站）通常需要代理。留空表示直连；保存后立即生效，无需重启。">
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <input value={proxyInput} onChange={e => setProxyInput(e.target.value)}
            placeholder="http://127.0.0.1:7890"
            style={{ flex: 1, minWidth: 220, fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)' }} />
          <button className="btn-sm" onClick={handleSaveProxy} disabled={savingProxy}
            style={{ borderColor: 'var(--accent-border)', color: 'var(--accent)' }}>
            <Save size={13} /> {savingProxy ? '保存中…' : '保存代理'}
          </button>
        </div>
      </Card>

      <DirectoryPicker
        open={pickerOpen}
        title="选择库目录"
        hint="进入你存放作品的盘符/文件夹，选中「每个作品一个子文件夹」的父目录后点“选择此目录”。"
        initialPath={app?.downloadDirExists ? app.downloadDir : ''}
        onSelect={handlePickDir}
        onClose={() => setPickerOpen(false)}
      />
    </div>
  )
}
