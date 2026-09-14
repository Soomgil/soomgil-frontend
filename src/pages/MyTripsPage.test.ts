import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import MyTripsPage from './MyTripsPage.vue'
import type { TripSummary } from '@/types/trip'

const geo = vi.hoisted(() => ({ searchLegalRegions: vi.fn() }))
const routing = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), query: {} as Record<string, string> }))
const itinerary = vi.hoisted(() => ({ createDay: vi.fn() }))
const tripApiMock = vi.hoisted(() => ({ createInvite: vi.fn() }))
const users = vi.hoisted(() => ({ searchUsers: vi.fn() }))

const trip = {
  id: 'trip-1',
  title: '새 부산 여행',
  displayDestination: '부산광역시',
  status: 'ACTIVE' as const,
  myRole: 'OWNER' as const,
  itineraryVersion: 0,
  createdAt: '2026-06-20T00:00:00Z',
}

const store = vi.hoisted(() => ({
  trips: [] as TripSummary[],
  loading: false,
  error: null as string | null,
  creating: false,
  loadingMore: false,
  loadMoreError: null as string | null,
  hasMoreTrips: false,
  fetchTrips: vi.fn().mockResolvedValue(undefined),
  fetchNextPage: vi.fn().mockResolvedValue(undefined),
  createTrip: vi.fn(),
}))

vi.mock('@/stores/trip.store', () => ({ useTripStore: () => store }))
vi.mock('@/stores/auth.store', () => ({
  useAuthStore: () => ({ user: { id: 'owner-1', displayName: '김숨길' } }),
}))
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: routing.push, replace: routing.replace }),
  useRoute: () => ({ query: routing.query }),
}))
vi.mock('@/api/geo.api', () => ({ geoApi: geo }))
vi.mock('@/api/itinerary.api', () => ({ itineraryApi: itinerary }))
vi.mock('@/api/trip.api', () => ({ tripApi: tripApiMock }))
vi.mock('@/api/user.api', () => ({ userApi: users }))

