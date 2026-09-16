/* ── Enums ── */
export type MediaStatus = 'ACTIVE' | 'DELETED' | 'PURGED'
export type MediaPurpose = 'PROFILE_IMAGE' | 'COMMUNITY_POST' | 'MAP_OVERLAY'

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
