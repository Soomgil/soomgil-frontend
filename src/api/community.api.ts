import http from './http'
import type {
  CommunityComment,
  CommunityPostDetail,
  CommunityPostPage,
  CommunityPostReactionSummary,
  CommunityPostSummary,
  ContentReport,
  CreateCommunityPostRequest,
  CreateContentReportRequest,
  PagedCommunityComment,
  ReportReason,
  CommunityPostShareToken,
} from '@/types/community'

export interface CommunityPostQuery {
  query?: string
  hashtag?: string
  visibility?: 'PUBLIC' | 'UNLISTED'
  page?: number
  size?: number
  sort?: string[]
  authorId?: string
}

export const communityApi = {
  async getPosts(params: CommunityPostQuery = {}): Promise<CommunityPostPage> {
    const response = await http.get<CommunityPostPage>('/stories', { params })
    return response.data
  },

  async getPost(postId: string, shareToken?: string): Promise<CommunityPostDetail> {
    const response = await http.get<CommunityPostDetail>(`/stories/${postId}`, {
      params: shareToken ? { share: shareToken } : undefined,
    })
    return response.data
  },

  async createPost(data: CreateCommunityPostRequest): Promise<CommunityPostDetail> {
    const response = await http.post<CommunityPostDetail>('/stories', data)
    return response.data
  },

  async updatePost(postId: string, data: Partial<CreateCommunityPostRequest>): Promise<CommunityPostDetail> {
    const response = await http.patch<CommunityPostDetail>(`/stories/${postId}`, data)
    return response.data
  },

  async deletePost(postId: string): Promise<void> {
    await http.delete(`/stories/${postId}`)
  },

  async getComments(postId: string, page = 0, size = 100): Promise<PagedCommunityComment> {
    const response = await http.get<PagedCommunityComment>(`/stories/${postId}/comments`, {
      params: { page, size },
    })
    return response.data
  },

  async createComment(postId: string, content: string, parentCommentId?: string): Promise<CommunityComment> {
    const response = await http.post<CommunityComment>(`/stories/${postId}/comments`, {
      content,
      parentCommentId: parentCommentId ?? null,
    })
    return response.data
  },

  async deleteComment(postId: string, commentId: string): Promise<void> {
    await http.delete(`/stories/${postId}/comments/${commentId}`)
  },

  async likePost(postId: string): Promise<CommunityPostReactionSummary> {
    const response = await http.post<CommunityPostReactionSummary>(`/stories/${postId}/likes`)
    return response.data
  },

  async unlikePost(postId: string): Promise<CommunityPostReactionSummary> {
    const response = await http.delete<CommunityPostReactionSummary>(`/stories/${postId}/likes`)
    return response.data
  },

  async toggleLike(post: Pick<CommunityPostSummary, 'id' | 'likedByMe'>): Promise<CommunityPostReactionSummary> {
    return post.likedByMe ? this.unlikePost(post.id) : this.likePost(post.id)
  },

  async getReportReasons(): Promise<ReportReason[]> {
    const response = await http.get<ReportReason[]>('/community/reports/reasons')
    return response.data.filter((reason) => reason.isActive !== false)
  },

  async createReport(data: CreateContentReportRequest): Promise<ContentReport> {
    const response = await http.post<ContentReport>('/community/reports', data)
    return response.data
  },

  async retrip(postId: string, title?: string): Promise<import('@/types/trip').Trip> {
    const response = await http.post<import('@/types/trip').Trip>(`/stories/${postId}/retrip`, title ? { title } : {})
    return response.data
  },

  async rotateShareToken(postId: string): Promise<CommunityPostShareToken> {
    const response = await http.post<CommunityPostShareToken>(`/stories/${postId}/share-token`)
    return response.data
  },
}
