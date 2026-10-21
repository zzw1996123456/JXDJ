import type { Area } from 'react-easy-crop'

export const TILE_IMAGE_MAX_BYTES = 80 * 1024
export const TILE_IMAGE_MAX_SOURCE_BYTES = 20 * 1024 * 1024
export const TILE_IMAGE_ASPECT = 120 / 92

function loadImage(sourceUrl: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('无法读取图片，请换一张图片重试'))
    image.src = sourceUrl
  })
}

function canvasToBlob(canvas: HTMLCanvasElement, quality: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('当前浏览器无法压缩这张图片')), 'image/webp', quality)
  })
}

export async function cropTileImage(sourceUrl: string, crop: Area) {
  const image = await loadImage(sourceUrl)
  let width = 480
  let height = 368
  let lastBlob: Blob | null = null

  for (let resize = 0; resize < 5; resize += 1) {
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d', { alpha: false })
    if (!context) throw new Error('当前浏览器无法处理图片')
    context.imageSmoothingEnabled = true
    context.imageSmoothingQuality = 'high'
    context.drawImage(image, crop.x, crop.y, crop.width, crop.height, 0, 0, width, height)

    for (const quality of [0.78, 0.68, 0.58, 0.48, 0.38, 0.3]) {
      lastBlob = await canvasToBlob(canvas, quality)
      if (lastBlob.size <= TILE_IMAGE_MAX_BYTES) return { blob: lastBlob, width, height }
    }
    width = Math.max(240, Math.round(width * 0.82))
    height = Math.max(184, Math.round(width / TILE_IMAGE_ASPECT))
  }

  if (!lastBlob || lastBlob.size > TILE_IMAGE_MAX_BYTES) {
    throw new Error('图片内容过于复杂，压缩后仍超过 80 KB，请缩小裁剪区域或换图')
  }
  return { blob: lastBlob, width, height }
}
