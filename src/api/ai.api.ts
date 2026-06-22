import http from './http'
import type { OffsetPagedItems } from '@/types/api'
import type { AiChatSession, AiMessageResponse, AiChatMessage, AiChatRequest } from '@/types/ai'

export const aiApi = {
  /** 채팅 세션 조회/생성 (trip당 1개) */
  getSession: async (tripId: string): Promise<AiChatSession> => {
    const response = await http.get<AiChatSession>(`/trips/${tripId}/ai/session`)
    return response.data
  },

  /** 채팅 메시지 전송 */
  sendMessage: async (tripId: string, data: AiChatRequest): Promise<AiMessageResponse> => {
    const response = await http.post<AiMessageResponse>(`/trips/${tripId}/ai/messages`, data, {
      // 모델 응답과 tool calling은 일반 REST 요청보다 오래 걸릴 수 있다.
      timeout: 60_000,
    })
    return response.data
  },

  /** 채팅 히스토리 조회 */
  getMessages: async (tripId: string, offset = 0, limit = 50): Promise<OffsetPagedItems<AiChatMessage>> => {
    const response = await http.get<OffsetPagedItems<AiChatMessage>>(`/trips/${tripId}/ai/messages`, {
      params: { offset, limit },
    })
    return response.data
  },
}
