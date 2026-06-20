import { beforeEach, describe, expect, it, vi } from 'vitest'
import http from './http'
import { itineraryApi } from './itinerary.api'

vi.mock('./http', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
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
})
