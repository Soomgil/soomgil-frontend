import http from './http'
import type { MediaFile, MediaPurpose, MediaUploadMetadata, MediaUploadUrl } from '@/types/media'

const IMAGE_EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}

async function normalizeImageFile(file: File): Promise<File> {
  const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer())
  const detectedType = bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
    ? 'image/jpeg'
    : bytes.length >= 8
      && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47
      && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a
      ? 'image/png'
      : bytes.length >= 12
        && String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF'
        && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP'
        ? 'image/webp'
        : null

  if (!detectedType || detectedType === file.type) return file

  const extension = IMAGE_EXTENSIONS[detectedType]
  const baseName = file.name.replace(/\.[^.]+$/, '') || 'image'
  return new File([file], `${baseName}.${extension}`, {
    type: detectedType,
    lastModified: file.lastModified,
  })
}

export const mediaApi = {
  createUploadUrl: async (file: File, purpose: MediaPurpose): Promise<MediaUploadUrl> => {
    const response = await http.post<MediaUploadUrl>('/media/upload-urls', {
      fileName: file.name,
      mimeType: file.type,
      byteSize: file.size,
      purpose,
    })
    return response.data
  },

  createMediaFile: async (
    upload: MediaUploadUrl,
    file: File,
    metadata: MediaUploadMetadata = {},
  ): Promise<MediaFile> => {
    const response = await http.post<MediaFile>('/media/files', {
      objectKey: upload.objectKey,
      mimeType: file.type,
      byteSize: file.size,
      ...(metadata.publicUrl != null && { publicUrl: metadata.publicUrl }),
      ...(metadata.width != null && { width: metadata.width }),
      ...(metadata.height != null && { height: metadata.height }),
      ...(metadata.linkedResourceType != null && { linkedResourceType: metadata.linkedResourceType }),
      ...(metadata.linkedResourceId != null && { linkedResourceId: metadata.linkedResourceId }),
    })
    return response.data
  },

  uploadFile: async (
    file: File,
    purpose: MediaPurpose,
    metadata: MediaUploadMetadata = {},
  ): Promise<MediaFile> => {
    const normalizedFile = await normalizeImageFile(file)
    const upload = await mediaApi.createUploadUrl(normalizedFile, purpose)
    const response = await fetch(upload.uploadUrl, {
      method: upload.method || 'PUT',
      headers: upload.headers,
      body: normalizedFile,
    })

    if (!response.ok) {
      throw new Error('파일 저장소 업로드에 실패했습니다.')
    }

    return mediaApi.createMediaFile(upload, normalizedFile, metadata)
  },

  getContentObjectUrl: async (mediaId: string): Promise<string> => {
    const response = await http.get<Blob>(`/media/files/${mediaId}/content`, { responseType: 'blob' })
    return URL.createObjectURL(response.data)
  },

  /** 미디어 파일 삭제 */
  delete: async (mediaId: string): Promise<void> => {
    await http.delete(`/media/files/${mediaId}`)
  },

}
