import type { MediaPurpose } from '@/types/media'

export const IMAGE_UPLOAD_ACCEPT = 'image/jpeg,image/png,image/webp,image/gif,image/heic,image/heif,.jpg,.jpeg,.png,.webp,.gif,.heic,.heif'

export class ImageUploadError extends Error {}

const MAX_BYTES: Record<'PROFILE_IMAGE' | 'MAP_OVERLAY', number> = {
  PROFILE_IMAGE: 5 * 1024 * 1024,
  MAP_OVERLAY: 10 * 1024 * 1024,
}

function imageKind(file: File): string | null {
  const extension = file.name.split('.').pop()?.toLowerCase()
  if (extension === 'heic' || extension === 'heif') return 'heif'
  if (extension === 'gif') return 'gif'
  if (file.type === 'image/heic' || file.type === 'image/heif') return 'heif'
  if (file.type === 'image/gif') return 'gif'
  if (file.type === 'image/jpeg' || extension === 'jpg' || extension === 'jpeg') return 'jpeg'
  if (file.type === 'image/png' || extension === 'png') return 'png'
  if (file.type === 'image/webp' || extension === 'webp') return 'webp'
  return null
}

function renamedFile(blob: Blob, originalName: string, extension: string, type: string): File {
  return new File([blob], `${originalName.replace(/\.[^.]+$/, '') || 'image'}.${extension}`, {
    type,
    lastModified: Date.now(),
  })
}

async function stillPng(file: File): Promise<Blob> {
  const objectUrl = URL.createObjectURL(file)
  try {
    const image = new Image()
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve()
      image.onerror = () => reject(new ImageUploadError('이미지를 읽을 수 없습니다.'))
      image.src = objectUrl
    })
    const canvas = document.createElement('canvas')
    const maxEdge = 2048
    const scale = Math.min(1, maxEdge / Math.max(image.naturalWidth, image.naturalHeight))
    canvas.width = Math.round(image.naturalWidth * scale)
    canvas.height = Math.round(image.naturalHeight * scale)
    const context = canvas.getContext('2d')
    if (!context || !canvas.width || !canvas.height) throw new ImageUploadError('이미지를 읽을 수 없습니다.')
    context.drawImage(image, 0, 0, canvas.width, canvas.height)
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => blob ? resolve(blob) : reject(new ImageUploadError('이미지를 변환하지 못했습니다.')), 'image/png')
    })
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

/** Browser-only formats become a still image before the signed upload is requested. */
export async function prepareImageUpload(file: File, purpose: Extract<MediaPurpose, 'PROFILE_IMAGE' | 'MAP_OVERLAY'>): Promise<File> {
  const kind = imageKind(file)
  if (!kind) throw new ImageUploadError('JPG, PNG, WebP, GIF, HEIC 또는 HEIF 이미지를 선택해 주세요.')
  const maxBytes = MAX_BYTES[purpose]
  if (!file.size || file.size > maxBytes) throw new ImageUploadError(`${maxBytes / 1024 / 1024}MB 이하의 이미지를 선택해 주세요.`)

  let prepared = file
  try {
    if (kind === 'heif') {
      const { default: heic2any } = await import('heic2any')
      const converted = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.9 })
      prepared = renamedFile(Array.isArray(converted) ? converted[0] : converted, file.name, 'jpg', 'image/jpeg')
    } else if (kind === 'gif' || (kind === 'webp' && purpose === 'PROFILE_IMAGE')) {
      prepared = renamedFile(await stillPng(file), file.name, 'png', 'image/png')
    }
  } catch {
    throw new ImageUploadError('이미지를 변환하지 못했습니다. 다른 이미지 파일을 선택해 주세요.')
  }

  if (!prepared.size || prepared.size > maxBytes) {
    throw new ImageUploadError(`변환된 이미지가 ${maxBytes / 1024 / 1024}MB를 초과합니다.`)
  }
  return prepared
}
