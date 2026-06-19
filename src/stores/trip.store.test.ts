import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { tripApi } from '@/api/trip.api'
import { useTripStore } from './trip.store'
import type { PagedTripSummary, TripDetail } from '@/types/trip'

vi.mock('@/api/trip.api', () => ({
  tripApi: {
    getTrips: vi.fn(),
    getTrip: vi.fn(),
    createTrip: vi.fn(),
    getMembers: vi.fn(),
  },
}))

const trip: TripDetail = {
  id: 'trip-1',
  title: '부산 주말 여행',
  displayDestination: '부산광역시',
  status: 'ACTIVE',
  myRole: 'OWNER',
  itineraryVersion: 0,
  createdAt: '2026-06-19T10:00:00Z',
  ownerUserId: 'user-1',
  regions: [],
  members: [],
  retrippedFromPostId: null,
}

const page: PagedTripSummary = {
  items: [trip],
  page: {
    page: 0,
    size: 20,
    totalElements: 1,
    totalPages: 1,
    sort: [],
  },
}

describe('trip store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('실제 목록 응답의 items와 page를 저장한다', async () => {
    vi.mocked(tripApi.getTrips).mockResolvedValue(page)
    const store = useTripStore()

    await store.fetchTrips({ status: 'ACTIVE' })

    expect(store.trips).toEqual([trip])
    expect(store.page).toEqual(page.page)
    expect(store.error).toBeNull()
    expect(store.loading).toBe(false)
  })

  it('목록 조회 실패를 사용자가 재시도할 수 있는 상태로 저장한다', async () => {
    vi.mocked(tripApi.getTrips).mockRejectedValue(new Error('network error'))
    const store = useTripStore()

    await expect(store.fetchTrips()).rejects.toThrow('network error')

    expect(store.trips).toEqual([])
    expect(store.error).toBe('여행 목록을 불러오지 못했습니다.')
    expect(store.loading).toBe(false)
  })

  it('생성된 여행을 목록 첫 위치에 추가한다', async () => {
    vi.mocked(tripApi.createTrip).mockResolvedValue(trip)
    const store = useTripStore()

    const created = await store.createTrip({
      title: trip.title,
      displayDestination: trip.displayDestination ?? undefined,
    })

    expect(created).toEqual(trip)
    expect(store.trips).toEqual([trip])
    expect(store.creating).toBe(false)
  })
})
