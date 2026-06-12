/* ── Enums ── */
export type MediaStatus = 'ACTIVE' | 'DELETED' | 'PURGED'

/* ── Media File ── */
export interface MediaFile {
  id: string
  ownerUserId: string | null
  storageProvider: string
  bucket: string
  objectKey: string
  publicUrl: string | null
  mimeType: string | null
  byteSize: number | null
  width: number | null
  height: number | null
  linkedResourceType: string | null
  linkedResourceId: string | null
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

/* ── Media Upload Response ── */
export interface MediaUploadResponse {
  mediaFileId: string
  publicUrl: string
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
