import { beforeEach, describe, expect, it, vi } from 'vitest'
import http from './http'
import { itineraryApi } from './itinerary.api'

vi.mock('./http', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}))

describe('itinerary API', () => {
  beforeEach(() => vi.resetAllMocks())

  it('일정 전체를 실제 여행 endpoint에서 조회한다', async () => {
    const itinerary = { tripId: 'trip-1', itineraryVersion: 3, days: [], routes: [], mapDrawings: [] }
    vi.mocked(http.get).mockResolvedValue({ data: itinerary })

    await expect(itineraryApi.getItinerary('trip-1')).resolves.toEqual(itinerary)
    expect(http.get).toHaveBeenCalledWith('/trips/trip-1/itinerary')
  })

  it('day 생성·수정·삭제에 version 계약을 적용한다', async () => {
    vi.mocked(http.post).mockResolvedValue({ data: { itineraryVersion: 4 } })
    vi.mocked(http.patch).mockResolvedValue({ data: { itineraryVersion: 5 } })
    vi.mocked(http.delete).mockResolvedValue({ data: { itineraryVersion: 6 } })

    await itineraryApi.createDay('trip-1', { baseVersion: 3, groupType: 'UNSCHEDULED' })
    await itineraryApi.updateDay('trip-1', 'day-1', { baseVersion: 4, title: '첫째 날' })
    await itineraryApi.deleteDay('trip-1', 'day-1', 5)

    expect(http.post).toHaveBeenCalledWith('/trips/trip-1/itinerary/days', {
      baseVersion: 3,
      groupType: 'UNSCHEDULED',
    })
    expect(http.patch).toHaveBeenCalledWith('/trips/trip-1/itinerary/days/day-1', {
      baseVersion: 4,
      title: '첫째 날',
    })
    expect(http.delete).toHaveBeenCalledWith('/trips/trip-1/itinerary/days/day-1', {
      data: { baseVersion: 5 },
    })
  })

  it('item 생성·수정·삭제에 version 계약을 적용한다', async () => {
    vi.mocked(http.post).mockResolvedValue({ data: { itineraryVersion: 4 } })
    vi.mocked(http.patch).mockResolvedValue({ data: { itineraryVersion: 5 } })
    vi.mocked(http.delete).mockResolvedValue({ data: { itineraryVersion: 6 } })
    const createRequest = {
      baseVersion: 3,
      itineraryDayId: 'day-1',
      sortOrder: 0,
      itemType: 'CUSTOM_PLACE' as const,
      placeName: '자유 시간',
    }

    await itineraryApi.createItem('trip-1', createRequest)
    await itineraryApi.updateItem('trip-1', 'item-1', { baseVersion: 4, placeName: '점심 식사' })
    await itineraryApi.deleteItem('trip-1', 'item-1', 5)

    expect(http.post).toHaveBeenCalledWith('/trips/trip-1/itinerary/items', createRequest)
    expect(http.patch).toHaveBeenCalledWith('/trips/trip-1/itinerary/items/item-1', {
      baseVersion: 4,
      placeName: '점심 식사',
    })
    expect(http.delete).toHaveBeenCalledWith('/trips/trip-1/itinerary/items/item-1', {
      data: { baseVersion: 5 },
    })
  })

  it('전체 일정 순서 snapshot을 저장한다', async () => {
    const request = {
      baseVersion: 8,
      days: [{ dayId: 'day-1', sortOrder: 0, itemOrders: [{ itemId: 'item-1', sortOrder: 0 }] }],
    }
    vi.mocked(http.put).mockResolvedValue({ data: { itineraryVersion: 9 } })

    await itineraryApi.reorder('trip-1', request)

    expect(http.put).toHaveBeenCalledWith('/trips/trip-1/itinerary/order', request)
  })

	it('지도 경로와 그림을 canonical version 계약으로 생성·수정·삭제한다', async () => {
		vi.mocked(http.post).mockResolvedValue({ data: { itineraryVersion: 4 } })
		vi.mocked(http.patch).mockResolvedValue({ data: { itineraryVersion: 5 } })
		vi.mocked(http.delete).mockResolvedValue({ data: { itineraryVersion: 5 } })
		const routeRequest = {
			baseVersion: 3, originItineraryItemId: 'item-1', destinationItineraryItemId: 'item-2',
			mode: 'WALKING' as const, coordinates: [{ lng: 127, lat: 36 }, { lng: 128, lat: 37 }],
		}
		const drawingRequest = {
			baseVersion: 4, drawingType: 'FREEHAND' as const,
			geometry: { type: 'LineString', coordinates: [[127, 36], [128, 37]] },
		}

		await itineraryApi.mapMatchRoute('trip-1', routeRequest)
		await itineraryApi.createDrawing('trip-1', drawingRequest)
		await itineraryApi.updateDrawing('trip-1', 'drawing-1', {
			baseVersion: 4,
			drawingVersion: 0,
			transform: { centerLng: 127, centerLat: 36, widthMeters: 120, heightMeters: 120, rotationDeg: 10 },
		})
		await itineraryApi.deleteRoute('trip-1', 'route-1', 4)
		await itineraryApi.deleteDrawing('trip-1', 'drawing-1', 4)

		expect(http.post).toHaveBeenCalledWith('/trips/trip-1/itinerary/routes/map-match', routeRequest)
		expect(http.post).toHaveBeenCalledWith('/trips/trip-1/map-drawings', drawingRequest)
		expect(http.patch).toHaveBeenCalledWith('/trips/trip-1/map-drawings/drawing-1', {
			baseVersion: 4,
			drawingVersion: 0,
			transform: { centerLng: 127, centerLat: 36, widthMeters: 120, heightMeters: 120, rotationDeg: 10 },
		})
		expect(http.delete).toHaveBeenCalledWith('/trips/trip-1/itinerary/routes/route-1', { data: { baseVersion: 4 } })
		expect(http.delete).toHaveBeenCalledWith('/trips/trip-1/map-drawings/drawing-1', { data: { baseVersion: 4 } })
	})
})
