import http from './http'
import type { ApiResponse, PaginatedResponse, PaginationParams } from '@/types/api'
import type { Trip, TripCreateRequest, TripMember, TripInvite } from '@/types/trip'
import { mockTrips } from '@/mocks/mockTrips'

export const tripApi = {
  getTrips: async (params?: PaginationParams): Promise<ApiResponse<PaginatedResponse<Trip>>> => {
    // TODO: return http.get('/trips', { params })
    return { status: 200, message: 'ok', data: { content: mockTrips, totalPages: 1, totalElements: mockTrips.length, page: 0, size: 20 } }
  },

  getTrip: async (tripId: string): Promise<ApiResponse<Trip>> => {
    // TODO: return http.get(`/trips/${tripId}`)
    const trip = mockTrips.find((t) => t.id === tripId) ?? mockTrips[0]
    return { status: 200, message: 'ok', data: trip }
  },

  createTrip: async (data: TripCreateRequest): Promise<ApiResponse<Trip>> => {
    // TODO: return http.post('/trips', data)
    return { status: 201, message: 'ok', data: { ...mockTrips[0], id: `trip_${Date.now()}`, ...data } }
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
