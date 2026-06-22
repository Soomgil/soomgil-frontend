/* ── Enums ── */
export type MediaStatus = 'ACTIVE' | 'DELETED' | 'PURGED'
export type MediaPurpose = 'PROFILE_IMAGE' | 'TRIP_RECORD' | 'COMMUNITY_POST'

export interface MediaUploadUrl {
  uploadUrl: string
  method?: 'PUT' | 'POST'
  objectKey: string
  headers?: Record<string, string>
  expiresAt: string
}

export interface MediaUploadMetadata {
  publicUrl?: string | null
  width?: number | null
  height?: number | null
  linkedResourceType?: string | null
  linkedResourceId?: string | null
}

/* ── Media File ── */
export interface MediaFile {
  id: string
  publicUrl: string | null
  servingUrl: string | null
  servingUrlExpiresAt: string | null
  mimeType: string
  byteSize: number | null
  width: number | null
  height: number | null
  status: MediaStatus
  createdAt: string
}

/* ── Trip Record Entry ── */
export interface TripRecordEntry {
  id: string
  tripId: string
  itineraryDayId: string | null
  itineraryItemId: string | null
  uploadedBy: import('./auth').UserSummary
  title: string | null
  caption: string | null
  locationName: string | null
  lat: number | null
  lng: number | null
  takenAt: string | null
  visibility: 'TRIP_MEMBERS'
  status: 'ACTIVE' | 'DELETED'
  media: MediaFile[]
  createdAt: string
}

export interface CreateTripRecordRequest {
  itineraryDayId?: string | null
  itineraryItemId?: string | null
  title?: string | null
  caption?: string | null
  locationName?: string | null
  lat?: number | null
  lng?: number | null
  takenAt?: string | null
  mediaFileIds?: string[]
}

/* ── Trip Record Media (junction) ── */
export interface TripRecordMedia {
  recordEntryId: string
  mediaFileId: string
  sortOrder: number
  caption: string | null
}

export interface TripRecordPhoto {
  tripId: string
  tripTitle: string | null
  recordId: string
  itineraryDayId: string | null
  itineraryItemId: string | null
  media: MediaFile
  uploadedBy: import('./auth').UserSummary | null
  takenAt: string | null
  createdAt: string
}

export interface TripRecordPhotoSummary {
  tripId: string
  photoCount: number
  coverMediaFileId: string | null
  coverUrl: string | null
  coverUrlExpiresAt: string | null
}

export interface TripRecordPhotoSummaryResponse {
  items: TripRecordPhotoSummary[]
}

export interface TripRecordPhotoReadUrl {
  mediaFileId: string
  url: string
  expiresAt: string | null
}

/* ── PhotoRecord (UI 호환 타입 - RecordPage에서 사용) ── */
export interface PhotoRecord {
  id: string
  tripId: string
  src: string
  uploader: {
    name: string
    avatar: string
  }
  uploadedAt: string
  likes: number
  location: string
  scheduleName: string
  comments: number
  aspectRatio: 'portrait' | 'landscape' | 'square'
}
