import { beforeEach, describe, expect, it, vi } from 'vitest'
import { itineraryApi } from '@/api/itinerary.api'
import { useItinerary } from './useItinerary'
import type { Itinerary, ItineraryDay, ItineraryItem, TripRoute } from '@/types/itinerary'

vi.mock('@/api/itinerary.api', () => ({
  itineraryApi: {
    getItinerary: vi.fn(),
    createDay: vi.fn(),
    updateDay: vi.fn(),
    deleteDay: vi.fn(),
    createItem: vi.fn(),
    updateItem: vi.fn(),
    deleteItem: vi.fn(),
    reorder: vi.fn(),
		mapMatchRoute: vi.fn(),
		deleteRoute: vi.fn(),
		createDrawing: vi.fn(),
		deleteDrawing: vi.fn(),
  },
}))

const scheduledDay: ItineraryDay = {
  id: 'day-1',
  tripId: 'trip-1',
  groupType: 'DAY',
  dayNumber: 1,
  date: '2026-07-01',
  title: null,
  sortOrder: 0,
  items: [],
}

const unscheduledDay: ItineraryDay = {
  ...scheduledDay,
  id: 'day-unscheduled',
  groupType: 'UNSCHEDULED',
  dayNumber: null,
  date: null,
  sortOrder: 1,
}

const item: ItineraryItem = {
  id: 'item-1',
  itineraryDayId: 'day-unscheduled',
  sortOrder: 0,
  itemType: 'CUSTOM_PLACE',
  place: null,
  placeName: '자유 시간',
  address: null,
  lat: null,
  lng: null,
  thumbnailUrl: null,
  sourceStatus: 'AVAILABLE',
}

const route: TripRoute = {
  id: 'route-1',
  originItineraryItemId: 'item-1',
  destinationItineraryItemId: 'item-2',
  mode: 'WALKING',
  provider: 'MAPBOX',
  providerProfile: 'mapbox/walking',
  geometryFormat: 'GEOJSON',
  geometry: { type: 'LineString', coordinates: [[127, 37], [127.1, 37.1]] },
  distanceMeters: 120,
  durationSeconds: 60,
  confidence: 0.9,
}

const itinerary: Itinerary = {
  tripId: 'trip-1',
  itineraryVersion: 3,
  days: [scheduledDay],
  routes: [],
  mapDrawings: [],
}

