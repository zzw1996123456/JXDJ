import type { Area } from 'react-easy-crop'

export const TILE_IMAGE_MAX_BYTES = 15 * 1024
export const TILE_IMAGE_MAX_SOURCE_BYTES = 20 * 1024 * 1024
export const TILE_IMAGE_ASPECT = 120 / 92
const TILE_IMAGE_CROP_BACKGROUND = '#080a08'

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

  for (let resize = 0; resize < 8; resize += 1) {
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d', { alpha: false })
    if (!context) throw new Error('当前浏览器无法处理图片')
    context.imageSmoothingEnabled = true
    context.imageSmoothingQuality = 'high'
    context.fillStyle = TILE_IMAGE_CROP_BACKGROUND
    context.fillRect(0, 0, width, height)

    const sourceX = Math.max(0, crop.x)
    const sourceY = Math.max(0, crop.y)
    const sourceRight = Math.min(image.naturalWidth, crop.x + crop.width)
    const sourceBottom = Math.min(image.naturalHeight, crop.y + crop.height)
    const sourceWidth = Math.max(0, sourceRight - sourceX)
    const sourceHeight = Math.max(0, sourceBottom - sourceY)

    if (sourceWidth > 0 && sourceHeight > 0) {
      context.drawImage(
        image,
        sourceX,
        sourceY,
        sourceWidth,
        sourceHeight,
        ((sourceX - crop.x) / crop.width) * width,
        ((sourceY - crop.y) / crop.height) * height,
        (sourceWidth / crop.width) * width,
        (sourceHeight / crop.height) * height,
      )
    }

    for (const quality of [0.76, 0.62, 0.5, 0.4, 0.32, 0.24, 0.18, 0.12]) {
      lastBlob = await canvasToBlob(canvas, quality)
      if (lastBlob.size <= TILE_IMAGE_MAX_BYTES) return { blob: lastBlob, width, height }
    }
    width = Math.max(144, Math.round(width * 0.8))
    height = Math.max(110, Math.round(width / TILE_IMAGE_ASPECT))
  }

  if (!lastBlob || lastBlob.size > TILE_IMAGE_MAX_BYTES) {
    throw new Error('图片内容过于复杂，压缩后仍超过 15 KB，请缩小裁剪区域或换图')
  }
  return { blob: lastBlob, width, height }
}
