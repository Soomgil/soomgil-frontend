/* ── Enums ── */
export type SwipeAction = 'LIKE' | 'NOPE' | 'SUPER_LIKE'
export type RecommendationTab = 'BASIC' | 'SUPER_LIKE'

/* ── Swipe Candidate ── */
export interface SwipeCandidate {
  provider: string
  externalPlaceId: string
  place: import('./place').Place
  order: number
}

/* ── Swipe Reaction ── */
export interface SwipeReaction {
  provider: string
  externalPlaceId: string
  reaction: SwipeAction
}

export interface SwipeFeedItem {
  place: import('./place').Place
  myReaction: SwipeAction | null
  likedByFollowees: import('./place').UserSummary[]
}

export interface SwipeFeed {
  items: SwipeFeedItem[]
  nextSeed: string | null
}

export interface SwipeReactionResult {
  place: { provider: import('./place').PlaceProvider; externalPlaceId: string }
  reaction: SwipeAction
  savedPlaceEligible: boolean
  updatedAt: string | null
}

/* ── Swipe Result ── */
export interface SwipeResult {
  totalCandidates: number
  completed: number
  likes: number
  nopes: number
  superLikes: number
}

/* ── Preference Summary ── */
export interface PreferenceSummary {
  topTags: { tagCode: string; displayName: string; weight: number }[]
  likedPlaces: import('./place').Place[]
  matchRate: number
}
