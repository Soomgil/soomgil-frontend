import http from './http'
import type {
  BackendUser,
  UpdateMeRequest,
  UpdateUserSettingsRequest,
  User,
  UserSettings,
  UserSummary,
  UserSession,
  SecurityEvent,
} from '@/types/auth'
import type { PagedItems } from '@/types/api'
import { mapBackendUser } from '@/types/auth'

export const userApi = {
  /** 현재 사용자 조회 (GET /me) */
  getMe: async (): Promise<User> => {
    const res = await http.get<BackendUser>('/me')
    return mapBackendUser(res.data)
  },

  /** 내 프로필 수정 (PATCH /me) */
  updateMe: async (data: UpdateMeRequest): Promise<User> => {
    const res = await http.patch<BackendUser>('/me', data)
    return mapBackendUser(res.data)
  },

  /** 계정 삭제 요청 (DELETE /me, 202 ACCEPTED) */
  deleteMe: async (): Promise<void> => {
    await http.delete('/me')
  },

  /** 내 설정 조회 (GET /me/settings) */
  getSettings: async (): Promise<UserSettings> => {
    const res = await http.get<UserSettings>('/me/settings')
    return res.data
  },

  /** 내 설정 수정 (PATCH /me/settings) */
  updateSettings: async (data: UpdateUserSettingsRequest): Promise<UserSettings> => {
    const res = await http.patch<UserSettings>('/me/settings', data)
    return res.data
  },

  getSessions: async (page = 0, size = 20): Promise<PagedItems<UserSession>> => {
    const res = await http.get<PagedItems<UserSession>>('/me/sessions', { params: { page, size } })
    return res.data
  },

  revokeSession: async (sessionId: string): Promise<void> => {
    await http.delete(`/me/sessions/${sessionId}`)
  },

  getSecurityEvents: async (page = 0, size = 20): Promise<PagedItems<SecurityEvent>> => {
    const res = await http.get<PagedItems<SecurityEvent>>('/me/security-events', { params: { page, size } })
    return res.data
  },

  searchUsers: async (query = '', page = 0, size = 20): Promise<PagedItems<UserSummary>> => {
    const res = await http.get<PagedItems<UserSummary>>('/users', { params: { q: query || undefined, page, size } })
    return res.data
  },

  /** 사용자 팔로우 */
  follow: async (userId: string): Promise<any> => {
    const res = await http.put(`/users/${userId}/follow`)
    return res.data
  },

  /** 팔로우 취소 */
  unfollow: async (userId: string): Promise<void> => {
    await http.delete(`/users/${userId}/follow`)
  },

  /** 팔로워 목록 조회 */
  getFollowers: async (userId: string): Promise<UserSummary[]> => {
    const res = await http.get<PagedItems<UserSummary>>(`/users/${userId}/followers`, {
      params: { page: 0, size: 100 },
    })
    return res.data.items
  },

  /** 팔로잉 목록 조회 */
  getFollowing: async (userId: string): Promise<UserSummary[]> => {
    const res = await http.get<PagedItems<UserSummary>>(`/users/${userId}/following`, {
      params: { page: 0, size: 100 },
    })
    return res.data.items
  },
  /** 특정 사용자 프로필 조회 (GET /users/{userId}) */
  getUserProfile: async (userId: string): Promise<import('@/types/user').PublicUserProfile> => {
    const res = await http.get<import('@/types/user').PublicUserProfile>(`/users/${userId}`)
    return res.data
  },
}
