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

type ResizeHandle = 'tl' | 'tc' | 'tr' | 'ml' | 'mr' | 'bl' | 'bc' | 'br'
type DragMode = 'none' | 'create' | 'move' | 'resize'

const MIN_RECT_SIZE = 20

const HANDLE_CURSORS: Record<ResizeHandle, string> = {
  tl: 'nw-resize', tc: 'n-resize',  tr: 'ne-resize',
  ml: 'w-resize',                    mr: 'e-resize',
  bl: 'sw-resize', bc: 's-resize',  br: 'se-resize',
}

function getHandlePositions(r: RectItem, view: ViewState) {
  const p = imageToScreen(r.x, r.y, view)
  const sw = r.width * view.zoom
  const sh = r.height * view.zoom
  return [
    { handle: 'tl' as ResizeHandle, cx: p.x,          cy: p.y },
    { handle: 'tc' as ResizeHandle, cx: p.x + sw / 2, cy: p.y },
    { handle: 'tr' as ResizeHandle, cx: p.x + sw,     cy: p.y },
    { handle: 'ml' as ResizeHandle, cx: p.x,          cy: p.y + sh / 2 },
    { handle: 'mr' as ResizeHandle, cx: p.x + sw,     cy: p.y + sh / 2 },
    { handle: 'bl' as ResizeHandle, cx: p.x,          cy: p.y + sh },
    { handle: 'bc' as ResizeHandle, cx: p.x + sw / 2, cy: p.y + sh },
    { handle: 'br' as ResizeHandle, cx: p.x + sw,     cy: p.y + sh },
  ]
}

