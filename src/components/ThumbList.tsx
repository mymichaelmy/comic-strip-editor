import type { RectItem, ThumbItem } from '../types'

type Props = {
  rects: RectItem[]
  thumbs: ThumbItem[]
  activeRectId: string | null
  onSelect: (id: string) => void
  onDelete: (id: string) => void
}

export default function ThumbList({
  rects,
  thumbs,
  activeRectId,
  onSelect,
  onDelete,
}: Props) {
  const thumbMap = new Map(thumbs.map((t) => [t.rectId, t.dataUrl]))

  return (
    <div className="thumb-panel">
      <div className="panel-title">分镜列表（共 {rects.length} 格）</div>
      <div className="thumb-grid">
        {rects.map((rect, index) => {
          const url = thumbMap.get(rect.id)
          return (
            <div
              key={rect.id}
              className={`thumb-card ${activeRectId === rect.id ? 'active' : ''}`}
              onClick={() => onSelect(rect.id)}
            >
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
