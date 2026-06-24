/* ── Enums ── */
export type PlaceReactionType = 'LIKE' | 'NOPE' | 'SUPER_LIKE'
export type PlaceProvider = 'KTO' | 'KAKAO' | 'GOOGLE'
export type PlaceSourceStatus = 'AVAILABLE' | 'DELETED' | 'UNKNOWN'
export type TagPreparationStatus = 'READY' | 'REFRESHING' | 'PENDING'

/* ── Accessibility ── */
export type ParkingType = 'FREE' | 'PAID' | 'MIXED' | 'NONE' | 'UNKNOWN'
export type AccessibilityFlag = 'WHEELCHAIR' | 'PET' | 'STROLLER' | 'DISABLED_TOILET' | 'ELDERLY'

export interface PlaceAccessibility {
  openingHours: string | null
  closedDays: string | null
  parkingType: ParkingType
  flags: AccessibilityFlag[]
  unavailableFlags: AccessibilityFlag[]
}

/* ── Place (외부 장소 참조 기반) ── */
export interface Place {
  provider: PlaceProvider
  externalPlaceId: string
  placeName: string
  address: string | null
  lat: number | null
  lng: number | null
  thumbnailUrl: string | null
  category?: string | null
  sourceStatus?: PlaceSourceStatus
  tagStatus?: TagPreparationStatus

  /** UI 표시용 상세 정보 (API에서 제공) */
  summary?: string
  description?: string
  tags?: string[]
  contact?: string
  admission?: string
  featuredMenu?: string | null
  photos?: string[]
  likedBy?: (PlaceReaction | { extra: number })[]
  accessibility?: PlaceAccessibility
  travelStories?: PlaceTravelStory[]
}

/* ── User Place Reaction ── */
export interface PlaceReaction {
  userId: string
  displayName: string
  profileImageUrl: string | null
  reaction: PlaceReactionType
  reactionCount: number
  firstReactedAt: string
  lastReactedAt: string
}

/* ── Saved Place ── */
export interface SavedPlace {
  id: string
  place: Place
  createdAt: string
}

export interface UserSummary {
  id: string
  displayName: string
  profileImageUrl: string | null
}

export interface PlaceRecommendation {
  place: Place
  matchedMembers: UserSummary[]
  rank: number | null
  distanceMeters: number | null
  recommendationReason: string | null
  matchPercentage: number | null
}

/* ── Place Travel Story (UI helper) ── */
export interface PlaceTravelStory {
  id: string
  title: string
  author: string
  date: string
  image: string
}
