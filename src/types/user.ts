import type { User } from './auth'

/** auth.User와 동일하지만 마이페이지용 확장 필드 포함 */
export interface UserProfile extends User {
  bio: string | null
  followerCount: number
  followingCount: number
  tripCount: number
}

export interface UserStats {
  tripsCount: number
  placesLiked: number
  postsCount: number
  routesSaved: number
}

export interface UserPreferenceAnalysis {
  topCategories: { category: string; percentage: number }[]
  travelStyle: string
  preferredTags: string[]
}
