import http from './http'
import type { ApiResponse, PaginatedResponse, PaginationParams } from '@/types/api'
import type {
  MediaFile,
  MediaPurpose,
  MediaUploadMetadata,
  MediaUploadUrl,
  TripRecordEntry,
  TripRecordPhoto,
} from '@/types/media'
import type { PageMeta } from '@/types/community'
import { mockRecords } from '@/mocks/mockRecords'

export const mediaApi = {
  /** 선택한 여행방의 기록에 연결된 사진 목록 */
  getRecordPhotos: async (tripId: string, page = 0, size = 100): Promise<{ items: TripRecordPhoto[]; page: PageMeta }> => {
    const response = await http.get<{ items: TripRecordPhoto[]; page: PageMeta }>('/records/photos', {
      params: { tripId, page, size },
    })
    return response.data
  },

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
      publicUrl: metadata.publicUrl ?? null,
      mimeType: file.type,
      byteSize: file.size,
      width: metadata.width ?? null,
      height: metadata.height ?? null,
      linkedResourceType: metadata.linkedResourceType ?? null,
      linkedResourceId: metadata.linkedResourceId ?? null,
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

  /** 미디어 파일 삭제 */
  delete: async (mediaId: string): Promise<void> => {
    await http.delete(`/media/files/${mediaId}`)
  },

  /** 여행 기록 목록 */
  getRecords: async (tripId: string, params?: PaginationParams): Promise<ApiResponse<PaginatedResponse<TripRecordEntry>>> => {
    // TODO: return http.get(`/trips/${tripId}/records`, { params })
    const data = tripId ? mockRecords.filter((r) => r.tripId === tripId) : mockRecords
    return { status: 200, message: 'ok', data: { content: data as unknown as TripRecordEntry[], totalPages: 1, totalElements: data.length, page: 0, size: 20 } }
  },

  /** 여행 기록 생성 */
  createRecord: async (tripId: string, data: Partial<TripRecordEntry>): Promise<ApiResponse<TripRecordEntry>> => {
    return http.post(`/trips/${tripId}/records`, data)
  },
}
