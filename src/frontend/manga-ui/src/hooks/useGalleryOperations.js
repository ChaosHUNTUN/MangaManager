import { useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  deleteLocalGallery, redownloadLocalGallery, batchRedownloadLocalGalleries,
  importLocalGallery, batchImportGalleries, browseDirectory,
  fetchLocalGalleryDetail, fetchGalleryMetaTags,
  updateGalleryMetaTags, translateEHTags,
} from '../api'

/**
 * 本地画廊操作 Hook — 所有增删改操作，与 UI 完全解耦
 */
export default function useGalleryOperations({ galleryMetas, albumConfig, paged, pageTotal,
  activeGroup, search, sortBy, randomMode, loadMetas, loadPaged, setError, setToast
}) {
  const navigate = useNavigate()

  // ── 删除 ──
  const [deleting, setDeleting] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState(null)
  const handleDelete = useCallback(async (gid) => {
    setDeleting(true)
    try { await deleteLocalGallery(gid); setDeleteConfirm(null); loadMetas(); loadPaged() }
    catch (e) { setError(e.message) }
    setDeleting(false)
  }, [loadMetas, loadPaged, setError])

  // ── 批量操作 ──
  const [batchMode, setBatchMode] = useState(false)
  const [selected, setSelected] = useState(new Set())
  const [batchDeleteConfirm, setBatchDeleteConfirm] = useState(false)
  const [batchRedownloadConfirm, setBatchRedownloadConfirm] = useState(false)

  const handleBatchDelete = useCallback(async () => {
    setDeleting(true)
    try {
      const results = await Promise.allSettled(Array.from(selected).map(gid => deleteLocalGallery(gid)))
      const failed = results.filter(r => r.status === 'rejected')
      setSelected(new Set()); setBatchMode(false); setBatchDeleteConfirm(false)
      loadMetas(); loadPaged()
      if (failed.length > 0) setToast(`删除完成: ${results.length - failed.length} 成功, ${failed.length} 失败`)
      else setToast(`已删除 ${results.length} 部`)
    } catch (e) { setError(e.message) }
    setDeleting(false)
  }, [selected, loadMetas, loadPaged, setToast, setError])

  const handleBatchRedownload = useCallback(async () => {
    setDeleting(true)
    try {
      const r = await batchRedownloadLocalGalleries(Array.from(selected))
      setBatchRedownloadConfirm(false); setSelected(new Set()); setBatchMode(false)
      loadMetas(); loadPaged()
      setToast(r ? `批量重新下载: ${r.success} 成功${r.skipped > 0 ? `, ${r.skipped} 跳过` : ''}${r.failed > 0 ? `, ${r.failed} 失败` : ''}` : '批量重新下载任务已启动')
    } catch (e) { setToast('批量重新下载失败: ' + e.message) }
    setDeleting(false)
  }, [selected, loadMetas, loadPaged, setToast])

  // ── 详情 & 标签翻译 ──
  const [detail, setDetail] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [tagTranslations, setTagTranslations] = useState({})
  const [nsTranslations, setNsTranslations] = useState({})
  const handleOpenDetail = useCallback(async (gid) => {
    setDetailLoading(true)
    try {
      const d = await fetchLocalGalleryDetail(gid)
      setDetail(d)
      if (d?.tagGroups?.length) {
        const all = []
        d.tagGroups.forEach(g => { all.push(`n:${g.namespace}`); g.tags.forEach(t => all.push(`${g.namespace}:${t}`)) })
        translateEHTags(all).then(r => {
          const tM = {}, nM = {}
          ;(r.data || []).forEach(item => { if (item.key?.startsWith('n:')) nM[item.key.substring(2)] = item.cn; else if (item.cn) tM[item.key] = item.cn })
          setTagTranslations(tM); setNsTranslations(nM)
        }).catch(() => {})
      }
    } catch (e) { setError(e.message) }
    setDetailLoading(false)
  }, [setError])

  // ── 阅读器跳转（gid: number, 不是对象） ──
  const handleOpenReader = useCallback(async (gid) => {
    const isRandom = randomMode
    const allGids = Object.values(albumConfig).flatMap(v => v.gids || [])
    let ag = null, ao = null
    if (activeGroup.startsWith('album:')) {
      const album = albumConfig[activeGroup.slice(6)]
      if (album) { ag = album.gids || []; ao = sortBy === 'custom' ? (album.order || album.gids) : null }
    }
    const contextGids = paged.map(g2 => g2.gid)
    sessionStorage.setItem('reader-local-context', JSON.stringify({
      group: isRandom ? undefined : activeGroup,
      search: isRandom ? undefined : search,
      sort: isRandom ? undefined : sortBy,
      gids: contextGids,
      total: isRandom ? paged.length : pageTotal,
      isRandom,
    }))
    sessionStorage.setItem('reader-local-return-url', window.location.search)
    if (isRandom) sessionStorage.removeItem('reader-local-full-gids')
    navigate(`/reader-local/${gid}`)
    if (!isRandom) {
      try {
        const { fetchLocalGalleryGids } = await import('../api')
        const fg = await fetchLocalGalleryGids({
          group: activeGroup === 'all' ? null : activeGroup,
          search: search || null, sort: sortBy || null,
          albumGids: activeGroup.startsWith('album:') ? ag : allGids.length > 0 ? allGids : null,
          albumOrder: ao,
        })
        if (fg?.length) {
          sessionStorage.setItem('reader-local-full-gids', JSON.stringify(fg))
          window.dispatchEvent(new CustomEvent('reader-gids-updated', { detail: fg }))
        }
      } catch { }
    }
  }, [activeGroup, search, sortBy, pageTotal, paged, albumConfig, navigate, randomMode])

  // ── 导入 ──
  const [importModal, setImportModal] = useState(false)
  const [importForm, setImportForm] = useState({ sourceDir: '', title: '', category: 'doujinshi', language: '', artists: '', groups: '', otherTags: '', copyFiles: true })
  const [importing, setImporting] = useState(false)
  const [importDirBrowser, setImportDirBrowser] = useState({ show: false, path: '', items: [], stack: [] })

  const handleBrowseImport = useCallback(async (targetPath) => {
    try { const r = await browseDirectory(targetPath || ''); setImportDirBrowser(r) }
    catch (e) { setError(e.message) }
  }, [setError])

  const handleImport = useCallback(async () => {
    if (!importForm.sourceDir) return
    setImporting(true)
    try {
      await importLocalGallery(importForm)
      setImportModal(false); setImportForm({ sourceDir: '', title: '', category: 'doujinshi', language: '', artists: '', groups: '', otherTags: '', copyFiles: true })
      setToast('导入成功')
      loadMetas(); loadPaged()
    } catch (e) { setError(e.message) }
    setImporting(false)
  }, [importForm, loadMetas, loadPaged, setToast, setError])

  // ── 批量导入 ──
  const [batchImportModal, setBatchImportModal] = useState(false)
  const [batchImportForm, setBatchImportForm] = useState({ parentDir: '', copyFiles: true })
  const [batchImporting, setBatchImporting] = useState(false)
  const [batchImportResult, setBatchImportResult] = useState(null)

  const handleBatchImport = useCallback(async () => {
    if (!batchImportForm.parentDir) return
    setBatchImporting(true)
    try {
      const r = await batchImportGalleries(batchImportForm)
      setBatchImportResult(r.data || { success: r.success || 0, skipped: r.skipped || 0, failed: r.failed || 0, details: r.details || [] })
      setToast(`导入完成: ${r.data?.success || 0} 成功`)
      loadMetas(); loadPaged()
    } catch (e) { setError(e.message) }
    setBatchImporting(false)
  }, [batchImportForm, loadMetas, loadPaged, setToast, setError])

  // ── 编辑标签 ──
  const [editTagsModal, setEditTagsModal] = useState(null)
  const [editTagsForm, setEditTagsForm] = useState({ title: '', category: '', language: '', tags: {} })
  const [editTagsSaving, setEditTagsSaving] = useState(false)

  const loadEditTags = useCallback(async (gid) => {
    try {
      const tags = await fetchGalleryMetaTags(gid)
      setEditTagsForm({ title: tags.title || '', category: tags.category || '', language: tags.language || '', tags: tags.tags || {} })
    } catch (e) { setError(e.message) }
  }, [setError])

  const saveEditTags = useCallback(async () => {
    if (!editTagsModal) return
    setEditTagsSaving(true)
    try {
      await updateGalleryMetaTags(editTagsModal, editTagsForm)
      setEditTagsModal(null); setToast('标签已更新'); loadMetas()
    } catch (e) { setError(e.message) }
    setEditTagsSaving(false)
  }, [editTagsModal, editTagsForm, loadMetas, setToast, setError])

  return {
    deleting, deleteConfirm, setDeleteConfirm, handleDelete,
    batchMode, setBatchMode, selected, setSelected,
    batchDeleteConfirm, setBatchDeleteConfirm, handleBatchDelete,
    batchRedownloadConfirm, setBatchRedownloadConfirm, handleBatchRedownload,
    detail, detailLoading, setDetail, tagTranslations, nsTranslations, handleOpenDetail,
    handleOpenReader,
    importModal, setImportModal, importForm, setImportForm, importing,
    importDirBrowser, setImportDirBrowser, handleBrowseImport, handleImport,
    batchImportModal, setBatchImportModal, batchImportForm, setBatchImportForm,
    batchImporting, batchImportResult, setBatchImportResult, handleBatchImport,
    editTagsModal, setEditTagsModal, editTagsForm, setEditTagsForm,
    editTagsSaving, loadEditTags, saveEditTags,
  }
}
