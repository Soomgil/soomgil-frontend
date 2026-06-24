import http from './http'
import type { PagedItems, PaginationParams } from '@/types/api'
import type {
	CreateTripRecordRequest,
  MediaFile,
  MediaPurpose,
  MediaUploadMetadata,
  MediaUploadUrl,
  TripRecordEntry,
	TripRecordPhoto,
	TripRecordDay,
	TripRecordPhotoReadUrl,
	TripRecordPhotoSummaryResponse,
} from '@/types/media'

export const mediaApi = {
  getRecordDays: async (tripId: string): Promise<TripRecordDay[]> => {
    const response = await http.get<TripRecordDay[]>(`/trips/${tripId}/records/days`)
    return response.data
  },

  /** 선택한 여행방의 기록에 연결된 사진 목록 */
	getRecordPhotos: async (tripId: string, page = 0, size = 100): Promise<PagedItems<TripRecordPhoto>> => {
		const response = await http.get<PagedItems<TripRecordPhoto>>(`/trips/${tripId}/records/photos`, {
			params: { page, size },
		})
		return response.data
	},

	getAllRecordPhotos: async (page = 0, size = 100): Promise<PagedItems<TripRecordPhoto>> => {
		const response = await http.get<PagedItems<TripRecordPhoto>>('/records/photos', { params: { page, size } })
		return response.data
	},

	getRecordPhotoSummaries: async (tripIds: string[]): Promise<TripRecordPhotoSummaryResponse> => {
		const response = await http.post<TripRecordPhotoSummaryResponse>('/records/photo-summaries', { tripIds })
		return response.data
	},

	refreshRecordPhotoReadUrl: async (mediaFileId: string): Promise<TripRecordPhotoReadUrl> => {
		const response = await http.get<TripRecordPhotoReadUrl>(`/records/photos/${mediaFileId}/read-url`)
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

  /** 미디어 파일 삭제 */
  delete: async (mediaId: string): Promise<void> => {
    await http.delete(`/media/files/${mediaId}`)
  },

  /** 여행 기록 목록 */
	getRecords: async (tripId: string, params?: PaginationParams): Promise<PagedItems<TripRecordEntry>> => {
		const response = await http.get<PagedItems<TripRecordEntry>>(`/trips/${tripId}/records`, { params })
		return response.data
	},

  /** 여행 기록 생성 */
	createRecord: async (
		tripId: string,
		data: CreateTripRecordRequest,
		idempotencyKey?: string,
	): Promise<TripRecordEntry> => {
		const response = await http.post<TripRecordEntry>(`/trips/${tripId}/records`, data, {
			...(idempotencyKey && { headers: { 'Idempotency-Key': idempotencyKey } }),
		})
		return response.data
	},
}
