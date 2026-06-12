import http from './http'
import type { ApiResponse, PaginatedResponse, PaginationParams } from '@/types/api'
import type { Notification } from '@/types/notification'

export const notificationApi = {
  /** 알림 목록 */
  getNotifications: async (params?: PaginationParams): Promise<ApiResponse<PaginatedResponse<Notification>>> => {
    // TODO: return http.get('/notifications', { params })
    return { status: 200, message: 'ok', data: { content: [], totalPages: 0, totalElements: 0, page: 0, size: 20 } }
  },

  /** 알림 읽음 처리 */
  markAsRead: async (notificationId: string): Promise<ApiResponse<void>> => {
    return http.patch(`/notifications/${notificationId}/read`)
  },

  /** 전체 읽음 처리 */
  markAllAsRead: async (): Promise<ApiResponse<void>> => {
    return http.patch('/notifications/read-all')
  },
}
