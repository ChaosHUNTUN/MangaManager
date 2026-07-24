/**
 * 阅读器常量 — FIT_MODES / TRANSITIONS / READ_MODES
 * 由 ReaderLocal / Reader / EhentaiReader 共用
 */

export const FIT_MODES = [
  { key: 'fit-width', label: '适应宽度', icon: '↔' },
  { key: 'fit-height', label: '适应高度', icon: '↕' },
  { key: 'fit-both', label: '适应页面', icon: '⊡' },
  { key: 'original', label: '原始大小', icon: '1:1' },
]

export const TRANSITIONS = [
  { key: 'fade', label: '淡入淡出', icon: '🌫' },
  { key: 'slide', label: '滑动', icon: '⇢' },
  { key: 'none', label: '无效果', icon: '▯' },
]

export const READ_MODES = [
  { key: 'paged', label: '翻页', icon: '📖' },
  { key: 'scroll', label: '滚动', icon: '📜' },
]
