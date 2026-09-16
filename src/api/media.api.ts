import http from './http'
import type { MediaFile, MediaPurpose, MediaUploadMetadata, MediaUploadUrl } from '@/types/media'

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
    const upload = await mediaApi.createUploadUrl(file, purpose)
    const response = await fetch(upload.uploadUrl, {
      method: upload.method || 'PUT',
      headers: upload.headers,
      body: file,
    })

    if (!response.ok) {
      throw new Error('파일 저장소 업로드에 실패했습니다.')
    }

    return mediaApi.createMediaFile(upload, file, metadata)
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
