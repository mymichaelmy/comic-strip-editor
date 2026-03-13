import type { CompositePreview, SourceImage } from '../types'

function uid() {
  return Math.random().toString(36).slice(2)
}

export async function loadFilesToBitmaps(files: File[]): Promise<SourceImage[]> {
  const bitmaps = await Promise.all(
    files.map(async (file) => {
      const bitmap = await createImageBitmap(file)
      return {
        id: uid(),
        name: file.name,
        bitmap,
        width: bitmap.width,
        height: bitmap.height,
        offsetY: 0,
      }
    }),
  )

  let accY = 0
  for (const img of bitmaps) {
    img.offsetY = accY
    accY += img.height
  }

  return bitmaps
}

export function buildPreviewComposite(
  images: SourceImage[],
  targetWidth = 1200,
): CompositePreview {
  if (images.length === 0) {
    return { width: 1, height: 1, scale: 1, sources: [] }
  }

  const maxWidth = Math.max(...images.map((i) => i.width))
  const scale = targetWidth / maxWidth
  const previewWidth = Math.round(maxWidth * scale)
  let previewHeight = 0

  const sources = images.map((image) => {
    const scaledWidth = Math.round(image.width * scale)
    const scaledHeight = Math.round(image.height * scale)
    const previewOffsetY = previewHeight
    previewHeight += scaledHeight

    return {
      ...image,
      previewOffsetX: Math.round((previewWidth - scaledWidth) / 2),
      previewOffsetY,
      previewWidth: scaledWidth,
      previewHeight: scaledHeight,
    }
  })

  // Cache preview-space placement so long strips do not accumulate per-frame rounding drift.
  return { width: previewWidth, height: previewHeight, scale, sources }
}

export function clampRectToBounds(
  x: number,
  y: number,
  width: number,
  height: number,
  maxW: number,
  maxH: number,
) {
  let nx = x
  let ny = y
  let nw = width
  let nh = height

  if (nw < 1) nw = 1
  if (nh < 1) nh = 1
  if (nx < 0) nx = 0
  if (ny < 0) ny = 0
  if (nx + nw > maxW) nx = maxW - nw
  if (ny + nh > maxH) ny = maxH - nh
  if (nx < 0) nx = 0
  if (ny < 0) ny = 0

  return { x: nx, y: ny, width: nw, height: nh }
}
