export type SourceImage = {
  id: string
  name: string
  bitmap: ImageBitmap
  width: number
  height: number
  offsetY: number
}

export type CompositePreview = {
  width: number
  height: number
  scale: number         // image-space px = original px × scale
  sources: SourceImage[]
}

export type RectItem = {
  id: string
  x: number // image space px
  y: number
  width: number
  height: number
}

export type ViewState = {
  zoom: number
  offsetX: number
  offsetY: number
}

export type ThumbItem = {
  rectId: string
  dataUrl: string
}
