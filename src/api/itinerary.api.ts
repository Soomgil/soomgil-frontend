import http from './http'
import type { ApiResponse } from '@/types/api'
import type { ItineraryDay, ItineraryItem, ItineraryPutRequest, TripRoute, MapDrawing } from '@/types/itinerary'

export const itineraryApi = {
  /** 전체 일정 조회 (days → items, routes 포함) */
  getItinerary: async (tripId: string): Promise<ApiResponse<{ days: ItineraryDay[]; routes: TripRoute[] }>> => {
    // TODO: return http.get(`/trips/${tripId}/itinerary`)
    return {
      status: 200, message: 'ok',
      data: {
        days: [
          {
            id: 'day_1', tripId, groupType: 'DAY', dayNumber: 1, date: '2026-05-20',
            title: null, sortOrder: 0, createdAt: '', updatedAt: '',
            items: [
              { id: 'step_1', tripId, itineraryDayId: 'day_1', sortOrder: 0, itemType: 'PLACE', placeProvider: 'KTO', externalPlaceId: 'place_station', placeName: '대전역', address: null, lat: 36.3323, lng: 127.4344, thumbnailUrl: null, sourceStatus: 'AVAILABLE', createdByUserId: null, updatedByUserId: null, createdAt: '', updatedAt: '' },
              { id: 'step_2', tripId, itineraryDayId: 'day_1', sortOrder: 1, itemType: 'PLACE', placeProvider: 'KTO', externalPlaceId: 'place_01', placeName: '성심당문화원', address: null, lat: 36.3277, lng: 127.4267, thumbnailUrl: null, sourceStatus: 'AVAILABLE', createdByUserId: null, updatedByUserId: null, createdAt: '', updatedAt: '' },
            ],
          },
          {
            id: 'day_2', tripId, groupType: 'DAY', dayNumber: 2, date: '2026-05-21',
            title: null, sortOrder: 1, createdAt: '', updatedAt: '',
            items: [
              { id: 'step_3', tripId, itineraryDayId: 'day_2', sortOrder: 0, itemType: 'PLACE', placeProvider: 'KTO', externalPlaceId: 'place_02', placeName: '한밭수목원', address: null, lat: 36.3615, lng: 127.3904, thumbnailUrl: null, sourceStatus: 'AVAILABLE', createdByUserId: null, updatedByUserId: null, createdAt: '', updatedAt: '' },
              { id: 'step_4', tripId, itineraryDayId: 'day_2', sortOrder: 1, itemType: 'PLACE', placeProvider: 'KTO', externalPlaceId: 'place_03', placeName: '국립중앙과학관', address: null, lat: 36.3863, lng: 127.3873, thumbnailUrl: null, sourceStatus: 'AVAILABLE', createdByUserId: null, updatedByUserId: null, createdAt: '', updatedAt: '' },
            ],
          },
          {
            id: 'day_3', tripId, groupType: 'DAY', dayNumber: 3, date: '2026-05-22',
            title: null, sortOrder: 2, createdAt: '', updatedAt: '',
            items: [
              { id: 'step_5', tripId, itineraryDayId: 'day_3', sortOrder: 0, itemType: 'PLACE', placeProvider: 'KTO', externalPlaceId: 'place_04', placeName: '대전오월드', address: null, lat: 36.3513, lng: 127.3870, thumbnailUrl: null, sourceStatus: 'AVAILABLE', createdByUserId: null, updatedByUserId: null, createdAt: '', updatedAt: '' },
            ],
          },
        ],
        routes: [],
      },
    }
  },

  /** 전체 일정 업데이트 (협업 버전 관리) */
  putItinerary: async (tripId: string, data: ItineraryPutRequest): Promise<ApiResponse<{ days: ItineraryDay[]; routes: TripRoute[] }>> => {
    return http.put(`/trips/${tripId}/itinerary`, data)
  },

  /** 단일 아이템 추가 */
  addItem: async (tripId: string, item: Partial<ItineraryItem>): Promise<ApiResponse<ItineraryItem>> => {
    return http.post(`/trips/${tripId}/itinerary/items`, item)
  },

  /** 단일 아이템 수정 */
  updateItem: async (tripId: string, itemId: string, item: Partial<ItineraryItem>): Promise<ApiResponse<ItineraryItem>> => {
    return http.patch(`/trips/${tripId}/itinerary/items/${itemId}`, item)
  },

  /** 단일 아이템 삭제 */
  deleteItem: async (tripId: string, itemId: string): Promise<ApiResponse<void>> => {
    return http.delete(`/trips/${tripId}/itinerary/items/${itemId}`)
  },

  /* ── Routes ── */

  /** 루트 세그먼트 생성 */
  createRoute: async (tripId: string, originItemId: string, destinationItemId: string, mode: string): Promise<ApiResponse<TripRoute>> => {
    return http.post(`/trips/${tripId}/itinerary/routes`, { originItineraryItemId: originItemId, destinationItineraryItemId: destinationItemId, mode })
  },

  /** 루트 세그먼트 삭제 */
  deleteRoute: async (tripId: string, routeId: string): Promise<ApiResponse<void>> => {
    return http.delete(`/trips/${tripId}/itinerary/routes/${routeId}`)
  },

  /* ── Map Drawings ── */

  /** 지도 그리기 저장 */
  saveDrawing: async (tripId: string, drawing: Partial<MapDrawing>): Promise<ApiResponse<MapDrawing>> => {
    return http.post(`/trips/${tripId}/itinerary/drawings`, drawing)
  },

  /** 지도 그리기 삭제 */
  deleteDrawing: async (tripId: string, drawingId: string): Promise<ApiResponse<void>> => {
    return http.delete(`/trips/${tripId}/itinerary/drawings/${drawingId}`)
  },
}
