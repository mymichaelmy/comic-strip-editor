import type { RectItem, ViewState } from '../types'

export function uidRect() {
  return Math.random().toString(36).slice(2)
}

export function normalizeRect(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): Pick<RectItem, 'x' | 'y' | 'width' | 'height'> {
  const x = Math.min(x1, x2)
  const y = Math.min(y1, y2)
  const width = Math.abs(x2 - x1)
  const height = Math.abs(y2 - y1)
  return { x, y, width, height }
}

export function screenToImage(
  sx: number,
  sy: number,
  view: ViewState,
) {
  return {
    x: (sx - view.offsetX) / view.zoom,
    y: (sy - view.offsetY) / view.zoom,
  }
}

export function imageToScreen(
  x: number,
  y: number,
  view: ViewState,
) {
  return {
    x: x * view.zoom + view.offsetX,
    y: y * view.zoom + view.offsetY,
  }
}

export function hitTestRect(
  imageX: number,
  imageY: number,
  rects: RectItem[],
) {
  for (let i = rects.length - 1; i >= 0; i--) {
    const r = rects[i]
    if (
      imageX >= r.x &&
      imageX <= r.x + r.width &&
      imageY >= r.y &&
      imageY <= r.y + r.height
    ) {
      return r
    }
  }
  return null
}
