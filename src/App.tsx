import { useMemo, useState } from 'react'
import CanvasStripEditor from './components/CanvasStripEditor'
import ThumbList from './components/ThumbList'
import type { CompositePreview, RectItem, SourceImage, ThumbItem } from './types'
import { buildPreviewComposite, loadFilesToBitmaps } from './utils/image'
import { useFps } from './hooks/useFps'

export default function App() {
  const [images, setImages] = useState<SourceImage[]>([])
  const [preview, setPreview] = useState<CompositePreview | null>(null)
  const [rects, setRects] = useState<RectItem[]>([])
  const [thumbs, setThumbs] = useState<ThumbItem[]>([])
  const [activeRectId, setActiveRectId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const fps = useFps()

  const stats = useMemo(() => {
    const originalW = images.length ? Math.max(...images.map((i) => i.width)) : 0
    const originalH = images.reduce((sum, i) => sum + i.height, 0)
    return {
      imageCount: images.length,
      originalW,
      originalH,
      previewW: preview?.width ?? 0,
      previewH: preview?.height ?? 0,
    }
  }, [images, preview])

  const onUpload = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return
    const files = Array.from(fileList).filter((f) => f.type.startsWith('image/'))
    if (files.length === 0) return

    setLoading(true)
    try {
      const imgs = await loadFilesToBitmaps(files)
      const pv = buildPreviewComposite(imgs, 1200)
      setImages(imgs)
      setPreview(pv)
      setRects([])
      setThumbs([])
      setActiveRectId(null)
    } finally {
      setLoading(false)
    }
  }

  const clearAll = () => {
    setImages([])
    setPreview(null)
    setRects([])
    setThumbs([])
    setActiveRectId(null)
  }

  const fpsColor = fps >= 55 ? '#4ade80' : fps >= 30 ? '#f0a500' : '#f87171'

  return (
    <div className="page">
      <div className="topbar">
        <div>
          <div className="title">长条漫画分镜裁剪 Demo</div>
          <div className="subtitle">
            Canvas 分层 + rAF 节流 + 高频状态走 ref + 缩略图 debounce 延迟生成
          </div>
        </div>

        <div className="topbar-actions">
          <div className="fps-badge" style={{ color: fpsColor }}>
            {fps} FPS
          </div>
          <label className="upload-btn">
            上传多张图片
            <input
              type="file"
              multiple
              accept="image/*"
              onChange={(e) => onUpload(e.target.files)}
              hidden
            />
          </label>
          <button className="ghost-btn" onClick={clearAll}>
            清空
          </button>
        </div>
      </div>

      <div className="stats">
        <span>图片数：{stats.imageCount}</span>
        <span>原图尺寸：{stats.originalW} × {stats.originalH}</span>
        <span>预览尺寸：{stats.previewW} × {stats.previewH}</span>
        <span>分镜数：{rects.length}</span>
        {loading && <span className="loading-badge">加载中...</span>}
      </div>

      <div className="main-layout">
        <CanvasStripEditor
          preview={preview}
          rects={rects}
          setRects={setRects}
          activeRectId={activeRectId}
          setActiveRectId={setActiveRectId}
          setThumbs={setThumbs}
        />

        <ThumbList
          rects={rects}
          thumbs={thumbs}
          activeRectId={activeRectId}
          onSelect={setActiveRectId}
          onDelete={(id) => {
            setRects((prev) => prev.filter((r) => r.id !== id))
            setThumbs((prev) => prev.filter((t) => t.rectId !== id))
            if (activeRectId === id) setActiveRectId(null)
          }}
        />
      </div>
    </div>
  )
}
