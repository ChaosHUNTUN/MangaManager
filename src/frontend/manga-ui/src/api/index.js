// API layer barrel — 所有模块在此统一导出
// 向后兼容：import { ... } from '../api' 仍然可用

export { API_BASE, request } from './client'

// 漫画
export {
  fetchMangaList, fetchMangaDetail, scanDirectory, subscribeScanProgress,
  renameManga, deleteManga
} from './manga'

// 标签
export {
  fetchAllTags, fetchTagCategories, createTag, updateTag, deleteTag,
  fetchMangaTags, setMangaTags, batchAddTags
} from './tags'

// E-Hentai
export {
  checkEHConnectivity, fetchEHentaiCookie, updateEHentaiCookie, validateEHentaiCookie,
  fetchEHGalleries, fetchEHGalleryDetail, fetchEHGalleryPages, fetchEHGalleryLocalPages,
  translateEHSearch, getEHImageProxyUrl,
  suggestEHTags, translateEHTags,
  fetchBlockedTags, addBlockedTag, removeBlockedTag
} from './ehentai'

// 下载
export {
  fetchDownloadTasks, fetchActiveDownloadTasks, fetchDownloadTask, addDownloadTask,
  pauseDownloadTask, resumeDownloadTask, removeDownloadTask, restartDownloadTask,
  restartAllFailedTasks
} from './download'

// 本地画廊
export {
  fetchLocalGalleries, fetchLocalGalleryMetas, fetchLocalGalleriesPaged,
  fetchLocalGalleriesRandom, fetchLocalGalleryGroups, fetchLocalGalleryDetail,
  fetchLocalGalleryPages, fetchLocalGalleryPagesAbortable,
  getLocalCoverUrl, getLocalPageUrl, deleteLocalGallery,
  redownloadLocalGallery, batchRedownloadLocalGalleries, checkDownloaded,
  importLocalGallery, fetchGalleryMetaTags, updateGalleryMetaTags,
  browseDirectory, batchImportGalleries, fetchLocalGalleryGids
} from './localGallery'

// 专辑
export {
  fetchAlbumConfig, saveAlbumConfig, renameAlbum, fetchAlbumDetail,
  fetchAlbumSummary, fetchAlbumDetailV2, updateAlbum
} from './albums'

// 阅读器
export {
  getCoverUrl, getPageUrl,
  fetchReadingProgress, fetchReadingProgressAbortable, saveReadingProgress,
  fetchReaderSettings, saveReaderSettings
} from './reader'

// 文件系统
export { fetchDrives, fetchDirectory } from './filesystem'
