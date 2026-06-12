import http from './http'
import type { ApiResponse, PaginatedResponse, PaginationParams } from '@/types/api'
import type { Post, PostComment, PostCreateRequest } from '@/types/community'
import { mockCommunityStories } from '@/mocks/mockCommunity'

export const communityApi = {
  /** 게시글 목록 조회 */
  getPosts: async (params?: PaginationParams): Promise<ApiResponse<PaginatedResponse<Post>>> => {
    // TODO: return http.get('/stories', { params })
    const page = params?.page ?? 0
    const size = params?.size ?? 12
    const start = page * size
    const content = mockCommunityStories.slice(start, start + size) as unknown as Post[]
    return {
      status: 200, message: 'ok',
      data: { content, totalPages: 1, totalElements: mockCommunityStories.length, page, size },
    }
  },

  /** 게시글 상세 조회 */
  getPost: async (storyId: string): Promise<ApiResponse<Post>> => {
    // TODO: return http.get(`/stories/${storyId}`)
    const story = mockCommunityStories.find((s) => s.id === storyId) ?? mockCommunityStories[0]
    return { status: 200, message: 'ok', data: story as unknown as Post }
  },

  /** 게시글 작성 */
  createPost: async (data: PostCreateRequest): Promise<ApiResponse<Post>> => {
    return http.post('/stories', data)
  },

  /** 댓글 목록 조회 */
  getComments: async (postId: string): Promise<ApiResponse<PostComment[]>> => {
    // TODO: return http.get(`/stories/${postId}/comments`)
    return {
      status: 200, message: 'ok',
      data: [
        { id: 'c1', postId, parentCommentId: null, authorUserId: 'user_1', content: '성심당문화원 분위기 진짜 좋다... 사진 엄청 잘 나와!', depth: 0, moderationStatus: 'VISIBLE', createdAt: '', updatedAt: '', authorDisplayName: '민지', authorProfileImageUrl: undefined },
        { id: 'c2', postId, parentCommentId: null, authorUserId: 'user_2', content: '한밭수목원이랑 동선 이어서 일정 수정했어요.', depth: 0, moderationStatus: 'VISIBLE', createdAt: '', updatedAt: '', authorDisplayName: '지훈', authorProfileImageUrl: undefined },
      ],
    }
  },

  /** 댓글 작성 */
  createComment: async (postId: string, content: string, parentCommentId?: string): Promise<ApiResponse<PostComment>> => {
    return http.post(`/stories/${postId}/comments`, { content, parentCommentId })
  },

  /** 좋아요 토글 */
  toggleLike: async (postId: string): Promise<ApiResponse<void>> => {
    return http.post(`/stories/${postId}/likes`)
  },

  /** 리트립 (여행방으로 가져오기) */
  retrip: async (postId: string): Promise<ApiResponse<{ newTripId: string }>> => {
    return http.post(`/stories/${postId}/retrip`)
  },
}
