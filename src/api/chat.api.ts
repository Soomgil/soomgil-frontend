import http from './http'
import type { PagedTripChatMessage, TripChatMessage } from '@/types/chat'

export const chatApi = {
  async getMessages(tripId: string, offset = 0, limit = 50): Promise<PagedTripChatMessage> {
    const response = await http.get<PagedTripChatMessage>(`/trips/${tripId}/chat/messages`, {
      params: { offset, limit },
    })
    return response.data
  },

  async sendMessage(tripId: string, content: string): Promise<TripChatMessage> {
    const response = await http.post<TripChatMessage>(`/trips/${tripId}/chat/messages`, { content })
    return response.data
  },

  async deleteMessage(tripId: string, messageId: string): Promise<void> {
    await http.delete(`/trips/${tripId}/chat/messages/${messageId}`)
  },
}
