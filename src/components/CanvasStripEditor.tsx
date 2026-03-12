import { useCallback, useEffect, useMemo, useRef } from 'react'
import type { CompositePreview, RectItem, ThumbItem, ViewState } from '../types'
import { hitTestRect, imageToScreen, normalizeRect, screenToImage, uidRect } from '../utils/rect'
import { clampRectToBounds } from '../utils/image'
import { useRafRender } from '../hooks/useRafRender'

type Props = {
  preview: CompositePreview | null
  rects: RectItem[]
  setRects: React.Dispatch<React.SetStateAction<RectItem[]>>
  activeRectId: string | null
  setActiveRectId: React.Dispatch<React.SetStateAction<string | null>>
  setThumbs: React.Dispatch<React.SetStateAction<ThumbItem[]>>
}

type DragMode = 'none' | 'create' | 'move'

const MIN_RECT_SIZE = 20

export default function CanvasStripEditor({
  preview,
  rects,
  setRects,
  activeRectId,
  setActiveRectId,
  setThumbs,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const bgCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null)

  const viewRef = useRef<ViewState>({
    zoom: 1,
    offsetX: 20,
    offsetY: 20,
  })

  const dragModeRef = useRef<DragMode>('none')
  const pointerStartRef = useRef({ x: 0, y: 0 })

  const createRectStartRef = useRef({ x: 0, y: 0 })
  const tempRectRef = useRef<RectItem | null>(null)
  const movingRectIdRef = useRef<string | null>(null)
  const movingRectOriginRef = useRef({ x: 0, y: 0 })
  const hoverRectIdRef = useRef<string | null>(null)
  const activeRectIdRef = useRef<string | null>(activeRectId)

  // Keep activeRectIdRef in sync so render() doesn't need to re-create on every change
  useEffect(() => {
    activeRectIdRef.current = activeRectId
  }, [activeRectId])

  const rectsRef = useRef<RectItem[]>(rects)
  useEffect(() => {
    rectsRef.current = rects
  }, [rects])

  const imageSize = useMemo(() => {
    return {
      width: preview?.width ?? 1,
      height: preview?.height ?? 1,
    }
  }, [preview])

  const resizeCanvases = useCallback(() => {
    const container = containerRef.current
    const bg = bgCanvasRef.current
    const overlay = overlayCanvasRef.current
    if (!container || !bg || !overlay) return

    const rect = container.getBoundingClientRect()
    const dpr = Math.min(window.devicePixelRatio || 1, 2)

    for (const canvas of [bg, overlay]) {
      canvas.width = Math.max(1, Math.floor(rect.width * dpr))
      canvas.height = Math.max(1, Math.floor(rect.height * dpr))
      canvas.style.width = `${rect.width}px`
      canvas.style.height = `${rect.height}px`
      const ctx = canvas.getContext('2d')!
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
  }, [])

  // Fit image to panel width; called on preview load and container resize
  const fitToWidth = useCallback(() => {
    const container = containerRef.current
    if (!container || !preview) return
    const zoom = container.clientWidth / preview.width
    viewRef.current = { zoom, offsetX: 0, offsetY: 0 }
  }, [preview])

  // render reads from refs only — stable, never needs to be re-created
  const render = useCallback(() => {
    const bg = bgCanvasRef.current
    const overlay = overlayCanvasRef.current
    if (!bg || !overlay) return

    const bgCtx = bg.getContext('2d')!
    const ovCtx = overlay.getContext('2d')!

    const width = bg.clientWidth
    const height = bg.clientHeight

    bgCtx.clearRect(0, 0, width, height)
    ovCtx.clearRect(0, 0, width, height)

    bgCtx.fillStyle = '#0b0b0b'
    bgCtx.fillRect(0, 0, width, height)

    if (!preview) return

    const view = viewRef.current
    // snap(v) rounds v to the nearest physical-pixel boundary.
    // The canvas has setTransform(dpr,…) applied, so drawing at CSS px `v` maps to
    // physical px `v * dpr`. If that's not an integer the browser anti-aliases the edge,
    // producing a visible seam. snap() ensures v * dpr is always an exact integer.
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const snap = (v: number) => Math.round(v * dpr) / dpr

    for (const src of preview.sources) {
      const imgY = Math.round(src.offsetY * preview.scale)
      const imgBottom = Math.round((src.offsetY + src.height) * preview.scale)
      const screenTop = snap(imgY * view.zoom + view.offsetY)
      const screenBot = snap(imgBottom * view.zoom + view.offsetY)
      if (screenBot < 0 || screenTop > height) continue
      const imgX = Math.round((preview.width - Math.round(src.width * preview.scale)) / 2)
      const imgRight = imgX + Math.round(src.width * preview.scale)
      const screenLeft = snap(imgX * view.zoom + view.offsetX)
      const screenRight = snap(imgRight * view.zoom + view.offsetX)
      bgCtx.drawImage(src.bitmap, screenLeft, screenTop, screenRight - screenLeft, screenBot - screenTop)
    }

    const activeId = activeRectIdRef.current
    const hoverId = hoverRectIdRef.current

    const drawRect = (r: RectItem, active: boolean, hover: boolean) => {
      const p = imageToScreen(r.x, r.y, view)
      const sw = r.width * view.zoom
      const sh = r.height * view.zoom

      ovCtx.fillStyle = active
        ? 'rgba(77,163,255,0.18)'
        : hover
        ? 'rgba(255,255,255,0.10)'
        : 'rgba(255,99,99,0.12)'
      ovCtx.strokeStyle = active ? '#4da3ff' : hover ? '#ffffff' : '#ff6b6b'
      ovCtx.lineWidth = active ? 2 : 1
      ovCtx.fillRect(p.x, p.y, sw, sh)
      ovCtx.strokeRect(p.x, p.y, sw, sh)

      const handleSize = 8
      ovCtx.fillStyle = active ? '#4da3ff' : '#ff6b6b'
      ovCtx.fillRect(p.x - handleSize / 2, p.y - handleSize / 2, handleSize, handleSize)
      ovCtx.fillRect(p.x + sw - handleSize / 2, p.y - handleSize / 2, handleSize, handleSize)
      ovCtx.fillRect(p.x - handleSize / 2, p.y + sh - handleSize / 2, handleSize, handleSize)
      ovCtx.fillRect(p.x + sw - handleSize / 2, p.y + sh - handleSize / 2, handleSize, handleSize)
    }

    for (const r of rectsRef.current) {
      drawRect(r, r.id === activeId, r.id === hoverId)
    }

    if (tempRectRef.current) {
      drawRect(tempRectRef.current, true, false)
    }
  // preview is a stable canvas object — only needs to be in deps for initial load
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preview])

  const scheduleRender = useRafRender(render)

  useEffect(() => {
    resizeCanvases()
    fitToWidth()
    scheduleRender()
  }, [resizeCanvases, fitToWidth, scheduleRender, preview])

  useEffect(() => {
    scheduleRender()
  }, [scheduleRender, rects, activeRectId])

  useEffect(() => {
    const onResize = () => {
      resizeCanvases()
      fitToWidth()
      scheduleRender()
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [fitToWidth, resizeCanvases, scheduleRender])

  const getLocalPoint = useCallback((e: PointerEvent | MouseEvent | WheelEvent) => {
    const rect = overlayCanvasRef.current!.getBoundingClientRect()
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    }
  }, [])

  // FIX: onWheel must be bound as a non-passive native listener to allow preventDefault()
  // React synthetic wheel events are passive by default in modern browsers.
  useEffect(() => {
    const overlay = overlayCanvasRef.current
    if (!overlay) return

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault()
      if (!preview) return

      const container = containerRef.current
      if (!container) return

      const view = viewRef.current
      const viewH = container.clientHeight
      const scaledH = preview.height * view.zoom
      const minOffsetY = Math.min(0, viewH - scaledH)
      view.offsetY = Math.max(minOffsetY, Math.min(0, view.offsetY - e.deltaY))

      scheduleRender()
    }

    overlay.addEventListener('wheel', handleWheel, { passive: false })
    return () => overlay.removeEventListener('wheel', handleWheel)
  }, [preview, scheduleRender])

  const debounceTimerRef = useRef<number | null>(null)

  const rebuildThumbs = useCallback(() => {
    if (!preview) return

    const output: ThumbItem[] = []
    for (const rect of rectsRef.current) {
      const targetW = 180
      const targetH = Math.max(1, Math.round(rect.height * (targetW / rect.width)))

      const canvas = document.createElement('canvas')
      canvas.width = targetW
      canvas.height = targetH
      const ctx = canvas.getContext('2d')!

      ctx.fillStyle = '#fff'
      ctx.fillRect(0, 0, targetW, targetH)

      // Draw from each source bitmap that intersects this rect
      for (const src of preview.sources) {
        const imgY = Math.round(src.offsetY * preview.scale)
        const imgBottom = Math.round((src.offsetY + src.height) * preview.scale)
        const imgH = imgBottom - imgY
        const imgW = Math.round(src.width * preview.scale)
        const imgX = Math.round((preview.width - imgW) / 2)

        if (imgY + imgH <= rect.y || imgY >= rect.y + rect.height) continue
        if (imgX + imgW <= rect.x || imgX >= rect.x + rect.width) continue

        // Intersection in image-space
        const intX = Math.max(rect.x, imgX)
        const intY = Math.max(rect.y, imgY)
        const intW = Math.min(rect.x + rect.width, imgX + imgW) - intX
        const intH = Math.min(rect.y + rect.height, imgY + imgH) - intY

        ctx.drawImage(
          src.bitmap,
          (intX - imgX) / preview.scale,     // src x in original px
          (intY - imgY) / preview.scale,     // src y in original px
          intW / preview.scale,               // src w in original px
          intH / preview.scale,               // src h in original px
          ((intX - rect.x) / rect.width) * targetW,
          ((intY - rect.y) / rect.height) * targetH,
          (intW / rect.width) * targetW,
          (intH / rect.height) * targetH,
        )
      }

      output.push({
        rectId: rect.id,
        dataUrl: canvas.toDataURL('image/jpeg', 0.85),
      })
    }

    setThumbs(output)
  }, [preview, setThumbs])

  const scheduleThumbs = useCallback(() => {
    if (debounceTimerRef.current) {
      window.clearTimeout(debounceTimerRef.current)
    }
    debounceTimerRef.current = window.setTimeout(() => {
      rebuildThumbs()
    }, 120)
  }, [rebuildThumbs])

  useEffect(() => {
    scheduleThumbs()
    return () => {
      if (debounceTimerRef.current) window.clearTimeout(debounceTimerRef.current)
    }
  }, [rects, preview, scheduleThumbs])

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (!preview) return
    ;(e.currentTarget as HTMLCanvasElement).setPointerCapture(e.pointerId)

    const local = getLocalPoint(e.nativeEvent)
    pointerStartRef.current = local

    const imagePoint = screenToImage(local.x, local.y, viewRef.current)
    const hit = hitTestRect(imagePoint.x, imagePoint.y, rectsRef.current)

    if (e.shiftKey) {
      dragModeRef.current = 'create'
      createRectStartRef.current = imagePoint
      tempRectRef.current = {
        id: 'temp',
        x: imagePoint.x,
        y: imagePoint.y,
        width: 1,
        height: 1,
      }
      setActiveRectId(null)
      scheduleRender()
      return
    }

    if (hit) {
      dragModeRef.current = 'move'
      movingRectIdRef.current = hit.id
      movingRectOriginRef.current = { x: hit.x, y: hit.y }
      setActiveRectId(hit.id)
      scheduleRender()
      return
    }

    setActiveRectId(null)
    scheduleRender()
  }, [getLocalPoint, preview, scheduleRender, setActiveRectId])

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!preview) return

    const local = getLocalPoint(e.nativeEvent)

    if (dragModeRef.current === 'none') {
      const imagePoint = screenToImage(local.x, local.y, viewRef.current)
      const hit = hitTestRect(imagePoint.x, imagePoint.y, rectsRef.current)
      const nextHover = hit?.id ?? null
      if (nextHover !== hoverRectIdRef.current) {
        hoverRectIdRef.current = nextHover
        scheduleRender()
      }
      return
    }

    if (dragModeRef.current === 'create') {
      const start = createRectStartRef.current
      const p = screenToImage(local.x, local.y, viewRef.current)
      const norm = normalizeRect(start.x, start.y, p.x, p.y)
      tempRectRef.current = { id: 'temp', ...norm }
      scheduleRender()
      return
    }

    if (dragModeRef.current === 'move') {
      const rectId = movingRectIdRef.current
      if (!rectId) return

      const dx = (local.x - pointerStartRef.current.x) / viewRef.current.zoom
      const dy = (local.y - pointerStartRef.current.y) / viewRef.current.zoom

      const target = rectsRef.current.find((r) => r.id === rectId)
      if (!target) return

      const next = clampRectToBounds(
        movingRectOriginRef.current.x + dx,
        movingRectOriginRef.current.y + dy,
        target.width,
        target.height,
        imageSize.width,
        imageSize.height,
      )

      // Mutate ref directly for zero-cost render during drag; sync to state on pointerUp
      rectsRef.current = rectsRef.current.map((r) =>
        r.id === rectId ? { ...r, ...next } : r,
      )

      scheduleRender()
      return
    }
  }, [getLocalPoint, imageSize.height, imageSize.width, preview, scheduleRender])

  const onPointerUp = useCallback(() => {
    if (!preview) return

    if (dragModeRef.current === 'create' && tempRectRef.current) {
      const t = tempRectRef.current
      if (t.width >= MIN_RECT_SIZE && t.height >= MIN_RECT_SIZE) {
        const finalRect: RectItem = {
          id: uidRect(),
          ...clampRectToBounds(
            t.x,
            t.y,
            t.width,
            t.height,
            imageSize.width,
            imageSize.height,
          ),
        }
        setRects((prev) => [...prev, finalRect])
        setActiveRectId(finalRect.id)
      }
      tempRectRef.current = null
    } else if (dragModeRef.current === 'move') {
      // Flush ref mutations back to React state
      setRects([...rectsRef.current])
    }

    dragModeRef.current = 'none'
    movingRectIdRef.current = null
    scheduleRender()
  }, [imageSize.height, imageSize.width, preview, scheduleRender, setActiveRectId, setRects])

  return (
    <div className="editor-shell">
      <div className="editor-left">
        <div className="editor-toolbar">
          <span>操作说明：</span>
          <span>滚轮滚动</span>
          <span>Ctrl/⌘ + 滚轮缩放</span>
          <span>拖空白处平移</span>
          <span className="tip-highlight">Shift + 拖动 创建分镜框</span>
          <span>拖已有框移动</span>
        </div>

        <div ref={containerRef} className="canvas-container">
          {/* Background canvas: image only — repainted rarely */}
          <canvas ref={bgCanvasRef} className="canvas-layer" />
          {/* Overlay canvas: rects + handles — all pointer events here */}
          <canvas
            ref={overlayCanvasRef}
            className="canvas-layer overlay"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
          />
        </div>
      </div>
    </div>
  )
}
