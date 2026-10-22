export const SITE_IMAGE_MAX_BYTES = 2 * 1024 * 1024
export const SITE_IMAGE_MAX_SOURCE_BYTES = 20 * 1024 * 1024
const SITE_IMAGE_MAX_EDGE = 1920

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

export async function prepareSiteImage(file: File) {
  if (!file.type.startsWith('image/')) throw new Error('请选择 JPEG、PNG 或 WebP 图片')
  if (file.size > SITE_IMAGE_MAX_SOURCE_BYTES) throw new Error('原图不能超过 20 MB')

  const sourceUrl = URL.createObjectURL(file)
  try {
    const image = await loadImage(sourceUrl)
    const scale = Math.min(1, SITE_IMAGE_MAX_EDGE / Math.max(image.naturalWidth, image.naturalHeight))
    let width = Math.max(1, Math.round(image.naturalWidth * scale))
    let height = Math.max(1, Math.round(image.naturalHeight * scale))
    let lastBlob: Blob | null = null

    for (let resize = 0; resize < 7; resize += 1) {
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const context = canvas.getContext('2d')
      if (!context) throw new Error('当前浏览器无法处理图片')
      context.imageSmoothingEnabled = true
      context.imageSmoothingQuality = 'high'
      context.drawImage(image, 0, 0, width, height)

      for (const quality of [0.84, 0.74, 0.64, 0.54, 0.44, 0.34]) {
        lastBlob = await canvasToBlob(canvas, quality)
        if (lastBlob.size <= SITE_IMAGE_MAX_BYTES) return { blob: lastBlob, width, height }
      }
      width = Math.max(1, Math.round(width * 0.82))
      height = Math.max(1, Math.round(height * 0.82))
    }

    if (!lastBlob || lastBlob.size > SITE_IMAGE_MAX_BYTES) throw new Error('图片压缩后仍超过 2 MB，请换一张图片')
    return { blob: lastBlob, width, height }
  } finally {
    URL.revokeObjectURL(sourceUrl)
  }
}
