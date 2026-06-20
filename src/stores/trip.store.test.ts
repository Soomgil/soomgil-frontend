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
    updateTrip: vi.fn(),
    deleteTrip: vi.fn(),
    getMembers: vi.fn(),
    getInvites: vi.fn(),
    createInvite: vi.fn(),
    revokeInvite: vi.fn(),
    removeMember: vi.fn(),
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

  it('다음 페이지를 기존 여행 목록 뒤에 추가한다', async () => {
    const nextTrip = { ...trip, id: 'trip-2', title: '제주 여행' }
    vi.mocked(tripApi.getTrips)
      .mockResolvedValueOnce({
        items: [trip],
        page: { ...page.page, totalElements: 2, totalPages: 2 },
      })
      .mockResolvedValueOnce({
        items: [nextTrip],
        page: { ...page.page, page: 1, totalElements: 2, totalPages: 2 },
      })
    const store = useTripStore()

    await store.fetchTrips({ size: 1, status: 'ACTIVE' })
    await store.fetchNextPage()

    expect(tripApi.getTrips).toHaveBeenLastCalledWith({ page: 1, size: 1, status: 'ACTIVE' })
    expect(store.trips).toEqual([trip, nextTrip])
    expect(store.hasMoreTrips).toBe(false)
  })

  it('다음 페이지 조회 실패를 현재 목록을 유지한 채 표시한다', async () => {
    vi.mocked(tripApi.getTrips)
      .mockResolvedValueOnce({
        items: [trip],
        page: { ...page.page, totalElements: 2, totalPages: 2 },
      })
      .mockRejectedValueOnce(new Error('network error'))
    const store = useTripStore()

    await store.fetchTrips({ size: 1 })
    await store.fetchNextPage()

    expect(store.trips).toEqual([trip])
    expect(store.loadMoreError).toBe('다음 여행을 불러오지 못했습니다.')
    expect(store.loadingMore).toBe(false)
  })

  it('멤버와 초대 목록을 함께 불러온다', async () => {
    const member = {
      id: 'member-1',
      tripId: trip.id,
      user: { id: 'user-1', displayName: '김지훈', profileImageUrl: null },
      role: 'MEMBER' as const,
      accessRole: 'OWNER' as const,
      status: 'ACTIVE' as const,
      joinedAt: '2026-06-19T10:00:00Z',
    }
    vi.mocked(tripApi.getMembers).mockResolvedValue([member])
    vi.mocked(tripApi.getInvites).mockResolvedValue([])
    const store = useTripStore()

    await store.fetchTripAccess(trip.id, true)

    expect(store.members).toEqual([member])
    expect(store.invites).toEqual([])
    expect(store.accessError).toBeNull()
  })

  it('수정된 여행을 목록과 현재 여행에 반영한다', async () => {
    const updated = { ...trip, title: '수정된 부산 여행', status: 'ARCHIVED' as const }
    vi.mocked(tripApi.getTrips).mockResolvedValue(page)
    vi.mocked(tripApi.updateTrip).mockResolvedValue(updated)
    const store = useTripStore()
    await store.fetchTrips()
    store.setCurrentTrip(trip)

    await store.updateTrip(trip.id, { title: updated.title, status: updated.status })

    expect(store.trips).toEqual([updated])
    expect(store.currentTrip).toEqual(updated)
    expect(store.mutating).toBe(false)
  })

  it('상태 변경으로 현재 필터에서 벗어난 여행을 목록에서 제거한다', async () => {
    const activePage = { ...page, page: { ...page.page, totalElements: 1, totalPages: 1 } }
    const archived = { ...trip, status: 'ARCHIVED' as const }
    vi.mocked(tripApi.getTrips).mockResolvedValue(activePage)
    vi.mocked(tripApi.updateTrip).mockResolvedValue(archived)
    const store = useTripStore()
    await store.fetchTrips({ status: 'ACTIVE' })

    await store.updateTrip(trip.id, { status: 'ARCHIVED' })

    expect(store.trips).toEqual([])
    expect(store.page?.totalElements).toBe(0)
  })

  it('삭제된 여행을 목록에서 제거하고 페이지 개수를 줄인다', async () => {
    vi.mocked(tripApi.getTrips).mockResolvedValue(page)
    vi.mocked(tripApi.deleteTrip).mockResolvedValue(undefined)
    const store = useTripStore()
    await store.fetchTrips()
    store.setCurrentTrip(trip)

    await store.deleteTrip(trip.id)

    expect(store.trips).toEqual([])
    expect(store.currentTrip).toBeNull()
    expect(store.page?.totalElements).toBe(0)
    expect(store.mutating).toBe(false)
  })
})
