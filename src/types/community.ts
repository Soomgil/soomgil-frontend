/* ── Enums ── */
export type PostVisibility = 'PUBLIC' | 'UNLISTED'
export type ModerationStatus = 'VISIBLE' | 'HIDDEN' | 'DELETED'
export type ReportReasonCode = 'SPAM' | 'INAPPROPRIATE' | 'HARASSMENT_OR_HATE' | 'RIGHTS_VIOLATION' | 'OTHER'
export type ReportStatus = 'OPEN' | 'REVIEWING' | 'RESOLVED' | 'REJECTED'

/* ── Post ── */
export interface Post {
  id: string
  sourceTripId: string
  publishedByUserId: string
  coverMediaFileId: string | null
  visibility: PostVisibility
  title: string
  summary: string | null
  snapshotVersion: number
  snapshot: PostSnapshot | null
  likeCount: number
  retripCount: number
  commentCount: number
  mediaCount: number
  moderationStatus: ModerationStatus
  publishedAt: string
  updatedAt: string

  /** UI 표시용 (API에서 join) */
  authorDisplayName?: string
  authorProfileImageUrl?: string
  coverImageUrl?: string
  hashtags?: string[]
}

/* ── Post Snapshot (immutable rendering data) ── */
export interface PostSnapshot {
  days: PostSnapshotDay[]
  routes: PostSnapshotRoute[]
}

export interface PostSnapshotDay {
  id: string
  groupType: 'DAY' | 'UNSCHEDULED'
  dayNumber: number | null
  date: string | null
  title: string | null
  sortOrder: number
  items: PostSnapshotItem[]
}

export interface PostSnapshotItem {
  id: string
  placeProvider: string | null
  externalPlaceId: string | null
  sourceStatus: 'AVAILABLE' | 'DELETED' | 'UNKNOWN'
  placeName: string
  address: string | null
  lat: number | null
  lng: number | null
  thumbnailUrl: string | null
}

export interface PostSnapshotRoute {
  id: string
  originSnapshotItemId: string
  destinationSnapshotItemId: string
  mode: 'DRIVING' | 'WALKING'
  geometry: import('./itinerary').LineStringGeometry | null
  distanceMeters: number | null
  durationSeconds: number | null
}

/* ── Post Comment (1-level depth only) ── */
export interface PostComment {
  id: string
  postId: string
  parentCommentId: string | null
  authorUserId: string
  content: string
  depth: 0 | 1
  moderationStatus: ModerationStatus
  createdAt: string
  updatedAt: string

  /** UI 표시용 (API에서 join) */
  authorDisplayName?: string
  authorProfileImageUrl?: string
}

/* ── Hashtag ── */
export interface Hashtag {
  id: string
  name: string
  normalizedName: string
}

/* ── Content Report ── */
export interface ContentReport {
  id: string
  reporterUserId: string
  targetType: 'POST' | 'POST_COMMENT'
  targetId: string
  reasonCode: ReportReasonCode
  detail: string | null
  status: ReportStatus
  createdAt: string
}

/* ── Post Create Request ── */
export interface PostCreateRequest {
  sourceTripId: string
  visibility: PostVisibility
  title: string
  summary?: string
}

/* ── Story (UI 호환 타입 - mock/community 페이지에서 사용) ── */
export interface Story {
  id: string
  type: 'story' | 'route'
  author: string
  authorUserId?: string
  avatar: string
  location: string
  title: string
  image: string
  likes: number
  comments: number
  tags: string[]
  summary: string
  content: string
  tip: string
  photos: string[]
}

/** @deprecated Story 대신 Post 사용 */
export interface RoutePost {
  id: string
  type: 'route'
  author: string
  avatar: string
  title: string
  image: string
  places: number
  likes: number
  comments: number
  tags: string[]
}

/** @deprecated PostComment 사용 */
export interface Comment {
  id: string
  author: string
  avatar: string
  time: string
  text: string
  likes?: number
  /** depth 1 답글 (최대 1뎁스까지만 허용) */
  replyTo?: { author: string; text: string }
}
