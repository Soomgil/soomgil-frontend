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
    acceptInvite: vi.fn(),
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
    vi.resetAllMocks()
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

  it('연속 목록 조회에서는 가장 최근 요청 결과만 반영한다', async () => {
    let resolveActive!: (value: PagedTripSummary) => void
    let resolveArchived!: (value: PagedTripSummary) => void
    const activeRequest = new Promise<PagedTripSummary>((resolve) => { resolveActive = resolve })
    const archivedRequest = new Promise<PagedTripSummary>((resolve) => { resolveArchived = resolve })
    const archivedTrip = { ...trip, id: 'trip-archived', status: 'ARCHIVED' as const }
    vi.mocked(tripApi.getTrips)
      .mockReturnValueOnce(activeRequest)
      .mockReturnValueOnce(archivedRequest)
    const store = useTripStore()

    const first = store.fetchTrips({ status: 'ACTIVE' })
    const second = store.fetchTrips({ status: 'ARCHIVED' })
    resolveArchived({ items: [archivedTrip], page: page.page })
    await second
    resolveActive(page)
    await first

    expect(store.trips).toEqual([archivedTrip])
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
    vi.mocked(tripApi.getTrips).mockResolvedValue(page)
    const store = useTripStore()

    const created = await store.createTrip({
      title: trip.title,
      displayDestination: trip.displayDestination ?? undefined,
    })

    expect(created).toEqual(trip)
    expect(store.trips).toEqual([trip])
    expect(store.error).toBeNull()
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

  it('더 보기 도중 필터가 바뀌면 이전 페이지 응답을 무시한다', async () => {
    let resolveNextPage!: (value: PagedTripSummary) => void
    const nextPageRequest = new Promise<PagedTripSummary>((resolve) => { resolveNextPage = resolve })
    const archivedTrip = { ...trip, id: 'trip-archived', status: 'ARCHIVED' as const }
    vi.mocked(tripApi.getTrips)
      .mockResolvedValueOnce({
        items: [trip],
        page: { ...page.page, totalElements: 2, totalPages: 2 },
      })
      .mockReturnValueOnce(nextPageRequest)
      .mockResolvedValueOnce({ items: [archivedTrip], page: page.page })
    const store = useTripStore()
    await store.fetchTrips({ status: 'ACTIVE', size: 1 })

    const loadMore = store.fetchNextPage()
    await store.fetchTrips({ status: 'ARCHIVED', size: 1 })
    resolveNextPage({
      items: [{ ...trip, id: 'trip-2' }],
      page: { ...page.page, page: 1, totalElements: 2, totalPages: 2 },
    })
    await loadMore

    expect(store.trips).toEqual([archivedTrip])
  })

  it('이전 필터의 더 보기 완료가 새 필터의 더 보기 상태를 해제하지 않는다', async () => {
    let resolveOldPage!: (value: PagedTripSummary) => void
    let resolveNewPage!: (value: PagedTripSummary) => void
    const oldPageRequest = new Promise<PagedTripSummary>((resolve) => { resolveOldPage = resolve })
    const newPageRequest = new Promise<PagedTripSummary>((resolve) => { resolveNewPage = resolve })
    const archivedTrip = { ...trip, id: 'trip-archived', status: 'ARCHIVED' as const }
    vi.mocked(tripApi.getTrips)
      .mockResolvedValueOnce({ items: [trip], page: { ...page.page, totalPages: 2 } })
      .mockReturnValueOnce(oldPageRequest)
      .mockResolvedValueOnce({ items: [archivedTrip], page: { ...page.page, totalPages: 2 } })
      .mockReturnValueOnce(newPageRequest)
    const store = useTripStore()
    await store.fetchTrips({ status: 'ACTIVE', size: 1 })
    const oldLoadMore = store.fetchNextPage()
    await store.fetchTrips({ status: 'ARCHIVED', size: 1 })
    const newLoadMore = store.fetchNextPage()

    resolveOldPage({ items: [], page: { ...page.page, page: 1, totalPages: 2 } })
    await oldLoadMore
    expect(store.loadingMore).toBe(true)

    resolveNewPage({ items: [], page: { ...page.page, page: 1, totalPages: 2 } })
    await newLoadMore
    expect(store.loadingMore).toBe(false)
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

  it('목록 변경 동기화가 진행 중인 더 보기 요청을 종료하고 이전 응답을 무시한다', async () => {
    let resolveNextPage!: (value: PagedTripSummary) => void
    const nextPageRequest = new Promise<PagedTripSummary>((resolve) => { resolveNextPage = resolve })
    const createdTrip = { ...trip, id: 'trip-created', title: '새 여행' }
    vi.mocked(tripApi.getTrips)
      .mockResolvedValueOnce({ items: [trip], page: { ...page.page, totalPages: 2 } })
      .mockReturnValueOnce(nextPageRequest)
      .mockResolvedValueOnce({ items: [createdTrip, trip], page: page.page })
    vi.mocked(tripApi.createTrip).mockResolvedValue(createdTrip)
    const store = useTripStore()
    await store.fetchTrips({ size: 1 })
    const loadMore = store.fetchNextPage()

    await store.createTrip({ title: createdTrip.title })
    expect(store.loadingMore).toBe(false)

    resolveNextPage({
      items: [{ ...trip, id: 'trip-stale' }],
      page: { ...page.page, page: 1, totalPages: 2 },
    })
    await loadMore

    expect(store.trips).toEqual([createdTrip, trip])
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

  it('초대 수락 결과를 여행 목록과 현재 여행에 반영한다', async () => {
    vi.mocked(tripApi.acceptInvite).mockResolvedValue(trip)
    const store = useTripStore()

    const accepted = await store.acceptInvite('JOIN-ME')

    expect(accepted).toEqual(trip)
    expect(store.trips).toEqual([trip])
    expect(store.currentTrip).toEqual(trip)
    expect(store.acceptingInvite).toBe(false)
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
    vi.mocked(tripApi.getTrips)
      .mockResolvedValueOnce(activePage)
      .mockResolvedValueOnce({ items: [], page: { ...page.page, totalElements: 0, totalPages: 0 } })
    vi.mocked(tripApi.updateTrip).mockResolvedValue(archived)
    const store = useTripStore()
    await store.fetchTrips({ status: 'ACTIVE' })

    await store.updateTrip(trip.id, { status: 'ARCHIVED' })

    expect(store.trips).toEqual([])
    expect(store.page?.totalElements).toBe(0)
  })

  it('삭제된 여행을 목록에서 제거하고 페이지 개수를 줄인다', async () => {
    vi.mocked(tripApi.getTrips)
      .mockResolvedValueOnce(page)
      .mockResolvedValueOnce({ items: [], page: { ...page.page, totalElements: 0, totalPages: 0 } })
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

  it('페이지 경계에서 삭제 후 서버가 재배치한 항목을 다시 가져온다', async () => {
    const initialItems = Array.from({ length: 20 }, (_, index) => ({
      ...trip,
      id: `trip-${index + 1}`,
      title: `여행 ${index + 1}`,
    }))
    const movedTrip = { ...trip, id: 'trip-21', title: '여행 21' }
    vi.mocked(tripApi.getTrips)
      .mockResolvedValueOnce({
        items: initialItems,
        page: { ...page.page, totalElements: 21, totalPages: 2 },
      })
      .mockResolvedValueOnce({
        items: [...initialItems.slice(1), movedTrip],
        page: { ...page.page, totalElements: 20, totalPages: 1 },
      })
    vi.mocked(tripApi.deleteTrip).mockResolvedValue(undefined)
    const store = useTripStore()
    await store.fetchTrips({ page: 0, size: 20 })

    await store.deleteTrip('trip-1')

    expect(store.trips).toHaveLength(20)
    expect(store.trips.at(-1)).toEqual(movedTrip)
    expect(tripApi.getTrips).toHaveBeenLastCalledWith({ page: 0, size: 20 })
  })
})
