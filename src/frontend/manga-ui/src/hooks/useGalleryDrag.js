import { useRef, useCallback } from 'react'

const DRAG_THRESHOLD = 5 // 拖拽最小移动像素阈值

/**
 * 自定义拖拽 Hook（mousedown/mousemove/mouseup）
 * 绕过浏览器原生 drag API 的首次点击问题
 * 
 * @param {Object} options
 * @param {Function} options.onDropToAlbum - (gid, albumKey) => void
 * @param {Function} options.onDropToSort  - (gid, targetGid) => void
 * @param {Function} options.onShortClick   - (gid) => void 短点击回调
 * @param {Function} options.onDragStart    - (gid) => void 拖拽开始时回调
 * @param {Function} options.onDragEnd      - () => void 拖拽结束时回调
 * @param {boolean}  options.isSortMode     - 是否在专辑排序模式
 * @param {boolean}  options.disabled       - 是否禁用拖拽
 * @param {Function} options.onToast        - (msg, duration?) => void
 * @returns {{ dragGidRef, handleDragMouseDown }}
 */
export default function useGalleryDrag({ onDropToAlbum, onDropToSort, onShortClick, onDragStart, onDragEnd, isSortMode, disabled, onToast }) {
  const dragGidRef = useRef(null)
  const dragMoveRef = useRef(null)
  const dragUpRef = useRef(null)
  const dragCloneRef = useRef(null)

  const handleDragMouseDown = useCallback((gid, e) => {
    if (disabled) return
    // 阻止后续 click 事件，由本 handler 统一处理点击/拖拽
    e.preventDefault()
    const card = e.currentTarget.closest('[style*="border-radius"]') || e.currentTarget
    if (!card) return

    const startX = e.clientX
    const startY = e.clientY
    const startTime = Date.now()
    let dragging = false
    let clone = null
    let currentHoverZone = null
    let currentSortTarget = null

    // 阻止文本选择的默认行为（仅在开始移动后）
    let selectionPrevented = false

    const highlightZone = (zoneEl) => {
      if (currentHoverZone && currentHoverZone !== zoneEl) {
        currentHoverZone.style.background = ''
        currentHoverZone.style.borderColor = ''
        currentHoverZone.style.outline = ''
      }
      if (zoneEl && zoneEl !== currentHoverZone) {
        zoneEl.style.background = '#f59e0b15'
        zoneEl.style.borderColor = '#f59e0b'
        zoneEl.style.outline = '2px solid #f59e0b'
        zoneEl.style.outlineOffset = '1px'
      }
      currentHoverZone = zoneEl
    }
    const highlightSortTarget = (sortEl) => {
      if (currentSortTarget && currentSortTarget !== sortEl) {
        currentSortTarget.style.outline = ''
        currentSortTarget.style.outlineOffset = ''
        currentSortTarget.style.borderLeft = ''
      }
      if (sortEl && sortEl !== currentSortTarget) {
        sortEl.style.outline = '2px solid #10b981'
        sortEl.style.outlineOffset = '1px'
        sortEl.style.borderLeft = '4px solid #10b981'
      }
      currentSortTarget = sortEl
    }

    /** 进入拖拽模式（移动超过阈值后调用） */
    const enterDragMode = (clientX, clientY) => {
      if (dragging) return
      dragging = true
      dragGidRef.current = gid
      onDragStart?.(gid)
      e.preventDefault()

      if (!selectionPrevented) {
        document.body.style.userSelect = 'none'
        selectionPrevented = true
      }

      onToast?.(isSortMode ? '拖拽到目标位置以排序' : '拖拽到专辑标签上以分配')

      // 创建拖拽克隆卡片
      clone = card.cloneNode(true)
      clone.style.position = 'fixed'
      clone.style.zIndex = '9999'
      clone.style.pointerEvents = 'none'
      clone.style.opacity = '0.85'
      clone.style.width = card.offsetWidth + 'px'
      clone.style.transform = 'rotate(2deg) scale(0.95)'
      clone.style.boxShadow = '0 8px 32px rgba(0,0,0,0.6)'
      clone.style.left = (clientX - card.offsetWidth / 2) + 'px'
      clone.style.top = (clientY - 100) + 'px'
      document.body.appendChild(clone)
      dragCloneRef.current = clone
    }

    const onMove = (me) => {
      const dx = me.clientX - startX
      const dy = me.clientY - startY
      const dt = Date.now() - startTime

      // 未超过拖拽阈值 → 不进入拖拽模式
      if (!dragging && Math.abs(dx) < DRAG_THRESHOLD && Math.abs(dy) < DRAG_THRESHOLD && dt < 300) {
        return
      }

      enterDragMode(me.clientX, me.clientY)

      if (clone) {
        clone.style.left = (me.clientX - card.offsetWidth / 2) + 'px'
        clone.style.top = (me.clientY - 100) + 'px'
      }
      if (clone) clone.style.display = 'none'
      const el = document.elementFromPoint(me.clientX, me.clientY)
      if (clone) clone.style.display = ''

      if (el) {
        const zoneBtn = el.closest('[data-drop-zone]')
        if (zoneBtn) {
          highlightZone(zoneBtn)
          highlightSortTarget(null)
        } else if (isSortMode) {
          highlightZone(null)
          const sortCard = el.closest('[data-sort-gid]')
          if (sortCard && sortCard.getAttribute('data-sort-gid') !== String(gid)) {
            highlightSortTarget(sortCard)
          } else {
            highlightSortTarget(null)
          }
        } else {
          highlightZone(null)
          highlightSortTarget(null)
        }
      } else {
        highlightZone(null)
        highlightSortTarget(null)
      }
    }

    const onUp = (me) => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      if (selectionPrevented) {
        document.body.style.userSelect = ''
      }
      highlightZone(null)
      highlightSortTarget(null)
      if (clone) { clone.remove(); dragCloneRef.current = null }
      dragMoveRef.current = null
      dragUpRef.current = null

      // 未进入拖拽模式 → 视为短点击
      if (!dragging) {
        dragGidRef.current = null
        onDragEnd?.()
        onShortClick?.(gid)
        return
      }

      const droppedGid = dragGidRef.current
      dragGidRef.current = null
      onDragEnd?.()

      if (droppedGid == null) return

      const el = document.elementFromPoint(me.clientX, me.clientY)
      if (el) {
        const zoneBtn = el.closest('[data-drop-zone]')
        if (zoneBtn) {
          const albumKey = zoneBtn.getAttribute('data-drop-zone')
          if (albumKey) { onDropToAlbum?.(droppedGid, albumKey); return }
        }
        if (isSortMode) {
          const sortCard = el.closest('[data-sort-gid]')
          if (sortCard) {
            const targetGid = parseInt(sortCard.getAttribute('data-sort-gid'))
            if (targetGid && targetGid !== droppedGid) {
              onDropToSort?.(droppedGid, targetGid); return
            }
          }
        }
      }
      onToast?.('已取消拖拽', 1000)
    }

    dragMoveRef.current = onMove
    dragUpRef.current = onUp
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }, [disabled, isSortMode, onDropToAlbum, onDropToSort, onShortClick, onDragStart, onDragEnd, onToast])

  return { dragGidRef, handleDragMouseDown }
}