import { useState, useEffect } from 'react'
import { fetchEHentaiCookie, updateEHentaiCookie, validateEHentaiCookie, checkEHConnectivity } from '../api'

export default function useEHCookie({ onCookieSaved }) {
  const [showCookie, setShowCookie] = useState(false)
  const [cookieForm, setCookieForm] = useState({ ipbMemberId: '', ipbPassHash: '', igneous: '', label: '' })
  const [cookieInfo, setCookieInfo] = useState(null)
  const [cookieValidating, setCookieValidating] = useState(false)
  const [validateResult, setValidateResult] = useState(null)
  const [cookieMsg, setCookieMsg] = useState(null)
  const [connectivity, setConnectivity] = useState(null)

  const loadCookie = async () => {
    try { const info = await fetchEHentaiCookie(); setCookieInfo(info); setCookieForm(p => ({ ...p, label: info.label || '' })) } catch { }
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

  useEffect(() => { loadCookie(); checkNet() }, [])

  return { showCookie, setShowCookie, cookieForm, setCookieForm, cookieInfo, cookieValidating, validateResult, cookieMsg, connectivity, loadCookie, checkNet, handleSaveCookie, handleValidate }
}
