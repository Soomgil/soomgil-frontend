import http from './http'
import type { BulkUpdateResult, PagedItems } from '@/types/api'
import type { Notification } from '@/types/notification'

export const notificationApi = {
  /** 알림 목록 */
  getNotifications: async (params?: { unreadOnly?: boolean; page?: number; size?: number }): Promise<PagedItems<Notification>> => {
    const response = await http.get<PagedItems<Notification>>('/notifications', { params })
    return response.data
  },

  /** 알림 읽음 처리 */
  markAsRead: async (notificationId: string): Promise<Notification> => {
    const response = await http.patch<Notification>(`/notifications/${notificationId}/read`)
    return response.data
  },

  /** 전체 읽음 처리 */
  markAllAsRead: async (): Promise<BulkUpdateResult> => {
    const response = await http.patch<BulkUpdateResult>('/notifications/read-all')
    return response.data
  },

  deleteNotification: async (notificationId: string): Promise<void> => {
    await http.delete(`/notifications/${notificationId}`)
  },
}
