import http from './http'
import type { ApiResponse, PaginatedResponse, PaginationParams } from '@/types/api'
import type { MediaFile, TripRecordEntry, MediaUploadResponse, TripRecordPhoto } from '@/types/media'
import type { PageMeta } from '@/types/community'
import { mockRecords } from '@/mocks/mockRecords'

export const mediaApi = {
  /** 미디어 파일 업로드 */
  upload: async (formData: FormData): Promise<ApiResponse<MediaUploadResponse>> => {
    return http.post('/media', formData, { headers: { 'Content-Type': 'multipart/form-data' } })
  },

  /** 미디어 파일 삭제 */
  delete: async (mediaId: string): Promise<ApiResponse<void>> => {
    return http.delete(`/media/${mediaId}`)
  },

  /** 여행 기록 목록 */
  getRecords: async (tripId: string, params?: PaginationParams): Promise<ApiResponse<PaginatedResponse<TripRecordEntry>>> => {
    // TODO: return http.get(`/trips/${tripId}/records`, { params })
    const data = tripId ? mockRecords.filter((r) => r.tripId === tripId) : mockRecords
    return { status: 200, message: 'ok', data: { content: data as unknown as TripRecordEntry[], totalPages: 1, totalElements: data.length, page: 0, size: 20 } }
  },

  /** 선택한 여행방의 기록에 연결된 사진 목록 */
  getRecordPhotos: async (tripId: string, page = 0, size = 100): Promise<{ items: TripRecordPhoto[]; page: PageMeta }> => {
    const response = await http.get<{ items: TripRecordPhoto[]; page: PageMeta }>(`/trips/${tripId}/records/photos`, {
      params: { page, size },
    })
    return response.data
  },

  /** 여행 기록 생성 */
  createRecord: async (tripId: string, data: Partial<TripRecordEntry>): Promise<ApiResponse<TripRecordEntry>> => {
    return http.post(`/trips/${tripId}/records`, data)
  },
}
