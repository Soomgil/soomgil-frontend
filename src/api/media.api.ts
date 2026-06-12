import http from './http'
import type { ApiResponse, PaginatedResponse, PaginationParams } from '@/types/api'
import type { MediaFile, TripRecordEntry, MediaUploadResponse } from '@/types/media'
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

  /** 여행 기록 생성 */
  createRecord: async (tripId: string, data: Partial<TripRecordEntry>): Promise<ApiResponse<TripRecordEntry>> => {
    return http.post(`/trips/${tripId}/records`, data)
  },
}