describe('useItinerary', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    scheduledDay.items = []
    unscheduledDay.items = []
    itinerary.itineraryVersion = 3
    itinerary.days = [scheduledDay]
  })

  it('일정과 version을 조회한다', async () => {
    vi.mocked(itineraryApi.getItinerary).mockResolvedValue(itinerary)
    const state = useItinerary('trip-1')

    await state.fetchItinerary()

    expect(state.days.value).toEqual([scheduledDay])
    expect(state.itineraryVersion.value).toBe(3)
    expect(state.loading.value).toBe(false)
  })

  it('일차 미정이 없을 때만 생성하고 재사용한다', async () => {
    vi.mocked(itineraryApi.getItinerary).mockResolvedValue(itinerary)
    vi.mocked(itineraryApi.createDay).mockResolvedValue({
      tripId: 'trip-1', itineraryVersion: 4, day: unscheduledDay, item: null,
      route: null, drawing: null, affectedRouteIds: [],
    })
    const state = useItinerary('trip-1')
    await state.fetchItinerary()

    const created = await state.ensureUnscheduledDay()
    const reused = await state.ensureUnscheduledDay()

    expect(created.id).toBe('day-unscheduled')
    expect(reused.id).toBe('day-unscheduled')
    expect(itineraryApi.createDay).toHaveBeenCalledTimes(1)
    expect(itineraryApi.createDay).toHaveBeenCalledWith('trip-1', {
      baseVersion: 3,
      groupType: 'UNSCHEDULED',
      dayNumber: null,
      date: null,
      sortOrder: 1,
    })
    expect(state.itineraryVersion.value).toBe(4)
  })

  it('일차 미정 생성이 진행 중이면 같은 요청 결과를 공유한다', async () => {
    let resolveCreation!: (value: Awaited<ReturnType<typeof itineraryApi.createDay>>) => void
    const creation = new Promise<Awaited<ReturnType<typeof itineraryApi.createDay>>>((resolve) => {
      resolveCreation = resolve
    })
    vi.mocked(itineraryApi.getItinerary).mockResolvedValue(itinerary)
    vi.mocked(itineraryApi.createDay).mockReturnValue(creation)
    const state = useItinerary('trip-1')
    await state.fetchItinerary()

    const first = state.ensureUnscheduledDay()
    const second = state.ensureUnscheduledDay()
    resolveCreation({
      tripId: 'trip-1', itineraryVersion: 4, day: unscheduledDay, item: null,
      route: null, drawing: null, affectedRouteIds: [],
    })

    await expect(Promise.all([first, second])).resolves.toEqual([unscheduledDay, unscheduledDay])
    expect(itineraryApi.createDay).toHaveBeenCalledTimes(1)
  })

  it('day 수정 시 기존 아이템을 보존하고 최신 version으로 삭제한다', async () => {
    const scheduledItem = { ...item, itineraryDayId: 'day-1' }
    vi.mocked(itineraryApi.getItinerary).mockResolvedValue({
      ...itinerary,
      days: [{ ...scheduledDay, items: [scheduledItem] }],
    })
    vi.mocked(itineraryApi.updateDay).mockResolvedValue({
      tripId: 'trip-1', itineraryVersion: 4,
      day: { ...scheduledDay, title: '첫째 날', items: [] }, item: null,
      route: null, drawing: null, affectedRouteIds: [],
    })
    vi.mocked(itineraryApi.deleteDay).mockResolvedValue({
      tripId: 'trip-1', itineraryVersion: 5, day: null, item: null,
      route: null, drawing: null, affectedRouteIds: [],
    })
    const state = useItinerary('trip-1')
    await state.fetchItinerary()

    await state.updateDay('day-1', { title: '첫째 날' })

    expect(state.days.value[0].title).toBe('첫째 날')
    expect(state.days.value[0].items).toEqual([scheduledItem])
    expect(itineraryApi.updateDay).toHaveBeenCalledWith('trip-1', 'day-1', {
      baseVersion: 3,
      title: '첫째 날',
    })

    await state.deleteDay('day-1')

    expect(itineraryApi.deleteDay).toHaveBeenCalledWith('trip-1', 'day-1', 4)
    expect(state.days.value).toEqual([])
    expect(state.itineraryVersion.value).toBe(5)
  })

  it('아이템을 생성하고 다른 일차로 이동한다', async () => {
    vi.mocked(itineraryApi.getItinerary).mockResolvedValue({
      ...itinerary,
      days: [scheduledDay, unscheduledDay],
    })
    vi.mocked(itineraryApi.createItem).mockResolvedValue({
      tripId: 'trip-1', itineraryVersion: 4, day: null, item,
      route: null, drawing: null, affectedRouteIds: [],
    })
    vi.mocked(itineraryApi.updateItem).mockResolvedValue({
      tripId: 'trip-1', itineraryVersion: 5, day: null,
      item: { ...item, itineraryDayId: 'day-1' },
      route: null, drawing: null, affectedRouteIds: [],
    })
    const state = useItinerary('trip-1')
    await state.fetchItinerary()

    await state.createItem({
      itineraryDayId: 'day-unscheduled',
      sortOrder: 0,
      itemType: 'CUSTOM_PLACE',
      placeName: '자유 시간',
    })
    await state.updateItem('item-1', { itineraryDayId: 'day-1' })

    expect(state.getItemsByDay('day-unscheduled')).toEqual([])
    expect(state.getItemsByDay('day-1')).toEqual([{ ...item, itineraryDayId: 'day-1' }])
    expect(itineraryApi.updateItem).toHaveBeenCalledWith('trip-1', 'item-1', {
      baseVersion: 4,
      itineraryDayId: 'day-1',
    })
    expect(state.itineraryVersion.value).toBe(5)
  })

  it('응답의 대상 day가 없으면 기존 아이템과 version을 유지한다', async () => {
    const scheduledItem = { ...item, itineraryDayId: 'day-1' }
    vi.mocked(itineraryApi.getItinerary).mockResolvedValue({
      ...itinerary,
      days: [{ ...scheduledDay, items: [scheduledItem] }],
    })
    vi.mocked(itineraryApi.updateItem).mockResolvedValue({
      tripId: 'trip-1', itineraryVersion: 4, day: null,
      item: { ...scheduledItem, itineraryDayId: 'missing-day' },
      route: null, drawing: null, affectedRouteIds: [],
    })
    const state = useItinerary('trip-1')
    await state.fetchItinerary()

    await expect(state.updateItem('item-1', { itineraryDayId: 'missing-day' }))
      .rejects.toThrow('Itinerary day not found for item.')

    expect(state.getItemsByDay('day-1')).toEqual([scheduledItem])
    expect(state.itineraryVersion.value).toBe(3)
  })

  it('아이템 삭제 시 영향받은 route도 정리한다', async () => {
    const route = {
      id: 'route-1', originItineraryItemId: 'item-1', destinationItineraryItemId: 'item-2',
      mode: 'WALKING' as const, provider: 'MAPBOX', providerProfile: null,
      geometryFormat: 'GEOJSON' as const, geometry: {}, distanceMeters: null,
      durationSeconds: null, confidence: null,
    }
    vi.mocked(itineraryApi.getItinerary).mockResolvedValue({
      ...itinerary,
      days: [{ ...unscheduledDay, items: [item] }],
      routes: [route],
    })
    vi.mocked(itineraryApi.deleteItem).mockResolvedValue({
      tripId: 'trip-1', itineraryVersion: 4, day: null, item: null,
      route: null, drawing: null, affectedRouteIds: ['route-1'],
    })
    const state = useItinerary('trip-1')
    await state.fetchItinerary()

    await state.deleteItem('item-1')

    expect(state.allItems.value).toEqual([])
    expect(state.routes.value).toEqual([])
    expect(itineraryApi.deleteItem).toHaveBeenCalledWith('trip-1', 'item-1', 3)
  })

  it('전체 순서 snapshot을 저장하고 일차 이동을 로컬 상태에 반영한다', async () => {
    const scheduledItem = { ...item, itineraryDayId: 'day-1' }
    vi.mocked(itineraryApi.getItinerary).mockResolvedValue({
      ...itinerary,
      days: [
        { ...scheduledDay, items: [scheduledItem] },
        { ...unscheduledDay, items: [] },
      ],
    })
    vi.mocked(itineraryApi.reorder).mockResolvedValue({
      tripId: 'trip-1', itineraryVersion: 4, day: null, item: null,
      route: null, drawing: null, affectedRouteIds: [],
    })
    const state = useItinerary('trip-1')
    await state.fetchItinerary()
    const order = {
      days: [
        { dayId: 'day-unscheduled', sortOrder: 0, itemOrders: [{ itemId: 'item-1', sortOrder: 0 }] },
        { dayId: 'day-1', sortOrder: 1, itemOrders: [] },
      ],
    }

    await state.reorder(order)

    expect(itineraryApi.reorder).toHaveBeenCalledWith('trip-1', { ...order, baseVersion: 3 })
    expect(state.days.value.map((day) => day.id)).toEqual(['day-unscheduled', 'day-1'])
    expect(state.days.value[0].items).toEqual([{
      ...scheduledItem,
      itineraryDayId: 'day-unscheduled',
      sortOrder: 0,
    }])
    expect(state.itineraryVersion.value).toBe(4)
  })

  it('경로 매칭 중 version 충돌이 나면 최신 일정을 조회한 뒤 한 번 재시도한다', async () => {
    vi.mocked(itineraryApi.getItinerary)
      .mockResolvedValueOnce({
        ...itinerary,
        days: [scheduledDay],
        itineraryVersion: 3,
      })
      .mockResolvedValueOnce({
        ...itinerary,
        days: [scheduledDay, unscheduledDay],
        itineraryVersion: 7,
      })
    vi.mocked(itineraryApi.mapMatchRoute)
      .mockRejectedValueOnce({ response: { status: 409 } })
      .mockResolvedValueOnce({
        tripId: 'trip-1',
        itineraryVersion: 8,
        day: null,
        item: null,
        route,
        drawing: null,
        affectedRouteIds: [],
      })
    const state = useItinerary('trip-1')
    await state.fetchItinerary()

    const result = await state.mapMatchRoute({
      originItineraryItemId: 'item-1',
      destinationItineraryItemId: 'item-2',
      mode: 'WALKING',
      coordinates: [{ lng: 127, lat: 37 }, { lng: 127.1, lat: 37.1 }],
    })

    expect(result).toEqual(route)
    expect(itineraryApi.getItinerary).toHaveBeenCalledTimes(2)
    expect(itineraryApi.mapMatchRoute).toHaveBeenNthCalledWith(1, 'trip-1', {
      baseVersion: 3,
      originItineraryItemId: 'item-1',
      destinationItineraryItemId: 'item-2',
      mode: 'WALKING',
      coordinates: [{ lng: 127, lat: 37 }, { lng: 127.1, lat: 37.1 }],
    })
    expect(itineraryApi.mapMatchRoute).toHaveBeenNthCalledWith(2, 'trip-1', {
      baseVersion: 7,
      originItineraryItemId: 'item-1',
      destinationItineraryItemId: 'item-2',
      mode: 'WALKING',
      coordinates: [{ lng: 127, lat: 37 }, { lng: 127.1, lat: 37.1 }],
    })
    expect(state.routes.value).toEqual([route])
    expect(state.itineraryVersion.value).toBe(8)
  })
})
