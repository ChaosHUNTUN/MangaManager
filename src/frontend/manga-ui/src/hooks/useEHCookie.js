import { useState, useEffect } from 'react'
import { fetchEHentaiCookie, updateEHentaiCookie, validateEHentaiCookie, checkEHConnectivity } from '../api'

/** 从任意文本中识别 EH Cookie：完整 Cookie 串 / Netscape 导出 / JSON */
export function parseCookieText(text) {
  const s = (text || '').trim()
  if (!s) return null
  const out = { ipbMemberId: '', ipbPassHash: '', igneous: '' }

  // 1) JSON（书签一键导出格式）
  try {
    const j = JSON.parse(s)
    if (j && typeof j === 'object') {
      out.ipbMemberId = String(j.ipb_member_id ?? j.ipbMemberId ?? '')
      out.ipbPassHash = String(j.ipb_pass_hash ?? j.ipbPassHash ?? '')
      out.igneous = String(j.igneous ?? '')
      if (out.ipbMemberId || out.ipbPassHash || out.igneous) return out
    }
  } catch { /* 非 JSON，继续 */ }

  // 2) Netscape 格式：domain \t flag \t path \t secure \t expires \t name \t value
  if (s.includes('\t')) {
    for (const line of s.split(/\r?\n/)) {
      const p = line.split('\t')
      if (p.length >= 7) {
        const name = p[5].trim()
        const value = p[6].trim()
        if (name === 'ipb_member_id') out.ipbMemberId = value
        else if (name === 'ipb_pass_hash') out.ipbPassHash = value
        else if (name === 'igneous') out.igneous = value
      }
    }
    if (out.ipbMemberId || out.ipbPassHash || out.igneous) return out
  }

  // 3) Cookie 头 / 键值串 / 冒号格式：name=value; name2=value2 或每行 name: value
  for (const m of s.matchAll(/(ipb_member_id|ipb_pass_hash|igneous)\s*[:=：]\s*([^\s,;]+)/gi)) {
    const name = m[1].toLowerCase()
    const value = m[2].replace(/^"|"$/g, '').trim()
    if (name === 'ipb_member_id') out.ipbMemberId = value
    else if (name === 'ipb_pass_hash') out.ipbPassHash = value
    else if (name === 'igneous') out.igneous = value
  }

  return (out.ipbMemberId || out.ipbPassHash || out.igneous) ? out : null
}

export default function useEHCookie({ onCookieSaved }) {
  const [showCookie, setShowCookie] = useState(false)
  const [cookieForm, setCookieForm] = useState({ ipbMemberId: '', ipbPassHash: '', igneous: '', label: '' })
  const [rawCookie, setRawCookie] = useState('')
  const [cookieInfo, setCookieInfo] = useState(null)
  const [cookieValidating, setCookieValidating] = useState(false)
  const [validateResult, setValidateResult] = useState(null)
  const [cookieMsg, setCookieMsg] = useState(null)
  const [connectivity, setConnectivity] = useState(null)

  const loadCookie = async () => {
    try {
      const info = await fetchEHentaiCookie()
      setCookieInfo(info)
      setCookieForm(p => ({ ...p, label: info.label || '' }))
      // 已配置 Cookie 时自动验证一次，让状态徽章准确
      if (info?.ipbMemberId) {
        setCookieValidating(true)
        try { const r = await validateEHentaiCookie(); setValidateResult(r.data) }
        catch (e) { setValidateResult({ loggedIn: false, error: e.message }) }
        setCookieValidating(false)
      }
    } catch { }
  }
  const checkNet = async () => {
    try { const r = await checkEHConnectivity(); setConnectivity(r) } catch { setConnectivity({ reachable: false }) }
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
        onCookieSaved?.()
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

  const handleImportRaw = () => {
    const parsed = parseCookieText(rawCookie)
    if (!parsed) {
      setCookieMsg({ type: 'error', text: '未能识别 Cookie 内容，请检查格式（支持完整 Cookie 串 / Netscape 导出 / JSON）' })
      return
    }
    setCookieForm(f => ({ ...f, ...parsed }))
    setCookieMsg({ type: 'success', text: parsed.igneous ? '已识别并填入（含里站 igneous）' : '已识别并填入（未检测到 igneous，里站可能不可用）' })
  }

  const handleImportClipboard = async () => {
    try {
      const t = await navigator.clipboard.readText()
      setRawCookie(t)
      const parsed = parseCookieText(t)
      if (!parsed) {
        setCookieMsg({ type: 'error', text: '剪贴板内容无法识别为 EH Cookie' })
        return
      }
      setCookieForm(f => ({ ...f, ...parsed }))
      setCookieMsg({ type: 'success', text: '已从剪贴板导入，点击「保存」生效' })
    } catch {
      setCookieMsg({ type: 'error', text: '无法读取剪贴板，请手动粘贴到下方输入框' })
    }
  }

  useEffect(() => { loadCookie(); checkNet() }, [])

  return { showCookie, setShowCookie, cookieForm, setCookieForm, rawCookie, setRawCookie, cookieInfo, cookieValidating, validateResult, cookieMsg, connectivity, loadCookie, checkNet, handleSaveCookie, handleValidate, handleImportRaw, handleImportClipboard }
}
