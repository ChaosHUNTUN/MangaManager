/**
 * 分类颜色映射
 * 由 GalleryCard / GalleryDetail / EHentai / GalleryRow 共用
 */

// 卡片/列表视图（偏暗调）
export const CATEGORY_COLORS_CARD = {
  'doujinshi': '#c06060',
  'manga': '#c09040',
  'artist cg': '#60a0c0',
  'artistcg': '#60a0c0',
  'game cg': '#80c060',
  'gamecg': '#80c060',
  'image set': '#c080c0',
  'imageset': '#c080c0',
  'western': '#b0a060',
  'non-h': '#90a0a0',
  'non h': '#90a0a0',
  'cosplay': '#c0a0b0',
  'asian porn': '#a0c0a0',
  'asianporn': '#a0c0a0',
  'misc': '#909090',
}

// 详情弹窗（偏亮调）
export const CATEGORY_COLORS_DETAIL = {
  'doujinshi': '#F44336',
  'manga': '#F57C00',
  'artist cg': '#0e9aea',
  'artistcg': '#0e9aea',
  'game cg': '#4CAF50',
  'gamecg': '#4CAF50',
  'image set': '#BD3699',
  'imageset': '#BD3699',
  'western': '#D4A63C',
  'non-h': '#78909C',
  'non h': '#78909C',
  'cosplay': '#D63450',
  'asian porn': '#2E7D32',
  'asianporn': '#2E7D32',
  'misc': '#757575',
}

// 安全获取分类颜色（暗调，卡片用）
export function getCategoryColor(category) {
  const key = (category || '').toLowerCase().trim()
  return CATEGORY_COLORS_CARD[key] || '#888888'
}

// 安全获取分类颜色（亮调，详情弹窗用）
export function getCategoryColorDetail(category) {
  const key = (category || '').toLowerCase().trim()
  return CATEGORY_COLORS_DETAIL[key] || '#888888'
}
