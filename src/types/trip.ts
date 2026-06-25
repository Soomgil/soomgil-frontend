import type { LegalRegion } from './geo'

/* ── Enums ── */
export type TripStatus = 'ACTIVE' | 'ARCHIVED' | 'DELETED'
export type TripMemberRole = 'OWNER' | 'MEMBER'
export type TripMemberStatus = 'ACTIVE' | 'LEFT' | 'REMOVED'
export type TripInviteStatus = 'PENDING' | 'ACCEPTED' | 'REVOKED' | 'EXPIRED'
export type TripAccessRole = 'OWNER' | 'MEMBER'

export interface PageMeta {
  page: number
  size: number
  totalElements: number
  totalPages: number
  sort: string[]
}

export interface TripSummary {
  id: string
  title: string
  displayDestination: string | null
  startDate?: string | null
  endDate?: string | null
  status: TripStatus
  myRole: TripAccessRole
  itineraryVersion: number
  createdAt: string
  coverImageUrl?: string | null
}

export interface TripDetail extends TripSummary {
  ownerUserId: string | null
  regions: LegalRegion[]
  members: TripDetailMember[]
  retrippedFromPostId: string | null
}

export interface TripDetailMember {
  id: string
  tripId: string
  user: {
    id: string
    displayName: string
    profileImageUrl: string | null
  }
  role: TripMemberRole
  accessRole: TripAccessRole
  status: TripMemberStatus
  joinedAt: string
}

export interface PagedTripSummary {
  items: TripSummary[]
  page: PageMeta
}

export interface TripListParams {
  status?: TripStatus
  role?: TripAccessRole
  page?: number
  size?: number
  sort?: string[]
}

/* ── Trip ── */
export interface Trip {
  id: string
  ownerUserId: string
  title: string
  displayDestination: string | null
  status: TripStatus
  itineraryVersion: number
  retrippedFromPostId: string | null
  createdAt: string
  updatedAt: string

  /** 클라이언트에서 join해서 보여주는 UI 필드 */
  startDate?: string
  endDate?: string
  coverImageUrl?: string
  members?: TripMember[]
  placeCount?: number
  destinationCode?: string
  destinationName?: string
  passengerCount?: number
  checklistProgress?: string
  places?: string[]
}

export interface TripCreateRequest {
  title: string
  displayDestination?: string
  legalRegionCodes?: string[]
  startDate?: string | null
  endDate?: string | null
}

export interface TripUpdateRequest {
  title?: string
  displayDestination?: string
  legalRegionCodes?: string[]
  startDate?: string | null
  endDate?: string | null
  status?: TripStatus
}

/* ── Trip Member ── */
export interface TripMember {
  id: string
  tripId: string
  userId: string
  role: TripMemberRole
  status: TripMemberStatus
  joinedAt: string

  /** UI 표시용 (API에서 join해서 줄 수 있음) */
  displayName?: string
  profileImageUrl?: string
}

/* ── Trip Invite ── */
export interface TripInvite {
  id: string
  tripId: string
  inviteCode: string
  inviteUrl: string | null
  inviteeUserId: string | null
  status: TripInviteStatus
  expiresAt: string | null
  createdAt: string
}

export interface CreateTripInviteRequest {
  inviteeUserId?: string
  expiresAt?: string
}

/* ── Filters ── */
export type TripFilter = 'all' | 'upcoming' | 'past'
