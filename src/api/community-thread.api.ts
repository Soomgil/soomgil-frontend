import http from './http'
import type { ContentReport, ReportReasonCode } from '@/types/community'
import type {
  CommunityThread,
  CommunityThreadQuery,
  CommunityThreadReactionSummary,
  CommunityThreadReply,
  CreateCommunityThreadReplyRequest,
  CreateCommunityThreadRequest,
  PagedCommunityThread,
  PagedCommunityThreadReply,
  UpdateCommunityThreadRequest,
} from '@/types/community-thread'

/**
 * 커뮤니티 공개 피드(쓰레드) API 클라이언트.
 *
 * 목록/상세/답글 조회는 비로그인에서도 호출할 수 있고, 나머지는 인증이 필요하다.
 * 좋아요는 서버가 멱등하게 처리하므로 PUT/DELETE를 사용한다.
 */
export const communityThreadApi = {
  async getThreads(params: CommunityThreadQuery = {}): Promise<PagedCommunityThread> {
    const response = await http.get<PagedCommunityThread>('/community/threads', { params })
    return response.data
  },

  async getThread(threadId: string): Promise<CommunityThread> {
    const response = await http.get<CommunityThread>(`/community/threads/${threadId}`)
    return response.data
  },

  async createThread(data: CreateCommunityThreadRequest): Promise<CommunityThread> {
    const response = await http.post<CommunityThread>('/community/threads', data)
    return response.data
  },

  async updateThread(threadId: string, data: UpdateCommunityThreadRequest): Promise<CommunityThread> {
    const response = await http.patch<CommunityThread>(`/community/threads/${threadId}`, data)
    return response.data
  },

  async deleteThread(threadId: string): Promise<void> {
    await http.delete(`/community/threads/${threadId}`)
  },

  async likeThread(threadId: string): Promise<CommunityThreadReactionSummary> {
    const response = await http.put<CommunityThreadReactionSummary>(`/community/threads/${threadId}/like`)
    return response.data
  },

  async unlikeThread(threadId: string): Promise<CommunityThreadReactionSummary> {
    const response = await http.delete<CommunityThreadReactionSummary>(`/community/threads/${threadId}/like`)
    return response.data
  },

  async toggleLike(
    thread: Pick<CommunityThread, 'id' | 'likedByMe'>,
  ): Promise<CommunityThreadReactionSummary> {
    return thread.likedByMe ? this.unlikeThread(thread.id) : this.likeThread(thread.id)
  },

  async getReplies(threadId: string, page = 0, size = 20): Promise<PagedCommunityThreadReply> {
    const response = await http.get<PagedCommunityThreadReply>(`/community/threads/${threadId}/replies`, {
      params: { page, size },
    })
    return response.data
  },

  async createReply(
    threadId: string,
    data: CreateCommunityThreadReplyRequest,
  ): Promise<CommunityThreadReply> {
    const response = await http.post<CommunityThreadReply>(`/community/threads/${threadId}/replies`, data)
    return response.data
  },

  async updateReply(threadId: string, replyId: string, content: string): Promise<CommunityThreadReply> {
    const response = await http.patch<CommunityThreadReply>(
      `/community/threads/${threadId}/replies/${replyId}`,
      { content },
    )
    return response.data
  },

  async deleteReply(threadId: string, replyId: string): Promise<void> {
    await http.delete(`/community/threads/${threadId}/replies/${replyId}`)
  },

  async reportThread(threadId: string, reasonCode: ReportReasonCode, detail?: string): Promise<ContentReport> {
    const response = await http.post<ContentReport>('/community/reports', {
      targetType: 'THREAD',
      targetId: threadId,
      reasonCode,
      detail,
    })
    return response.data
  },

  async reportReply(replyId: string, reasonCode: ReportReasonCode, detail?: string): Promise<ContentReport> {
    const response = await http.post<ContentReport>('/community/reports', {
      targetType: 'THREAD_REPLY',
      targetId: replyId,
      reasonCode,
      detail,
    })
    return response.data
  },
}
