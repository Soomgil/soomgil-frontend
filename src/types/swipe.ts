/* ── Enums ── */
export type SwipeAction = 'LIKE' | 'NOPE' | 'SUPER_LIKE'

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