function hitTestHandle(sx: number, sy: number, r: RectItem, view: ViewState): ResizeHandle | null {
  for (const { handle, cx, cy } of getHandlePositions(r, view)) {
    if (Math.abs(sx - cx) <= 6 && Math.abs(sy - cy) <= 6) return handle
  }
  return null
}

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
  const scrollTrackRef = useRef<HTMLDivElement | null>(null)
  const scrollThumbRef = useRef<HTMLDivElement | null>(null)
  const scrollDragRef = useRef<{ startY: number; startOffsetY: number } | null>(null)

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
  const resizingRectIdRef = useRef<string | null>(null)
  const resizingHandleRef = useRef<ResizeHandle | null>(null)
  const resizingOriginRef = useRef<RectItem | null>(null)
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
        ? 'rgba(255,99,99,0.22)'
        : 'rgba(255,99,99,0.10)'
      ovCtx.strokeStyle = active ? '#4da3ff' : '#ff6b6b'
      ovCtx.lineWidth = active ? 2 : 1
      ovCtx.fillRect(p.x, p.y, sw, sh)
      ovCtx.strokeRect(p.x, p.y, sw, sh)

      const hs = 8
      ovCtx.fillStyle = active ? '#4da3ff' : '#ff6b6b'
      for (const { cx, cy } of getHandlePositions(r, view)) {
        ovCtx.fillRect(cx - hs / 2, cy - hs / 2, hs, hs)
      }
    }

    for (const r of rectsRef.current) {
      drawRect(r, r.id === activeId, r.id === hoverId)
    }

    if (tempRectRef.current) {
      drawRect(tempRectRef.current, true, false)
    }

    // Sync scrollbar thumb — direct DOM update, no React re-render
    const scrollThumb = scrollThumbRef.current
    const scrollTrack = scrollTrackRef.current
    if (scrollThumb && scrollTrack) {
      const trackH = scrollTrack.clientHeight
      const totalH = preview.height * view.zoom
      if (totalH <= height) {
        scrollThumb.style.display = 'none'
      } else {
        scrollThumb.style.display = 'block'
        const thumbH = Math.max(36, (height / totalH) * trackH)
        const maxThumbTop = trackH - thumbH
        const scrollRatio = Math.min(1, -view.offsetY / (totalH - height))
        scrollThumb.style.height = `${thumbH}px`
        scrollThumb.style.top = `${scrollRatio * maxThumbTop}px`
      }
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

  // Scroll to active rect if it's outside the viewport (e.g. selected from thumbnail panel)
  useEffect(() => {
    if (!activeRectId || !preview) return
    const rect = rectsRef.current.find((r) => r.id === activeRectId)
    if (!rect) return
    const container = containerRef.current
    if (!container) return
    const view = viewRef.current
    const viewH = container.clientHeight
    const rectTop = rect.y * view.zoom + view.offsetY
    const rectBot = (rect.y + rect.height) * view.zoom + view.offsetY
    if (rectTop >= 0 && rectBot <= viewH) return // already fully visible
    const scaledH = preview.height * view.zoom
    const minOffsetY = Math.min(0, viewH - scaledH)
    const targetOffsetY = viewH / 2 - (rect.y + rect.height / 2) * view.zoom
    view.offsetY = Math.max(minOffsetY, Math.min(0, targetOffsetY))
    scheduleRender()
  }, [activeRectId, preview, scheduleRender])

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
      // Snap rect to integer pixel boundaries so all intersection math is exact
      const rx = Math.round(rect.x)
      const ry = Math.round(rect.y)
      const rRight  = Math.round(rect.x + rect.width)
      const rBottom = Math.round(rect.y + rect.height)
      const rw = rRight - rx
      const rh = rBottom - ry

      const targetW = 180
      const targetH = Math.max(1, Math.round(rh * (targetW / rw)))

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
        const imgW = Math.round(src.width * preview.scale)
        const imgX = Math.round((preview.width - imgW) / 2)

        if (imgBottom <= ry || imgY >= rBottom) continue
        if (imgX + imgW <= rx || imgX >= rRight) continue

        // Intersection in image-space (all integers now)
        const intX = Math.max(rx, imgX)
        const intY = Math.max(ry, imgY)
        const intR = Math.min(rRight, imgX + imgW)
        const intB = Math.min(rBottom, imgBottom)
        const intW = intR - intX
        const intH = intB - intY

        // Derive dst edges independently — guaranteed exact integer adjacency
        const dstL = Math.round(((intX - rx) / rw) * targetW)
        const dstT = Math.round(((intY - ry) / rh) * targetH)
        const dstR = Math.round(((intR - rx) / rw) * targetW)
        const dstB = Math.round(((intB - ry) / rh) * targetH)
        // Clamp source region to actual bitmap bounds — prevents sub-pixel overshoot
        // that occurs when (intH / scale) slightly exceeds the bitmap edge due to
        // float rounding in the Math.round(offsetY * scale) boundary computation.
        const srcX = Math.max(0, (intX - imgX) / preview.scale)
        const srcY = Math.max(0, (intY - imgY) / preview.scale)
        const srcW = Math.min(src.width  - srcX, intW / preview.scale)
        const srcH = Math.min(src.height - srcY, intH / preview.scale)
        ctx.drawImage(src.bitmap, srcX, srcY, srcW, srcH, dstL, dstT, dstR - dstL, dstB - dstT)
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

  const onScrollThumbDown = useCallback((e: React.PointerEvent) => {
    e.stopPropagation()
    ;(e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId)
    scrollDragRef.current = { startY: e.clientY, startOffsetY: viewRef.current.offsetY }
  }, [])

  const onScrollThumbMove = useCallback((e: React.PointerEvent) => {
    if (!scrollDragRef.current || !preview) return
    const track = scrollTrackRef.current
    const container = containerRef.current
    if (!track || !container) return
    const trackH = track.clientHeight
    const viewH = container.clientHeight
    const totalH = preview.height * viewRef.current.zoom
    const thumbH = Math.max(36, (viewH / totalH) * trackH)
    const maxThumbTop = trackH - thumbH
    const dy = e.clientY - scrollDragRef.current.startY
    const deltaOffset = -(dy / maxThumbTop) * (totalH - viewH)
    const minOffsetY = Math.min(0, viewH - totalH)
    viewRef.current.offsetY = Math.max(minOffsetY, Math.min(0, scrollDragRef.current.startOffsetY + deltaOffset))
    scheduleRender()
  }, [preview, scheduleRender])

  const onScrollThumbUp = useCallback(() => {
    scrollDragRef.current = null
  }, [])

  const onScrollTrackClick = useCallback((e: React.MouseEvent) => {
    if (!preview) return
    const thumb = scrollThumbRef.current
    if (thumb && thumb.contains(e.target as Node)) return
    const track = scrollTrackRef.current
    const container = containerRef.current
    if (!track || !container) return
    const trackH = track.clientHeight
    const viewH = container.clientHeight
    const totalH = preview.height * viewRef.current.zoom
    const thumbH = Math.max(36, (viewH / totalH) * trackH)
    const maxThumbTop = trackH - thumbH
    const clickY = e.clientY - track.getBoundingClientRect().top
    const thumbTop = Math.max(0, Math.min(maxThumbTop, clickY - thumbH / 2))
    const scrollRatio = thumbTop / maxThumbTop
    const minOffsetY = Math.min(0, viewH - totalH)
    viewRef.current.offsetY = Math.max(minOffsetY, Math.min(0, -scrollRatio * (totalH - viewH)))
    scheduleRender()
  }, [preview, scheduleRender])

  const onAddRect = useCallback(() => {
    if (!preview) return
    const container = containerRef.current
    if (!container) return
    const view = viewRef.current
    const viewW = container.clientWidth
    const viewH = container.clientHeight
    const centerX = (viewW / 2 - view.offsetX) / view.zoom
    const centerY = (viewH / 2 - view.offsetY) / view.zoom
    const defaultW = (viewW / view.zoom) * 0.6
    const defaultH = defaultW * (4 / 3)
    const clamped = clampRectToBounds(
      centerX - defaultW / 2,
      centerY - defaultH / 2,
      defaultW,
      defaultH,
      imageSize.width,
      imageSize.height,
    )
    const newRect: RectItem = { id: uidRect(), ...clamped }
    setRects((prev) => [...prev, newRect])
    setActiveRectId(newRect.id)
  }, [imageSize.height, imageSize.width, preview, setActiveRectId, setRects])

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

    // Check resize handles on active / hovered rect before body hit-test
    const candidateIds = [activeRectIdRef.current, hoverRectIdRef.current].filter(Boolean) as string[]
    for (const id of candidateIds) {
      const candidate = rectsRef.current.find((r) => r.id === id)
      if (!candidate) continue
      const handle = hitTestHandle(local.x, local.y, candidate, viewRef.current)
      if (handle) {
        dragModeRef.current = 'resize'
        resizingRectIdRef.current = id
        resizingHandleRef.current = handle
        resizingOriginRef.current = { ...candidate }
        setActiveRectId(id)
        scheduleRender()
        return
      }
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

      // Update cursor: check handles first, then rect body
      const overlay = overlayCanvasRef.current
      if (overlay) {
        const candidateIds = [activeRectIdRef.current, hoverRectIdRef.current].filter(Boolean) as string[]
        let cursor = 'default'
        for (const id of candidateIds) {
          const candidate = rectsRef.current.find((r) => r.id === id)
          if (!candidate) continue
          const h = hitTestHandle(local.x, local.y, candidate, viewRef.current)
          if (h) { cursor = HANDLE_CURSORS[h]; break }
        }
        if (cursor === 'default' && hit) cursor = 'move'
        overlay.style.cursor = cursor
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

      rectsRef.current = rectsRef.current.map((r) =>
        r.id === rectId ? { ...r, ...next } : r,
      )

      scheduleRender()
      return
    }

    if (dragModeRef.current === 'resize') {
      const rectId = resizingRectIdRef.current
      const handle = resizingHandleRef.current
      const origin = resizingOriginRef.current
      if (!rectId || !handle || !origin) return

      const dx = (local.x - pointerStartRef.current.x) / viewRef.current.zoom
      const dy = (local.y - pointerStartRef.current.y) / viewRef.current.zoom

      // Fixed opposite edges — these never move regardless of clamping
      const fixedRight  = origin.x + origin.width
      const fixedBottom = origin.y + origin.height
      const fixedLeft   = origin.x
      const fixedTop    = origin.y

      let x = origin.x, y = origin.y, width = origin.width, height = origin.height

      if (handle.includes('l')) {
        const newLeft = Math.max(0, Math.min(fixedRight - MIN_RECT_SIZE, origin.x + dx))
        x = newLeft
        width = fixedRight - newLeft
      }
      if (handle.includes('r')) {
        const newRight = Math.min(imageSize.width, Math.max(fixedLeft + MIN_RECT_SIZE, fixedRight + dx))
        width = newRight - fixedLeft
      }
      if (handle.includes('t')) {
        const newTop = Math.max(0, Math.min(fixedBottom - MIN_RECT_SIZE, origin.y + dy))
        y = newTop
        height = fixedBottom - newTop
      }
      if (handle.includes('b')) {
        const newBottom = Math.min(imageSize.height, Math.max(fixedTop + MIN_RECT_SIZE, fixedBottom + dy))
        height = newBottom - fixedTop
      }

      const next = { x, y, width, height }

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
    } else if (dragModeRef.current === 'move' || dragModeRef.current === 'resize') {
      // Flush ref mutations back to React state
      setRects([...rectsRef.current])
    }

    dragModeRef.current = 'none'
    movingRectIdRef.current = null
    resizingRectIdRef.current = null
    resizingHandleRef.current = null
    resizingOriginRef.current = null
    scheduleRender()
  }, [imageSize.height, imageSize.width, preview, scheduleRender, setActiveRectId, setRects])

  return (
    <div className="editor-shell">
      <div className="editor-left">
        <div className="editor-toolbar">
          <button className="add-rect-btn" onClick={onAddRect} disabled={!preview}>
            + 新建分镜框
          </button>
          <span className="toolbar-divider" />
          <span>滚轮滚动</span>
          <span>Shift + 拖动 创建框</span>
          <span>拖框移动 · 拖角 Resize</span>
        </div>

        <div className="editor-canvas-row">
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

          {/* Custom scrollbar — sits outside canvas, never overlaps content */}
          <div
            ref={scrollTrackRef}
            className="canvas-scrollbar-track"
            onClick={onScrollTrackClick}
          >
            <div
              ref={scrollThumbRef}
              className="canvas-scrollbar-thumb"
              onPointerDown={onScrollThumbDown}
              onPointerMove={onScrollThumbMove}
              onPointerUp={onScrollThumbUp}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
