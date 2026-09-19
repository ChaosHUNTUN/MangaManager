import { useState } from 'react'
import { fetchEHGalleryDetail, translateEHTags, fetchBlockedTags, addBlockedTag, removeBlockedTag, addDownloadTask } from '../api'

export default function useEHDetail({ showToast, setLocalGids, setDownloadingGids, setError }) {
  const [detail, setDetail] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [tagTranslations, setTagTranslations] = useState({})
  const [nsTranslations, setNsTranslations] = useState({})
  const [activeTag, setActiveTag] = useState(null)
  const [blockedTags, setBlockedTags] = useState([])
  const [showBlockedPanel, setShowBlockedPanel] = useState(false)

  const loadBlockedTags = async () => {
    try { const tags = await fetchBlockedTags(); setBlockedTags(tags) } catch { }
  }

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
      setTagTranslations(tMap); setNsTranslations(nsMap)
    } catch (e) { console.error('[useEHDetail] translateDetailTags failed:', e) }
  }

  const handleBlockTag = async (namespace, tag) => {
    const fullTag = `${namespace}:${tag}`
    if (blockedTags.includes(fullTag)) return
    try { await addBlockedTag(fullTag); setBlockedTags(prev => [...prev, fullTag]) } catch { }
  }

  const handleUnblockTag = async (tag) => {
    try { await removeBlockedTag(tag); setBlockedTags(prev => prev.filter(t => t !== tag)) } catch { }
  }

  /**
   * 打开详情。传入 seed（搜索结果卡片对象）时会先用卡片已有字段渲染骨架，
   * 真实详情返回后再覆盖——避免"点开后白屏等接口"的体感。
   */
  const openDetail = async (gid, token, seed) => {
    setDetailLoading(true); setTagTranslations({}); setNsTranslations({})
    setDetail(seed ? {
      gid, token,
      title: seed.title || `#${gid}`,
      category: seed.category || 'other',
      language: seed.language || null,
      rating: seed.rating != null ? String(seed.rating) : '0',
      fileCount: seed.fileCount || 0,
      fileSize: seed.fileSize || 0,
      thumbUrl: seed.thumbUrl || null,
      tagGroups: [],
      isSkeleton: true,
    } : null)
    try {
      const d = await fetchEHGalleryDetail(gid, token); setDetail(d)
      await translateDetailTags(d)
      loadBlockedTags()
    } catch (e) { setError(e.message) }
    setDetailLoading(false)
  }

  // 接收已获取的详情数据（供 init Hook 使用，无需重复 fetch）
  const openDetailViaApi = async (d) => {
    setDetail(d); setTagTranslations({}); setNsTranslations({})
    await translateDetailTags(d); loadBlockedTags()
  }

  const handleDownload = async (d) => {
    try {
      const coverUrl = d.thumb || ''
      const r = await addDownloadTask(d.gid, d.token, d.title, coverUrl)
      if (r.success) {
        const status = r.data?.status
        if (status === 'completed') {
          showToast({ type: 'info', text: '已下载' })
          setLocalGids(prev => new Set([...prev, d.gid]))
        } else if (status === 'paused') {
          showToast({ type: 'success', text: '已恢复下载' })
          setDownloadingGids(prev => new Set([...prev, d.gid]))
        } else if (status === 'downloading') {
          showToast({ type: 'info', text: '正在下载中' })
          setDownloadingGids(prev => new Set([...prev, d.gid]))
        } else {
          showToast({ type: 'success', text: '已加入下载队列' })
          setDownloadingGids(prev => new Set([...prev, d.gid]))
        }
      } else {
        showToast({ type: 'error', text: r.message || '添加失败' })
      }
    } catch (e) {
      showToast({ type: 'error', text: e.message })
    }
  }

  return {
    detail, setDetail, detailLoading, tagTranslations, nsTranslations,
    activeTag, setActiveTag, blockedTags, setBlockedTags, showBlockedPanel,
    setShowBlockedPanel, loadBlockedTags, translateDetailTags,
    handleBlockTag, handleUnblockTag, openDetail, openDetailViaApi,
    handleDownload,
  }
}
