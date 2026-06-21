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
  publicUrl?: string
  mimeType: string
  byteSize?: number
  width?: number
  height?: number
  status: MediaStatus
  createdAt: string
}

/* ── Trip Record Entry ── */
export interface TripRecordEntry {
  id: string
  tripId: string
  itineraryDayId: string | null
  itineraryItemId: string | null
  uploadedByUserId: string
  title: string | null
  caption: string | null
  locationName: string | null
  lat: number | null
  lng: number | null
  takenAt: string | null
  visibility: 'TRIP_MEMBERS' | 'PUBLIC'
  status: 'ACTIVE' | 'DELETED'
  createdAt: string
  updatedAt: string

  /** API에서 join */
  mediaFiles?: MediaFile[]
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
  tripTitle?: string
  recordId: string
  itineraryDayId?: string
  itineraryItemId?: string
  media: MediaFile
  uploadedBy?: import('./auth').UserSummary
  takenAt?: string
  createdAt: string
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
