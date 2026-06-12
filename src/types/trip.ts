/* ── Enums ── */
export type TripStatus = 'ACTIVE' | 'ARCHIVED' | 'DELETED'
export type TripMemberRole = 'OWNER' | 'MEMBER'
export type TripMemberStatus = 'ACTIVE' | 'LEFT' | 'REMOVED'
export type TripInviteStatus = 'PENDING' | 'ACCEPTED' | 'REVOKED' | 'EXPIRED'

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
  startDate?: string
  endDate?: string
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
  createdByUserId: string
  inviteeUserId: string | null
  inviteCode: string
  status: TripInviteStatus
  expiresAt: string | null
  acceptedByUserId: string | null
  acceptedAt: string | null
  createdAt: string
}

/* ── Filters ── */
export type TripFilter = 'all' | 'upcoming' | 'past'
