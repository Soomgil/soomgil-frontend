/* ── Enums ── */
export type PlaceReactionType = 'LIKE' | 'NOPE' | 'SUPER_LIKE'
export type PlaceProvider = 'KTO' | 'KAKAO' | 'GOOGLE'

/* ── Place (외부 장소 참조 기반) ── */
export interface Place {
  provider: PlaceProvider
  externalPlaceId: string
  placeName: string
  address: string | null
  lat: number | null
  lng: number | null
  thumbnailUrl: string | null

  /** UI 표시용 상세 정보 (API에서 제공) */
  summary?: string
  description?: string
  tags?: string[]
  hours?: string
  closed?: string
  parking?: string
  contact?: string
  admission?: string
  photos?: string[]
  likedBy?: (PlaceReaction | { extra: number })[]
  accessibility?: { wheelchair: boolean; pets: boolean; stroller: boolean }
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
  userId: string
  provider: PlaceProvider
  externalPlaceId: string
  createdAt: string
}

/* ── Place Travel Story (UI helper) ── */
export interface PlaceTravelStory {
  id: string
  title: string
  author: string
  date: string
  image: string
}
