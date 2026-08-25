import type { UserSummary } from './auth'
import type { CommunityMediaFile, ModerationStatus, PageMeta } from './community'

/**
 * 커뮤니티 공개 피드의 쓰레드.
 *
 * content가 null이면 삭제되거나 숨김 처리된 tombstone이므로 본문 대신 안내 문구를 보여준다.
 * likedByMe와 editableByMe는 비로그인 조회에서 항상 false다.
 */
export interface CommunityThread {
  id: string
  author: UserSummary | null
  content: string | null
  media: CommunityMediaFile[]
  likeCount: number
  replyCount: number
  likedByMe: boolean
  editableByMe: boolean
  moderationStatus: ModerationStatus
  deletedAt: string | null
  createdAt: string
  updatedAt: string | null
}

/** 쓰레드 답글. 중첩은 1단계까지만이라 replies는 depth 0에서만 채워진다. */
export interface CommunityThreadReply {
  id: string
  threadId: string
  parentReplyId: string | null
  author: UserSummary | null
  content: string | null
  depth: number
  editableByMe: boolean
  moderationStatus: ModerationStatus
  deletedAt: string | null
  createdAt: string
  updatedAt: string | null
  replies: CommunityThreadReply[]
}

export interface PagedCommunityThread {
  items: CommunityThread[]
  page: PageMeta
}

export interface PagedCommunityThreadReply {
  items: CommunityThreadReply[]
  page: PageMeta
}

/** 좋아요 처리 결과. 멱등이므로 같은 요청을 반복해도 값이 변하지 않는다. */
export interface CommunityThreadReactionSummary {
  threadId: string
  liked: boolean
  likeCount: number
}

export interface CreateCommunityThreadRequest {
  content: string
  mediaFileIds?: string[]
}

/** mediaFileIds를 생략하면 기존 첨부를 유지하고, 빈 배열이면 모두 제거한다. */
export interface UpdateCommunityThreadRequest {
  content: string
  mediaFileIds?: string[]
}

export interface CreateCommunityThreadReplyRequest {
  content: string
  parentReplyId?: string | null
}

export interface CommunityThreadQuery {
  authorId?: string
  query?: string
  page?: number
  size?: number
}
