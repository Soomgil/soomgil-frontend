import http from './http'
import type {
  CreateItineraryDayRequest,
  CreateItineraryItemRequest,
  CreateMapDrawingRequest,
  Itinerary,
  ItineraryMutationResponse,
  MapMatchRouteRequest,
  ReorderItineraryRequest,
  UpdateItineraryDayRequest,
  UpdateItineraryItemRequest,
  UpdateMapDrawingRequest,
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

  mapMatchRoute: async (tripId: string, request: MapMatchRouteRequest): Promise<ItineraryMutationResponse> => {
    const response = await http.post<ItineraryMutationResponse>(`/trips/${tripId}/itinerary/routes/map-match`, request)
    return response.data
  },

  deleteRoute: async (tripId: string, routeId: string, baseVersion: number): Promise<ItineraryMutationResponse> => {
    const response = await http.delete<ItineraryMutationResponse>(`/trips/${tripId}/itinerary/routes/${routeId}`, {
      data: { baseVersion },
    })
    return response.data
  },

  createDrawing: async (tripId: string, request: CreateMapDrawingRequest): Promise<ItineraryMutationResponse> => {
    const response = await http.post<ItineraryMutationResponse>(`/trips/${tripId}/map-drawings`, request)
    return response.data
  },

  updateDrawing: async (tripId: string, drawingId: string, request: UpdateMapDrawingRequest): Promise<ItineraryMutationResponse> => {
    const response = await http.patch<ItineraryMutationResponse>(`/trips/${tripId}/map-drawings/${drawingId}`, request)
    return response.data
  },

  deleteDrawing: async (tripId: string, drawingId: string, baseVersion: number): Promise<ItineraryMutationResponse> => {
    const response = await http.delete<ItineraryMutationResponse>(`/trips/${tripId}/map-drawings/${drawingId}`, {
      data: { baseVersion },
    })
    return response.data
  },
}
