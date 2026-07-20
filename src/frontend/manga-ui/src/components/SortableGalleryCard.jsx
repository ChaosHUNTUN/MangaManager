import { memo } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import GalleryCard from './GalleryCard'

/**
 * @dnd-kit 可排序画廊卡片包装器
 * useSortable 的 hook 规则要求必须在此模块级组件中调用，以避免 React Hook 警告
 */
const SortableGalleryCard = memo(({ g, isSel, ...cardProps }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: g.gid })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : undefined,
  }
  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <GalleryCard g={g} isSel={isSel} {...cardProps} />
    </div>
  )
})

SortableGalleryCard.displayName = 'SortableGalleryCard'

export default SortableGalleryCard