import http from './http'
import type {
  CreateItineraryDayRequest,
  CreateItineraryItemRequest,
  Itinerary,
  ItineraryMutationResponse,
  ReorderItineraryRequest,
  UpdateItineraryDayRequest,
  UpdateItineraryItemRequest,
} from '@/types/itinerary'

export const itineraryApi = {
  getItinerary: async (tripId: string): Promise<Itinerary> => {
    const response = await http.get<Itinerary>(`/trips/${tripId}/itinerary`)
    return response.data
  },

  createDay: async (tripId: string, request: CreateItineraryDayRequest): Promise<ItineraryMutationResponse> => {
    const response = await http.post<ItineraryMutationResponse>(`/trips/${tripId}/itinerary/days`, request)
    return response.data
  },

  updateDay: async (tripId: string, dayId: string, request: UpdateItineraryDayRequest): Promise<ItineraryMutationResponse> => {
    const response = await http.patch<ItineraryMutationResponse>(`/trips/${tripId}/itinerary/days/${dayId}`, request)
    return response.data
  },

  deleteDay: async (tripId: string, dayId: string, baseVersion: number): Promise<ItineraryMutationResponse> => {
    const response = await http.delete<ItineraryMutationResponse>(`/trips/${tripId}/itinerary/days/${dayId}`, {
      data: { baseVersion },
    })
    return response.data
  },

  createItem: async (tripId: string, request: CreateItineraryItemRequest): Promise<ItineraryMutationResponse> => {
    const response = await http.post<ItineraryMutationResponse>(`/trips/${tripId}/itinerary/items`, request)
    return response.data
  },

  updateItem: async (tripId: string, itemId: string, request: UpdateItineraryItemRequest): Promise<ItineraryMutationResponse> => {
    const response = await http.patch<ItineraryMutationResponse>(`/trips/${tripId}/itinerary/items/${itemId}`, request)
    return response.data
  },

  deleteItem: async (tripId: string, itemId: string, baseVersion: number): Promise<ItineraryMutationResponse> => {
    const response = await http.delete<ItineraryMutationResponse>(`/trips/${tripId}/itinerary/items/${itemId}`, {
      data: { baseVersion },
    })
    return response.data
  },

  reorder: async (tripId: string, request: ReorderItineraryRequest): Promise<ItineraryMutationResponse> => {
    const response = await http.put<ItineraryMutationResponse>(`/trips/${tripId}/itinerary/order`, request)
    return response.data
  },
}
