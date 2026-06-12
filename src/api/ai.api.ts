import http from './http'
import type { ApiResponse } from '@/types/api'
import type { AiChatSession, AiChatMessage, AiRouteDraftRequest, AiChatRequest } from '@/types/ai'

export const aiApi = {
  /** 채팅 세션 조회/생성 (trip당 1개) */
  getOrCreateSession: async (tripId: string): Promise<ApiResponse<AiChatSession>> => {
    // TODO: return http.post(`/trips/${tripId}/ai/sessions`)
    return { status: 200, message: 'ok', data: { id: 'ai_session_1', tripId, status: 'ACTIVE', summary: null, summaryUpdatedAt: null, createdAt: '', updatedAt: '' } }
  },

  /** 채팅 메시지 전송 */
  sendMessage: async (tripId: string, data: AiChatRequest): Promise<ApiResponse<AiChatMessage>> => {
    return http.post(`/trips/${tripId}/ai/chat`, data)
  },

  /** 채팅 히스토리 조회 */
  getChatHistory: async (tripId: string): Promise<ApiResponse<AiChatMessage[]>> => {
    // TODO: return http.get(`/trips/${tripId}/ai/chat`)
    return { status: 200, message: 'ok', data: [] }
  },

  /** AI 경로 초안 생성 */
  generateRouteDraft: async (tripId: string, data?: AiRouteDraftRequest): Promise<ApiResponse<{ message: AiChatMessage }>> => {
    return http.post(`/trips/${tripId}/ai/route-draft`, data)
  },
}
