import { useRef, useState } from 'react'
import type { RectItem, ThumbItem } from '../types'

type Props = {
  rects: RectItem[]
  thumbs: ThumbItem[]
  activeRectId: string | null
  onSelect: (id: string) => void
  onDelete: (id: string) => void
  onReorder: (fromIndex: number, toIndex: number) => void
}

export default function ThumbList({
  rects,
  thumbs,
  activeRectId,
  onSelect,
  onDelete,
  onReorder,
}: Props) {
  const thumbMap = new Map(thumbs.map((t) => [t.rectId, t.dataUrl]))
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)
  // Prevent click firing after a successful drag
  const didDragRef = useRef(false)

  return (
    <div className="thumb-panel">
      <div className="panel-title">分镜列表（共 {rects.length} 格）</div>
      <div className="thumb-grid">
        {rects.map((rect, index) => {
          const url = thumbMap.get(rect.id)
          const isDragging = dragIndex === index
          const isDragOver = dragOverIndex === index && dragIndex !== index

          return (
            <div
              key={rect.id}
              draggable
              className={[
                'thumb-card',
                activeRectId === rect.id ? 'active' : '',
                isDragging   ? 'thumb-dragging'  : '',
                isDragOver   ? 'thumb-drag-over' : '',
              ].filter(Boolean).join(' ')}
              onDragStart={(e) => {
                didDragRef.current = false
                setDragIndex(index)
                e.dataTransfer.effectAllowed = 'move'
              }}
              onDragOver={(e) => {
                e.preventDefault()
                e.dataTransfer.dropEffect = 'move'
                if (dragOverIndex !== index) setDragOverIndex(index)
              }}
              onDragLeave={(e) => {
                // Only clear if leaving to an element outside this card
                if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) {
                  setDragOverIndex(null)
                }
              }}
              onDrop={(e) => {
                e.preventDefault()
                if (dragIndex !== null && dragIndex !== index) {
                  didDragRef.current = true
                  onReorder(dragIndex, index)
                }
                setDragIndex(null)
                setDragOverIndex(null)
              }}
              onDragEnd={() => {
                setDragIndex(null)
                setDragOverIndex(null)
              }}
              onClick={() => {
                if (!didDragRef.current) onSelect(rect.id)
                didDragRef.current = false
              }}
            >
              {/* Drag handle — visual affordance, always in top-left */}
              <div className="thumb-drag-handle" title="拖动排序">
                <svg width="10" height="14" viewBox="0 0 10 14" fill="currentColor">
                  <circle cx="2.5" cy="2.5" r="1.5" />
                  <circle cx="7.5" cy="2.5" r="1.5" />
                  <circle cx="2.5" cy="7"   r="1.5" />
                  <circle cx="7.5" cy="7"   r="1.5" />
                  <circle cx="2.5" cy="11.5" r="1.5" />
                  <circle cx="7.5" cy="11.5" r="1.5" />
                </svg>
              </div>

              <div className="thumb-image-wrap">
                {url ? (
                  <img src={url} className="thumb-image" alt={`thumb-${index + 1}`} />
                ) : (
                  <div className="thumb-placeholder">
                    <span className="thumb-spinner" />
                    <span>截取中</span>
                  </div>
                )}
              </div>

              <div className="thumb-footer">
                <span>#{index + 1}</span>
                <button
                  className="delete-btn"
                  title="删除"
                  onClick={(e) => {
                    e.stopPropagation()
                    onDelete(rect.id)
                  }}
                >
                  🗑
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
