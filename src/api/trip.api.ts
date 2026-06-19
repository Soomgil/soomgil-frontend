import http from './http'
import type { ApiResponse } from '@/types/api'
import type {
  PagedTripSummary,
  Trip,
  TripCreateRequest,
  TripDetail,
  TripInvite,
  TripListParams,
  TripMember,
} from '@/types/trip'

export const tripApi = {
  getTrips: async (params?: TripListParams): Promise<PagedTripSummary> => {
    const response = await http.get<PagedTripSummary>('/trips', { params })
    return response.data
  },

  getTrip: async (tripId: string): Promise<TripDetail> => {
    const response = await http.get<TripDetail>(`/trips/${tripId}`)
    return response.data
  },

  createTrip: async (data: TripCreateRequest): Promise<TripDetail> => {
    const response = await http.post<TripDetail>('/trips', data)
    return response.data
  },

  updateTrip: async (tripId: string, data: Partial<Trip>): Promise<ApiResponse<Trip>> => {
    return http.patch(`/trips/${tripId}`, data)
  },

  /* ── Members ── */

  getMembers: async (tripId: string): Promise<ApiResponse<TripMember[]>> => {
    // TODO: return http.get(`/trips/${tripId}/members`)
    return { status: 200, message: 'ok', data: [] }
  },

  updateMemberRole: async (tripId: string, userId: string, role: string): Promise<ApiResponse<TripMember>> => {
    return http.patch(`/trips/${tripId}/members/${userId}`, { role })
  },

  removeMember: async (tripId: string, userId: string): Promise<ApiResponse<void>> => {
    return http.delete(`/trips/${tripId}/members/${userId}`)
  },

  /* ── Invites ── */

  createInvite: async (tripId: string, inviteeUserId?: string): Promise<ApiResponse<TripInvite>> => {
    return http.post(`/trips/${tripId}/members`, { inviteeUserId })
  },

  acceptInvite: async (inviteCode: string): Promise<ApiResponse<TripInvite>> => {
    return http.post(`/invites/${inviteCode}/accept`)
  },
}
