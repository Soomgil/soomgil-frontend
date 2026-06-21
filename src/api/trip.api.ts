import http from './http'
import type {
  CreateTripInviteRequest,
  PagedTripSummary,
  TripCreateRequest,
  TripDetail,
  TripDetailMember,
  TripInvite,
  TripListParams,
  TripUpdateRequest,
} from '@/types/trip'

export const tripApi = {
  getTrips: async (params?: TripListParams): Promise<PagedTripSummary> => {
    const response = await http.get<PagedTripSummary>('/trips', {
      params,
      paramsSerializer: { indexes: null },
    })
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

  updateTrip: async (tripId: string, data: TripUpdateRequest): Promise<TripDetail> => {
    const response = await http.patch<TripDetail>(`/trips/${tripId}`, data)
    return response.data
  },

  deleteTrip: async (tripId: string): Promise<void> => {
    await http.delete(`/trips/${tripId}`)
  },

  /* ── Members ── */

  getMembers: async (tripId: string): Promise<TripDetailMember[]> => {
    const response = await http.get<TripDetailMember[]>(`/trips/${tripId}/members`)
    return response.data
  },

  removeMember: async (tripId: string, userId: string): Promise<void> => {
    await http.delete(`/trips/${tripId}/members/${userId}`)
  },

  /* ── Invites ── */

  getInvites: async (tripId: string): Promise<TripInvite[]> => {
    const response = await http.get<TripInvite[]>(`/trips/${tripId}/invites`)
    return response.data
  },

  createInvite: async (tripId: string, data: CreateTripInviteRequest = {}): Promise<TripInvite> => {
    const response = await http.post<TripInvite>(`/trips/${tripId}/invites`, data)
    return response.data
  },

  revokeInvite: async (tripId: string, inviteId: string): Promise<void> => {
    await http.delete(`/trips/${tripId}/invites/${inviteId}`)
  },

  acceptInvite: async (inviteCode: string, inviteToken?: string): Promise<TripDetail> => {
    const response = await http.post<TripDetail>(
      `/trip-invites/${encodeURIComponent(inviteCode)}/accept`,
      inviteToken ? { inviteToken } : {},
    )
    return response.data
  },
}
