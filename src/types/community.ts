import type { UserSummary } from './auth'

export type PostVisibility = 'PUBLIC' | 'UNLISTED' | 'HIDDEN'
export type ModerationStatus = 'VISIBLE' | 'HIDDEN' | 'DELETED'
export type ReportReasonCode = 'SPAM' | 'INAPPROPRIATE' | 'HARASSMENT_OR_HATE' | 'RIGHTS_VIOLATION' | 'OTHER'
export type ReportStatus = 'OPEN' | 'REVIEWING' | 'RESOLVED' | 'REJECTED'

export interface PageMeta {
  page: number
  size: number
  totalElements: number
  totalPages: number
  sort: string[]
}

export interface CommunityMediaFile {
  id: string
  publicUrl: string | null
  servingUrl: string | null
  servingUrlExpiresAt: string | null
  mimeType: string
  byteSize: number | null
  width: number | null
  height: number | null
  status: string
  createdAt: string
}

export interface CommunityPostSummary {
  id: string
  sourceTripId: string | null
  publishedBy: UserSummary | null
  coverMedia: CommunityMediaFile | null
  visibility: PostVisibility
  title: string
  summary: string | null
  hashtags: string[]
  likeCount: number
  retripCount: number
  commentCount: number
  mediaCount: number
  likedByMe: boolean | null
  moderationStatus: ModerationStatus
  publishedAt: string
}

export interface CommunityPostPage {
  items: CommunityPostSummary[]
  page: PageMeta
}

export interface CommunityPostDetail extends CommunityPostSummary {
  snapshotVersion: number
  snapshot: CommunityPostSnapshot
  media: CommunityMediaFile[]
  shareToken: string | null
  shareUrl: string | null
  shareTokenCreatedAt: string | null
  shareTokenRotatedAt: string | null
}

export interface CommunityPostSnapshot {
  days: CommunitySnapshotDay[]
  routes: unknown[]
  authorDisplay: UserSummary | null
}

export interface CommunitySnapshotDay {
  id?: string
  groupType?: string
  dayNumber?: number | null
  date?: string | null
  title?: string | null
  sortOrder?: number
  items?: CommunitySnapshotItem[]
}

export interface CommunitySnapshotItem {
  id?: string
  placeName: string
  address?: string | null
  thumbnailUrl?: string | null
}

export interface CommunityComment {
  id: string
  postId: string
  parentCommentId: string | null
  author: UserSummary
  content: string | null
  depth: number
  moderationStatus: ModerationStatus
  deletedAt: string | null
  createdAt: string
}

export interface PagedCommunityComment {
  items: CommunityComment[]
  page: PageMeta
}

export interface CommunityPostReactionSummary {
  postId: string
  liked: boolean
  likeCount: number
}

export interface CreateCommunityPostRequest {
  sourceTripId: string
  baseVersion: number
  visibility: 'PUBLIC' | 'UNLISTED'
  title: string
  summary?: string | null
  coverMediaFileId?: string | null
  mediaFileIds?: string[]
  hashtags?: string[]
}

export interface ReportReason {
  code: ReportReasonCode
  displayName: string
  isActive: boolean
}

export interface CreateContentReportRequest {
  targetType: 'POST' | 'POST_COMMENT'
  targetId: string
  reasonCode: ReportReasonCode
  detail?: string | null
}

export interface ContentReport extends CreateContentReportRequest {
  id: string
  reporter: UserSummary | null
  status: ReportStatus
  createdAt: string
  resolvedAt: string | null
  resolutionNote: string | null
}

export type ModerationActionType = 'HIDE' | 'RESTORE' | 'DELETE'

export interface CommunityPostShareToken {
  postId: string
  shareToken: string
  shareUrl: string
  rotatedAt: string
}

export interface ModerationAction {
  id: string
  moderator: UserSummary | null
  targetType: 'POST' | 'POST_COMMENT'
  targetId: string
  action: ModerationActionType
  moderationStatus: ModerationStatus | null
  moderationReason: string | null
  createdAt: string
}

export interface ResolveReportRequest {
  status: 'RESOLVED' | 'REJECTED'
  resolutionNote?: string | null
  moderationAction?: {
    targetType: 'POST' | 'POST_COMMENT'
    targetId: string
    action: ModerationActionType
    moderationReason?: string | null
  } | null
}

/** 기존 목업 기반 화면의 점진적 전환 동안만 유지하는 UI 타입입니다. */
export interface Story {
  id: string
  type: 'story' | 'route'
  author: string
  authorUserId?: string
  avatar: string
  authorProfileImageUrl?: string | null
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

/** @deprecated API 응답 타입인 CommunityPostSummary를 사용하세요. */
export type Post = CommunityPostSummary
/** @deprecated API 응답 타입인 CommunityComment를 사용하세요. */
export type PostComment = CommunityComment
/** @deprecated CreateCommunityPostRequest를 사용하세요. */
export type PostCreateRequest = CreateCommunityPostRequest
