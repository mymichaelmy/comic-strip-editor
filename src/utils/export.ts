import JSZip from 'jszip'
import type { CompositePreview, RectItem } from '../types'

/**
 * Crop each rect at full resolution (1:1 pixel copy, no scaling) from the
 * original ImageBitmaps, pack as PNG into a ZIP, and trigger download.
 */
export async function exportZip(
  rects: RectItem[],
  preview: CompositePreview,
): Promise<void> {
  const zip = new JSZip()

  // Horizontal centering offset is based on the widest original image
  const maxOrigW = Math.max(...preview.sources.map((s) => s.width))

  for (let i = 0; i < rects.length; i++) {
    const rect = rects[i]

    // Convert preview-space rect edges → original pixel integers
    // Round edges independently (same as rebuildThumbs) to avoid drift
    const rx0 = Math.round(rect.x / preview.scale)
    const ry0 = Math.round(rect.y / preview.scale)
    const rx1 = Math.round((rect.x + rect.width) / preview.scale)
    const ry1 = Math.round((rect.y + rect.height) / preview.scale)

    const canvasW = rx1 - rx0
    const canvasH = ry1 - ry0
    if (canvasW <= 0 || canvasH <= 0) continue

    const canvas = document.createElement('canvas')
    canvas.width = canvasW
    canvas.height = canvasH
    const ctx = canvas.getContext('2d')!

    for (const src of preview.sources) {
      // Source image placement in original pixel space (horizontally centered)
      const srcLeft = Math.round((maxOrigW - src.width) / 2)
      const srcRight = srcLeft + src.width
      const srcTop = src.offsetY          // offsetY is already original pixels
      const srcBottom = src.offsetY + src.height

      if (srcBottom <= ry0 || srcTop >= ry1) continue
      if (srcRight <= rx0 || srcLeft >= rx1) continue

      // Intersection in original pixel space — all integers
      const ix0 = Math.max(rx0, srcLeft)
      const iy0 = Math.max(ry0, srcTop)
      const ix1 = Math.min(rx1, srcRight)
      const iy1 = Math.min(ry1, srcBottom)

      const bmpX = ix0 - srcLeft  // source bitmap crop origin
      const bmpY = iy0 - srcTop
      const bmpW = ix1 - ix0      // width in original pixels
      const bmpH = iy1 - iy0
      const dstX = ix0 - rx0      // destination on output canvas
      const dstY = iy0 - ry0

      // Strict 1:1 — bmpW/bmpH used for both src and dst, zero scaling
      ctx.drawImage(src.bitmap, bmpX, bmpY, bmpW, bmpH, dstX, dstY, bmpW, bmpH)
    }

    const blob = await new Promise<Blob>((resolve) =>
      canvas.toBlob((b) => resolve(b!), 'image/png'),
    )
    zip.file(`panel_${String(i + 1).padStart(3, '0')}.png`, blob)
  }

  const zipBlob = await zip.generateAsync({ type: 'blob' })
  const url = URL.createObjectURL(zipBlob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'panels.zip'
  a.click()
  URL.revokeObjectURL(url)
}