describe('MyTripsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    routing.query = {}
    store.trips = []
    store.loading = false
    store.error = null
    store.loadingMore = false
    store.loadMoreError = null
    store.hasMoreTrips = false
    store.createTrip.mockResolvedValue(trip)
    itinerary.createDay.mockImplementation((_tripId: string, request: { baseVersion: number }) => Promise.resolve({
      itineraryVersion: request.baseVersion + 1,
    }))
    tripApiMock.createInvite.mockResolvedValue({})
    users.searchUsers.mockResolvedValue({
      items: [],
      page: { page: 0, size: 8, totalElements: 0, totalPages: 0, sort: [] },
    })
    geo.searchLegalRegions.mockResolvedValue({
      items: [],
      page: { page: 0, size: 10, totalElements: 0, totalPages: 0, sort: [] },
    })
  })

  afterEach(() => vi.useRealTimers())

  it('보관됨 필터에서 여행 생성 후 진행 중 필터로 전환한다', async () => {
    const wrapper = mount(MyTripsPage, {
      global: {
        stubs: {
          AppHeader: true,
          TripAccessModal: true,
          TripSettingsModal: true,
        },
      },
    })
    await flushPromises()

    const archivedFilter = wrapper.findAll('button').find((button) => button.text() === '보관됨')
    expect(archivedFilter).toBeDefined()
    await archivedFilter!.trigger('click')
    await wrapper.get('button.btn.primary').trigger('click')
    await wrapper.get('input[name="title"]').setValue('새 부산 여행')
    vi.useFakeTimers()
    geo.searchLegalRegions.mockResolvedValue({
      items: [{
        code: '2600000000', name: '부산광역시', fullName: '부산광역시',
        level: 'SIDO', parentCode: null, isActive: true,
      }],
      page: { page: 0, size: 10, totalElements: 1, totalPages: 1, sort: [] },
    })
    await wrapper.get('input[name="displayDestination"]').setValue('부산광역시')
    await vi.advanceTimersByTimeAsync(300)
    await wrapper.get('[role="option"]').trigger('click')
    vi.useRealTimers()
    await wrapper.get('input[name="startDate"]').setValue('2026-10-01')
    await wrapper.get('input[name="endDate"]').setValue('2026-10-03')
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    const activeFilter = wrapper.findAll('button').find((button) => button.text() === '진행 중')
    expect(store.createTrip).toHaveBeenCalledWith({
      title: '새 부산 여행',
      displayDestination: '부산광역시',
      legalRegionCodes: ['2600000000'],
      startDate: '2026-10-01',
      endDate: '2026-10-03',
    })
    expect(activeFilter?.attributes('aria-pressed')).toBe('true')
  })

  it('새 여행 버튼을 누르면 생성 모달을 표시한다', async () => {
    const wrapper = mount(MyTripsPage, {
      global: {
        stubs: {
          AppHeader: true,
          TripAccessModal: true,
          TripSettingsModal: true,
        },
      },
    })

    await wrapper.get('button.btn.primary').trigger('click')

    expect(wrapper.get('.trip-create-modal').classes()).toContain('show')
    expect(wrapper.get('.trip-create-modal').attributes('aria-hidden')).toBe('false')
  })

  it('선택한 법정동 코드를 여행 생성 요청에 포함한다', async () => {
    vi.useFakeTimers()
    geo.searchLegalRegions.mockResolvedValue({
      items: [{
        code: '2600000000', name: '부산광역시', fullName: '부산광역시',
        level: 'SIDO', parentCode: null, isActive: true,
      }],
      page: { page: 0, size: 10, totalElements: 1, totalPages: 1, sort: [] },
    })
    const wrapper = mount(MyTripsPage, {
      global: {
        stubs: {
          AppHeader: true,
          TripAccessModal: true,
          TripSettingsModal: true,
        },
      },
    })
    await wrapper.get('button.btn.primary').trigger('click')
    await wrapper.get('input[name="title"]').setValue('부산 여행')
    await wrapper.get('input[name="displayDestination"]').setValue('부산')
    await vi.advanceTimersByTimeAsync(300)
    await wrapper.get('[role="option"]').trigger('click')
    await wrapper.get('input[name="startDate"]').setValue('2026-10-01')
    await wrapper.get('input[name="endDate"]').setValue('2026-10-03')
    await wrapper.get('form').trigger('submit')
    await Promise.resolve()

    expect(store.createTrip).toHaveBeenCalledWith({
      title: '부산 여행',
      displayDestination: '부산광역시',
      legalRegionCodes: ['2600000000'],
      startDate: '2026-10-01',
      endDate: '2026-10-03',
    })
    wrapper.unmount()
  })

  it('여행 기간과 동행자를 함께 정하고 투표 화면으로 바로 이동한다', async () => {
    vi.useFakeTimers()
    geo.searchLegalRegions.mockResolvedValue({
      items: [{
        code: '2600000000', name: '부산광역시', fullName: '부산광역시',
        level: 'SIDO', parentCode: null, isActive: true,
      }],
      page: { page: 0, size: 10, totalElements: 1, totalPages: 1, sort: [] },
    })
    users.searchUsers.mockResolvedValue({
      items: [{ id: 'friend-1', displayName: '민경철', profileImageUrl: null }],
      page: { page: 0, size: 8, totalElements: 1, totalPages: 1, sort: [] },
    })

    const wrapper = mount(MyTripsPage, {
      global: { stubs: { AppHeader: true, TripAccessModal: true, TripSettingsModal: true } },
    })
    await wrapper.get('button.btn.primary').trigger('click')
    await wrapper.get('input[name="title"]').setValue('부산 팀 여행')
    await wrapper.get('input[name="displayDestination"]').setValue('부산')
    await vi.advanceTimersByTimeAsync(300)
    await wrapper.get('[role="option"]').trigger('click')
    vi.useRealTimers()
    await wrapper.get('input[name="startDate"]').setValue('2026-10-01')
    await wrapper.get('input[name="endDate"]').setValue('2026-10-03')
    await wrapper.get('input[name="companionSearch"]').setValue('민경철')
    const searchButton = wrapper.findAll('button').find((button) => button.text() === '검색')!
    await searchButton.trigger('click')
    await flushPromises()
    await wrapper.get('[role="option"]').trigger('click')
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(itinerary.createDay).toHaveBeenNthCalledWith(1, 'trip-1', {
      baseVersion: 0,
      groupType: 'DAY',
      dayNumber: 1,
      date: '2026-10-01',
      sortOrder: 1,
    })
    expect(itinerary.createDay).toHaveBeenNthCalledWith(3, 'trip-1', expect.objectContaining({
      baseVersion: 2,
      groupType: 'DAY',
      dayNumber: 3,
      date: '2026-10-03',
    }))
    expect(itinerary.createDay).toHaveBeenNthCalledWith(4, 'trip-1', {
      baseVersion: 3,
      groupType: 'UNSCHEDULED',
      sortOrder: 4,
    })
    expect(tripApiMock.createInvite).toHaveBeenCalledWith('trip-1', { inviteeUserId: 'friend-1' })
    expect(routing.push).toHaveBeenCalledWith({ name: 'TripVote', params: { tripId: 'trip-1' } })
  })

  it('첫 진입에서 실제 여행 목록의 첫 페이지를 요청한다', async () => {
    mount(MyTripsPage, {
      global: { stubs: { AppHeader: true, TripAccessModal: true, TripSettingsModal: true } },
    })
    await flushPromises()

    expect(store.fetchTrips).toHaveBeenCalledWith({
      page: 0,
      size: 20,
      status: undefined,
      sort: ['createdAt,desc'],
    })
  })

  it('목록 실패를 표시하고 다시 시도한다', async () => {
    store.error = '여행 목록을 불러오지 못했습니다.'
    const wrapper = mount(MyTripsPage, {
      global: { stubs: { AppHeader: true, TripAccessModal: true, TripSettingsModal: true } },
    })
    await flushPromises()
    store.fetchTrips.mockClear()

    expect(wrapper.text()).toContain('여행 목록을 불러오지 못했습니다.')
    const retryButton = wrapper.findAll('button').find((button) => button.text() === '다시 시도')
    await retryButton!.trigger('click')
    expect(store.fetchTrips).toHaveBeenCalledWith({
      page: 0,
      size: 20,
      status: undefined,
      sort: ['createdAt,desc'],
    })
  })

  it('목록을 불러오는 동안 로딩 상태를 표시한다', () => {
    store.loading = true
    const wrapper = mount(MyTripsPage, {
      global: { stubs: { AppHeader: true, TripAccessModal: true, TripSettingsModal: true } },
    })

    expect(wrapper.find('.animate-spin').exists()).toBe(true)
  })

  it('다음 페이지가 있으면 여행 더 보기를 요청한다', async () => {
    store.trips = [trip]
    store.hasMoreTrips = true
    const wrapper = mount(MyTripsPage, {
      global: { stubs: { AppHeader: true, TripAccessModal: true, TripSettingsModal: true } },
    })

    const loadMoreButton = wrapper.findAll('button').find((button) => button.text() === '여행 더 보기')
    await loadMoreButton!.trigger('click')

    expect(store.fetchNextPage).toHaveBeenCalledOnce()
  })

  it('필터에 맞는 빈 상태 문구를 표시한다', async () => {
    const wrapper = mount(MyTripsPage, {
      global: { stubs: { AppHeader: true, TripAccessModal: true, TripSettingsModal: true } },
    })
    const archivedFilter = wrapper.findAll('button').find((button) => button.text() === '보관됨')
    await archivedFilter!.trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('보관한 여행이 없습니다.')
  })

  it('보관된 여행 필터에서도 깔끔한 여행 카드를 유지한다', async () => {
    store.trips = [{
      ...trip,
      id: 'archived-1',
      title: '지난 부산 여행',
      status: 'ARCHIVED',
      startDate: '2026-07-10',
      endDate: '2026-07-12',
    }]
    const wrapper = mount(MyTripsPage, {
      global: { stubs: { AppHeader: true, TripAccessModal: true, TripSettingsModal: true } },
    })
    await flushPromises()
    const archivedFilter = wrapper.findAll('button').find((button) => button.text() === '보관됨')!
    await archivedFilter.trigger('click')
    await flushPromises()

    expect(wrapper.find('.timeline-card').exists()).toBe(true)
    expect(wrapper.find('[data-testid="trip-ticket"]').exists()).toBe(false)
    expect(wrapper.text()).toContain('지난 부산 여행')
    expect(wrapper.text()).toContain('2026.07.10 - 2026.07.12')
  })

  it('보딩패스와 캐러셀 없이 여행 카드 목록만 표시한다', async () => {
    store.trips = [trip, { ...trip, id: 'trip-2', title: '두 번째 여행' }]
    const wrapper = mount(MyTripsPage, {
      global: { stubs: { AppHeader: true, TripAccessModal: true, TripSettingsModal: true } },
    })
    await flushPromises()

    expect(wrapper.find('.next-trip-panel').exists()).toBe(false)
    expect(wrapper.find('[data-testid="trip-ticket"]').exists()).toBe(false)
    expect(wrapper.find('.next-trip-nav').exists()).toBe(false)
    expect(wrapper.findAll('.timeline-card')).toHaveLength(2)
  })

  it('여행 커버를 불러오지 못하면 카드 아이콘으로 대체한다', async () => {
    store.trips = [{ ...trip, coverImageUrl: 'https://images.invalid/trip.jpg' }]
    const wrapper = mount(MyTripsPage, {
      global: { stubs: { AppHeader: true, TripAccessModal: true, TripSettingsModal: true } },
    })
    await flushPromises()

    await wrapper.get('.timeline-card-avatar-wrapper img').trigger('error')

    expect(wrapper.find('.timeline-card-avatar-wrapper img').exists()).toBe(false)
    expect(wrapper.get('.timeline-card-avatar-wrapper--placeholder').text()).toContain('travel_explore')
  })

  it('방장 카드에는 투표 버튼이 있고 누르면 투표 화면으로 이동한다', async () => {
    store.trips = [trip]
    const wrapper = mount(MyTripsPage, {
      global: { stubs: { AppHeader: true, TripAccessModal: true, TripSettingsModal: true } },
    })
    await flushPromises()

    const card = wrapper.get('.timeline-card')
    const voteButton = card.findAll('button').find((button) => button.text().includes('투표'))
    expect(voteButton, '방장 카드에 투표 버튼이 없다').toBeTruthy()

    await voteButton!.trigger('click')

    expect(routing.push).toHaveBeenCalledWith({ name: 'TripVote', params: { tripId: 'trip-1' } })
  })

  it('멤버 카드에는 투표 버튼을 보여주지 않는다', async () => {
    store.trips = [{ ...trip, id: 'trip-member', myRole: 'MEMBER' }]
    const wrapper = mount(MyTripsPage, {
      global: { stubs: { AppHeader: true, TripAccessModal: true, TripSettingsModal: true } },
    })
    await flushPromises()

    const card = wrapper.get('.timeline-card')
    expect(card.findAll('button').some((button) => button.text().includes('투표'))).toBe(false)
  })
  it('지역을 고르지 않으면 여행을 만들 수 없다', async () => {
    const wrapper = mount(MyTripsPage, {
      global: { stubs: { AppHeader: true, TripAccessModal: true, TripSettingsModal: true } },
    })
    await wrapper.get('button.btn.primary').trigger('click')
    await wrapper.get('input[name="title"]').setValue('지역 없는 여행')
    await wrapper.get('input[name="displayDestination"]').setValue('어딘가')
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(store.createTrip).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('지역을 검색해서 선택해 주세요')
  })
})
